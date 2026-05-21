-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ 컨설팅 예약 시스템 — 신규 모듈 (계약 2026-05-21, +70만원)                       ║
-- ║                                                                       ║
-- ║ 3개 테이블 + RLS:                                                          ║
-- ║   1) consulting_time_slots     — 예약 가능 시간 슬롯 마스터                      ║
-- ║   2) consulting_applications   — 컨설팅 신청서 (학생/희망/질문)                  ║
-- ║   3) consulting_bookings       — 슬롯-신청서 결합 예약 레코드                    ║
-- ║                                                                       ║
-- ║ ProductKind 'consult_one' 의미 재정의:                                      ║
-- ║   기존: AI 카운슬러 1회 → 신규: 1:1 입시 컨설팅 60분 (방준현 대표).               ║
-- ║   결제 흐름 — 가격 placeholder 상태 (P-014, lib/plans.ts).                  ║
-- ║                                                                       ║
-- ║ 견적 제외 (계약서 제3조 — 본 마이그레이션·UI 모두 미구현):                            ║
-- ║   - 알림톡(카카오) / 외부 캘린더 연동 / 관리자 통계 / Zoom·Meet / 다중 컨설턴트.       ║
-- ║                                                                       ║
-- ║ 정직성 (P-002):                                                            ║
-- ║   - 24시간 전 취소 정책 — RLS 가 아닌 API 단에서 강제 (시간 계산 필요).            ║
-- ║   - 동시 예약 방지 — bookings.time_slot_id UNIQUE + INSERT 충돌 → 409.       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. consulting_time_slots — 예약 가능 시간 마스터
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE consulting_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'blocked')),
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  -- end > start 검증 (시간 데이터 일관성)
  CONSTRAINT consulting_time_slots_valid_range CHECK (end_at > start_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 가용 슬롯만 빠르게 조회 (캘린더 UI). status='available' partial index.
CREATE INDEX idx_consulting_time_slots_available
  ON consulting_time_slots (start_at)
  WHERE status = 'available';

-- 전체 슬롯 admin 조회 — status 별 필터
CREATE INDEX idx_consulting_time_slots_status_start
  ON consulting_time_slots (status, start_at DESC);

COMMENT ON TABLE consulting_time_slots IS
  '컨설팅 가능 시간 슬롯 마스터. admin 이 사전 등록 후 사용자가 예약 시 status=booked 로 전환.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. consulting_applications — 컨설팅 신청서 (학생·주제·질문)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE consulting_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_grade INTEGER NOT NULL CHECK (student_grade IN (1, 2, 3)),
  high_school TEXT,
  -- 상담 주제 — 다중 선택 (정시/수시/학종/논술/진로 등)
  consultation_topics TEXT[] NOT NULL CHECK (array_length(consultation_topics, 1) >= 1),
  current_grades TEXT,
  -- 희망 대학 — 최대 5개 (API 단에서 강제)
  target_universities TEXT[],
  questions TEXT NOT NULL CHECK (length(questions) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consulting_applications_user
  ON consulting_applications (user_id, created_at DESC);

COMMENT ON TABLE consulting_applications IS
  '컨설팅 신청서 — 학생 정보·상담 주제·희망 대학·질문. 본인만 CRUD.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. consulting_bookings — 슬롯·신청서 결합 예약 레코드
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE consulting_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_slot_id UUID NOT NULL REFERENCES consulting_time_slots(id),
  application_id UUID REFERENCES consulting_applications(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 동시 예약 방지 — 같은 슬롯에 두 예약 X
  UNIQUE(time_slot_id)
);

-- 본인 예약 이력 조회 (MyBookings)
CREATE INDEX idx_consulting_bookings_user_status
  ON consulting_bookings (user_id, status, created_at DESC);
-- admin 예약 조회 (날짜별)
CREATE INDEX idx_consulting_bookings_status_created
  ON consulting_bookings (status, created_at DESC);

COMMENT ON TABLE consulting_bookings IS
  '컨설팅 예약 — time_slot 과 application 결합. time_slot UNIQUE 로 동시 예약 차단.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. updated_at 트리거 — 기존 set_updated_at() 재사용
--    (lib search_path 는 20260521210000 에서 public,pg_temp 고정됨)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER consulting_time_slots_updated_at
  BEFORE UPDATE ON consulting_time_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER consulting_applications_updated_at
  BEFORE UPDATE ON consulting_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. RLS 정책
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE consulting_time_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulting_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulting_bookings     ENABLE ROW LEVEL SECURITY;

-- time_slots — anon/auth SELECT (available 만, 캘린더 공개 노출).
-- INSERT/UPDATE/DELETE → service_role (admin 이 슬롯 등록).
CREATE POLICY "time_slots_anon_read_available"
  ON consulting_time_slots FOR SELECT
  TO anon, authenticated
  USING (status = 'available');

-- applications — 본인 CRUD.
CREATE POLICY "applications_self_all"
  ON consulting_applications FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- bookings — 본인 SELECT + INSERT + cancelled 전환만 허용.
-- completed/no_show 전환은 service_role(admin) 전용.
CREATE POLICY "bookings_self_read"
  ON consulting_bookings FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "bookings_self_insert"
  ON consulting_bookings FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE — confirmed → cancelled 만 허용 (24시간 전 검증은 API 단).
CREATE POLICY "bookings_self_cancel"
  ON consulting_bookings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id AND status = 'confirmed')
  WITH CHECK ((select auth.uid()) = user_id AND status = 'cancelled');
