-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ admins — 운영자 권한 (Firestore admins 컬렉션 대응)                      ║
-- ║                                                                       ║
-- ║ requireMasterAuth 가 본 테이블의 active=true 여부로 master 권한 판정.   ║
-- ║ MASTER_EMAILS 환경변수로 운영자 자동 부트스트랩.                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admins_active_email_idx ON admins (active, email);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 본인 admins row 만 read (다른 운영자 정보 안 보임). 모든 write 는 service_role.
CREATE POLICY admins_self_read ON admins FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER admins_updated_at BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE admins IS '운영자 권한 — requireMasterAuth 가 active=true 여부로 판정';
