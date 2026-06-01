-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ P1-2 fix — 컨설팅 취소→재예약 가능 (2026-06-01)                              ║
-- ║                                                                       ║
-- ║ [문제] consulting_bookings_time_slot_id_key = 전체(total) UNIQUE.        ║
-- ║   취소는 row 를 삭제하지 않고 status='cancelled' 로만 남김(이력 보존) →        ║
-- ║   slot 이 available 로 복귀해도 재예약 INSERT 가 unique_violation →         ║
-- ║   create RPC 가 slot_unavailable 반환 → 슬롯 영구 차단.                      ║
-- ║                                                                       ║
-- ║ [수정] total UNIQUE → partial UNIQUE (status <> 'cancelled').            ║
-- ║   - 비취소(confirmed/completed/no_show) 예약은 slot 당 1개만 = 더블부킹 차단. ║
-- ║   - cancelled row 는 인덱스에서 제외 → 재예약(신규 confirmed INSERT) 허용.    ║
-- ║   - create RPC 의 unique_violation 백스톱은 그대로 동작(활성 예약 존재 시만   ║
-- ║     발생) → 동시 race 차단 유지. RPC 본문 변경 불필요.                        ║
-- ║                                                                       ║
-- ║ 안전: 적용 시점 slot 당 booking row ≤ 1 (기존 total 제약) → partial unique  ║
-- ║   생성이 기존 데이터를 위반하지 않음.                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 1. 전체 UNIQUE 제약 제거 (제약명 = 백킹 인덱스명 consulting_bookings_time_slot_id_key)
ALTER TABLE consulting_bookings
  DROP CONSTRAINT IF EXISTS consulting_bookings_time_slot_id_key;

-- 2. partial UNIQUE — 비취소 예약만 slot 당 유일
CREATE UNIQUE INDEX IF NOT EXISTS consulting_bookings_active_slot_uniq
  ON consulting_bookings (time_slot_id)
  WHERE status <> 'cancelled';

COMMENT ON INDEX consulting_bookings_active_slot_uniq IS
  'slot 당 비취소(confirmed/completed/no_show) 예약 1개만 — cancelled 제외로 재예약 허용 + 더블부킹/동시 race 차단.';

-- 3. cancel RPC 3-arg 제거 → 4-arg(p_force) 단일화 (유지보수 함정 제거).
--    사용자 route 는 p_force=false 명시 호출로 전환됨. admin route 는 p_force=true.
DROP FUNCTION IF EXISTS public.cancel_consulting_booking(UUID, UUID, TEXT);
