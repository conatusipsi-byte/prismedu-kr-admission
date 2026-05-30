-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ inquiries — 사용자 문의·시스템 개선 요청 + 운영자 이메일 답변 (2026-05-30).             ║
-- ║                                                                       ║
-- ║ 흐름:                                                                   ║
-- ║   1) 사용자가 /inquiries 에서 문의 작성 (category = improvement | question).  ║
-- ║   2) 운영자가 /admin/inquiries 에서 답변 작성 → status=answered, admin_response. ║
-- ║   3) API 가 sendInquiryResponse 비동기 호출 → Resend 발송 (실패해도 답변 저장 성공). ║
-- ║                                                                       ║
-- ║ email NULL 안전 (카카오 가입자):                                          ║
-- ║   - user_id 가 있어도 user.email NULL 가능 (카카오 OAuth biz 미전환 케이스). ║
-- ║   - contact_email 컬럼이 폴백. 둘 다 없으면 발송 skip + response_email_error. ║
-- ║                                                                       ║
-- ║ RLS:                                                                   ║
-- ║   - SELECT: 본인 문의만 조회.                                              ║
-- ║   - INSERT: authenticated 본인 user_id 일치.                              ║
-- ║   - UPDATE/DELETE: service_role 전용 (admin API 가 처리).                  ║
-- ║   - 비로그인 인입은 API 가 service_role 로 직접 INSERT (rate-limit 별도 적용). ║
-- ║                                                                       ║
-- ║ 정직성 (P-002):                                                         ║
-- ║   - admin_response NULL ↔ answered_at NULL 동기화 (반쪽 답변 차단).        ║
-- ║   - response_email_sent_at / response_email_error 로 발송 결과 투명화.    ║
-- ║   - 사용자에게 노출되는 컬럼: title/body/category/status/admin_response/answered_at. ║
-- ║                                                                       ║
-- ║ 향후 확장 (본 마이그레이션 외):                                            ║
-- ║   - 카카오 알림톡 채널 — biz 채널 + 템플릿 심사(1~2주) 필요 → 별도 작업.       ║
-- ║   - 발송 채널 추상화는 코드 단 (lib/notify/inquiry-response.ts) 에서 처리.   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- improvement: 시스템 개선 요청 / question: 일반 문의
  category TEXT NOT NULL CHECK (category IN ('improvement', 'question')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  -- 비로그인 인입 또는 user.email 폴백용 별도 이메일.
  contact_email TEXT CHECK (contact_email IS NULL OR contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'answered', 'closed')),
  admin_response TEXT CHECK (admin_response IS NULL OR char_length(admin_response) <= 10000),
  answered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  -- 이메일 발송 결과 (비동기 — 답변 저장과 분리)
  response_email_sent_at TIMESTAMPTZ,
  response_email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 반쪽 답변 차단 (admin_response 와 answered_at 동기화)
  CONSTRAINT inquiries_response_sync CHECK (
    (admin_response IS NULL AND answered_at IS NULL) OR
    (admin_response IS NOT NULL AND answered_at IS NOT NULL)
  ),
  -- 회신 경로 보장 (user_id 없으면 contact_email 필수)
  CONSTRAINT inquiries_contact_present CHECK (
    user_id IS NOT NULL OR contact_email IS NOT NULL
  )
);

-- 본인 이력 조회 (사용자 페이지)
CREATE INDEX idx_inquiries_user_created
  ON inquiries (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
-- 운영자 탭별 조회 (대기/답변완료/종료)
CREATE INDEX idx_inquiries_status_created
  ON inquiries (status, created_at DESC);

COMMENT ON TABLE inquiries IS
  '사용자 문의·시스템 개선 요청. 운영자 답변 시 Resend 로 이메일 발송 (비동기).';
COMMENT ON COLUMN inquiries.contact_email IS
  'user.email NULL (카카오 가입자) 또는 비로그인 인입 시 회신 주소.';
COMMENT ON COLUMN inquiries.response_email_error IS
  '이메일 발송 실패 사유 (NULL = 성공 또는 미발송). 답변 저장 자체는 성공.';

-- updated_at 트리거 — 기존 set_updated_at() 재사용
CREATE TRIGGER inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- RLS — 본인 격리. 답변/상태 변경은 service_role.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- 본인 SELECT — 다른 사용자 문의 비노출
CREATE POLICY "inquiries_self_read"
  ON inquiries FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 본인 INSERT — user_id 일치
CREATE POLICY "inquiries_self_insert"
  ON inquiries FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE/DELETE 정책 없음 → service_role 전용 (admin API).
