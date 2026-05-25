-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Day 6 — admin_notes 컬럼 + cancel RPC force 옵션 (2026-05-25)               ║
-- ║                                                                       ║
-- ║ 1. consulting_bookings.admin_notes 추가 (운영자 메모, audit 컬럼 포함)      ║
-- ║ 2. cancel_consulting_booking RPC 확장 — p_force=true 면 24h 정책 우회      ║
-- ║    (강제 취소, 운영자 권한 한정 — API 단에서 master 검증)                       ║
-- ║                                                                       ║
-- ║ RLS: admin_notes 는 service_role 만 UPDATE (일반 사용자는 자기 booking row  ║
-- ║   조회 시 admin_notes 컬럼 SELECT 도 허용 X — 별도 정책으로 마스킹은 권장하나      ║
-- ║   필드 단위 RLS 가 복잡하므로 본 PR 은 API 응답에서 마스킹).                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. admin_notes 컬럼
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE consulting_bookings
  ADD COLUMN IF NOT EXISTS admin_notes TEXT CHECK (admin_notes IS NULL OR length(admin_notes) <= 2000),
  ADD COLUMN IF NOT EXISTS admin_notes_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes_updated_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_consulting_bookings_admin_notes
  ON consulting_bookings (admin_notes_updated_at DESC)
  WHERE admin_notes IS NOT NULL;

COMMENT ON COLUMN consulting_bookings.admin_notes IS
  '운영자 메모 — service_role 만 작성. 사용자에게 노출 X.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. cancel_consulting_booking — p_force 옵션 추가 (overload via OR REPLACE)
--    기존 3-arg 시그니처는 유지 (Day 4 라우트 호출자 보호). 신규 4-arg 추가.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_consulting_booking(
  p_user_id UUID,
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_booking RECORD;
  v_ent RECORD;
  v_active JSONB;
  v_entry JSONB;
  v_entry_idx INT;
  v_timed JSONB;
  v_ts_key TEXT;
  v_refunded_ts TEXT := NULL;
  v_min_cancel_at TIMESTAMPTZ;
BEGIN
  -- 1. booking 잠금 + 시각 정보 join
  SELECT b.id, b.user_id, b.time_slot_id, b.status, b.created_at, s.start_at
  INTO v_booking
  FROM consulting_bookings b
  JOIN consulting_time_slots s ON s.id = b.time_slot_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_not_found');
  END IF;
  -- 2. force=false 일 때만 본인 검증. force=true (admin) 는 우회.
  IF NOT p_force AND v_booking.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_owner');
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'currentStatus', v_booking.status);
  END IF;

  -- 3. 24시간 정책 — force=true 면 우회
  IF NOT p_force THEN
    v_min_cancel_at := v_booking.start_at - INTERVAL '24 hours';
    IF NOW() > v_min_cancel_at THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'cancellation_window_expired',
        'minCancelAt', v_min_cancel_at,
        'slotStartAt', v_booking.start_at
      );
    END IF;
  END IF;

  -- 4. booking UPDATE — force 일 땐 사유에 'admin_override' 자동 prefix
  UPDATE consulting_bookings
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = CASE
        WHEN p_force THEN COALESCE('admin_override: ' || p_reason, 'admin_override')
        ELSE p_reason
      END
  WHERE id = p_booking_id;

  -- 5. time_slot 복귀
  UPDATE consulting_time_slots
  SET status = 'available', updated_at = NOW()
  WHERE id = v_booking.time_slot_id;

  -- 6. entitlement 환불 — booking 의 실제 user_id 기준 (force 시에도 정확히)
  SELECT active INTO v_ent FROM user_entitlements WHERE user_id = v_booking.user_id FOR UPDATE;
  IF FOUND THEN
    v_active := COALESCE(v_ent.active, '[]'::jsonb);
    DECLARE
      v_latest_used_ms BIGINT := 0;
      v_picked_idx INT := -1;
      v_picked_ts TEXT;
      v_used_ms BIGINT;
    BEGIN
      FOR v_entry_idx IN 0..jsonb_array_length(v_active) - 1 LOOP
        v_entry := v_active->v_entry_idx;
        v_timed := v_entry #> '{bundleContents,consulting,timeSlots}';
        IF v_timed IS NULL THEN CONTINUE; END IF;
        FOR v_ts_key IN SELECT jsonb_object_keys(v_timed) LOOP
          IF NOT ((v_timed->v_ts_key) ? 'usedAt') THEN CONTINUE; END IF;
          IF ((v_timed->v_ts_key)->>'usedAt') IS NULL THEN CONTINUE; END IF;
          v_used_ms := EXTRACT(EPOCH FROM ((v_timed->v_ts_key)->>'usedAt')::timestamptz)::BIGINT * 1000;
          IF v_used_ms > v_latest_used_ms THEN
            v_latest_used_ms := v_used_ms;
            v_picked_idx := v_entry_idx;
            v_picked_ts := v_ts_key;
          END IF;
        END LOOP;
      END LOOP;

      IF v_picked_idx >= 0 THEN
        v_active := jsonb_set(
          v_active,
          ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'usedAt'],
          'null'::jsonb
        );
        v_active := jsonb_set(
          v_active,
          ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'],
          to_jsonb(COALESCE((v_active #>> ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'])::int, 0) + 1)
        );
        UPDATE user_entitlements SET active = v_active, updated_at = NOW() WHERE user_id = v_booking.user_id;
        v_refunded_ts := v_picked_ts;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bookingId', p_booking_id,
    'status', 'cancelled',
    'refundedTimeSlot', v_refunded_ts,
    'forced', p_force
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;

COMMENT ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT, BOOLEAN) IS
  'Day 4 + Day 6 — 예약 취소 트랜잭션. p_force=true 면 24h 정책 + 본인 소유 우회 (운영자 한정).';
