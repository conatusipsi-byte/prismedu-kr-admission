-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ profiles — 사용자 프로필 (Firestore users 컬렉션 대응)                   ║
-- ║                                                                       ║
-- ║ Supabase auth.users 는 인증 정보만 보유. 도메인 프로필 (이름·학년·꿈    ║
-- ║ 학교·플랜·사용량·알림 동의 등)은 본 테이블이 보유.                       ║
-- ║                                                                       ║
-- ║ id = auth.users.id 1:1 매핑. 가입 시 자동 INSERT 트리거 포함.            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text NOT NULL DEFAULT '',
  photo_url text,
  -- 학생 기본 정보
  grade text NOT NULL DEFAULT '',
  dream_school text NOT NULL DEFAULT '',
  major text NOT NULL DEFAULT '',
  -- 점수 캐시 (정식은 user_specs 에 — 본 컬럼은 빠른 표시용)
  gpa text,
  sat text,
  toefl text,
  -- 즐겨찾기·스냅샷 (커스텀 데이터)
  favorite_schools text[] NOT NULL DEFAULT '{}',
  snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 사용량 카운터 — 클라이언트 write 금지 (RLS), 서버 service_role 만 갱신
  ai_chat_count integer NOT NULL DEFAULT 0,
  ai_chat_date text,
  outline_used integer NOT NULL DEFAULT 0,
  essay_review_used integer NOT NULL DEFAULT 0,
  what_if_used integer NOT NULL DEFAULT 0,
  -- 온보딩·알림
  onboarded boolean NOT NULL DEFAULT false,
  notification_opt_in boolean NOT NULL DEFAULT false,
  spec_last_updated text,
  -- 메타
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_email_idx ON profiles (email);
CREATE INDEX profiles_onboarded_idx ON profiles (onboarded);

-- updated_at 자동 갱신
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- RLS — 본인 프로필만 read/write
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_read ON profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY profiles_self_update ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- INSERT 는 트리거(handle_new_user) 와 service_role 만. 일반 사용자는 SELECT/UPDATE 만.

-- ═══════════════════════════════════════════════════════════════════════
-- 자동 생성 트리거 — auth.users INSERT 시 profiles row 자동 생성
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

COMMENT ON TABLE profiles IS '사용자 프로필 (auth.users 와 1:1). 가입 시 자동 생성 트리거.';
