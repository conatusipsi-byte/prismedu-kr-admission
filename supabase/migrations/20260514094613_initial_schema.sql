-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ conatusipsi (한국 대학 입시 AI 추천) — 초기 스키마                       ║
-- ║                                                                       ║
-- ║ Firestore 도큐먼트 구조를 Postgres + JSONB 로 마이그레이션.              ║
-- ║ 마이그레이션 전략:                                                       ║
-- ║   - JSONB 적극 활용 — 도큐먼트 객체 모양 보존 (코드 변경 최소화)         ║
-- ║   - 핵심 FK + 인덱스만 정규화                                            ║
-- ║   - RLS 활성화 — 일반 사용자 보호 정책 포함                              ║
-- ║                                                                       ║
-- ║ 출처 매핑:                                                              ║
-- ║   - types/admission.ts (핵심 타입)                                      ║
-- ║   - firestore.rules (보안 정책 → RLS 어댑팅)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. universities — 대학 마스터
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE universities (
  id text PRIMARY KEY,
  n text NOT NULL,
  name_en text,
  short_name text,
  d text,
  category text NOT NULL CHECK (category IN (
    'seoul_top', 'seoul', 'national_flag', 'national_local', 'private_local', 'special'
  )),
  campuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  rank_order integer,
  admission_guide_url text,
  admission_office_contact jsonb,
  logo_url text,
  website_url text,
  active boolean NOT NULL DEFAULT true,
  merged_into text,
  closed_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX universities_category_active_idx ON universities (category, active);
CREATE INDEX universities_rank_order_idx ON universities (rank_order) WHERE active;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. departments — 학과 (모집단위)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE departments (
  id text NOT NULL,
  university_id text NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  campus_id text NOT NULL,
  name text NOT NULL,
  name_en text,
  unit_type text NOT NULL DEFAULT 'department'
    CHECK (unit_type IN ('department', 'division', 'broadcast')),
  track text NOT NULL CHECK (track IN (
    'humanities', 'social', 'natural', 'engineering',
    'medical', 'arts', 'interdisciplinary'
  )),
  total_quota integer NOT NULL DEFAULT 0,
  sub_departments text[],
  is_professional boolean DEFAULT false,
  professional_type text CHECK (professional_type IS NULL OR professional_type IN (
    'medical', 'dental', 'korean_medicine', 'pharmacy', 'veterinary', 'education', 'law'
  )),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (university_id, id)
);
CREATE INDEX departments_track_active_idx ON departments (track, active);
CREATE INDEX departments_university_active_idx ON departments (university_id, active);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. department_admissions — 학과별·연도별 모집요강
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE department_admissions (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  department_id text NOT NULL,
  year integer NOT NULL,
  tracks jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_track_kinds text[] NOT NULL DEFAULT '{}',
  prev_year_result jsonb,
  source jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (university_id, department_id) REFERENCES departments(university_id, id) ON DELETE CASCADE
);
CREATE INDEX dept_admissions_year_idx ON department_admissions (year);
CREATE INDEX dept_admissions_dept_year_idx ON department_admissions (university_id, department_id, year);
CREATE INDEX dept_admissions_track_kinds_idx ON department_admissions USING GIN (available_track_kinds);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. admissions_staging — ETL 검수 대기
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE admissions_staging (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  department_id text NOT NULL,
  year integer NOT NULL,
  tracks jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_track_kinds text[] NOT NULL DEFAULT '{}',
  prev_year_result jsonb,
  source jsonb NOT NULL,
  parser_trust_level text NOT NULL DEFAULT 'trusted'
    CHECK (parser_trust_level IN ('trusted', 'trusted-fallback', 'suspicious')),
  needs_review boolean NOT NULL DEFAULT true,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admissions_staging_review_idx ON admissions_staging (needs_review, year);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. user_specs — 학업 스펙 스냅샷
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE user_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of jsonb NOT NULL,
  school_record jsonb NOT NULL,
  csat jsonb,
  mock_exams jsonb,
  school_activity jsonb,
  intent jsonb,
  school_type text CHECK (school_type IS NULL OR school_type IN (
    'general', 'autonomous', 'special_purpose', 'specialized'
  )),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_specs_user_updated_idx ON user_specs (user_id, updated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. user_entitlements — 사용자 권한
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_plan text NOT NULL DEFAULT 'free'
    CHECK (current_plan IN ('free', 'pro', 'elite')),
  plan_source text NOT NULL DEFAULT 'free'
    CHECK (plan_source IN ('free', 'one_time', 'subscription')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. orders — 토스 결제
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_kind text NOT NULL CHECK (product_kind IN (
    'report_one', 'season_pass', 'consult_one', 'subscription_pro', 'subscription_elite'
  )),
  product_name text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'failed', 'refunded', 'cancelled')),
  period text NOT NULL DEFAULT 'once'
    CHECK (period IN ('once', 'monthly', 'yearly')),
  valid_from timestamptz,
  valid_until timestamptz,
  payment jsonb,
  refund jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_status_idx ON orders (user_id, status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. matches — 합격률 분석 결과
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE matches (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  results jsonb NOT NULL,
  preview jsonb,
  global_caveats jsonb,
  specs_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matches_user_created_idx ON matches (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. admission_results — 익명 합격 사례
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE admission_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id text NOT NULL,
  department_id text NOT NULL,
  year integer NOT NULL,
  track_kind text NOT NULL,
  track_name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'waitlist', 'rejected')),
  waitlist_rank integer,
  passed_stage1 boolean,
  spec_snapshot jsonb NOT NULL,
  feature_vector real[],
  confidence numeric(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL CHECK (source IN ('self_report', 'official_disclosure', 'media')),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (university_id, department_id) REFERENCES departments(university_id, id) ON DELETE CASCADE
);
CREATE INDEX admission_results_dept_year_track_verified_idx
  ON admission_results (university_id, department_id, year, track_kind, verified);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. admission_sample_stats — 합격사례 표본 집계
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE admission_sample_stats (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  department_id text NOT NULL,
  year integer NOT NULL,
  track_kind text NOT NULL,
  verified_count integer NOT NULL DEFAULT 0,
  weighted_count numeric NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  stage1_passed_count integer,
  stage2_accepted_count integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (university_id, department_id) REFERENCES departments(university_id, id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════
-- 11. ai_cache — Claude 호출 캐시
-- ═══════════════════════════════════════════════════════════════════════
-- expires_at은 generated column 으로 못 둠 (interval cast IMMUTABLE 아님).
-- 트리거로 INSERT/UPDATE 시 자동 계산.
CREATE TABLE ai_cache (
  cache_key text PRIMARY KEY,
  value jsonb NOT NULL,
  ttl_seconds integer NOT NULL CHECK (ttl_seconds > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ai_cache_expires_idx ON ai_cache (expires_at);

CREATE OR REPLACE FUNCTION ai_cache_set_expires() RETURNS trigger AS $$
BEGIN
  NEW.expires_at = NEW.created_at + make_interval(secs => NEW.ttl_seconds);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_cache_expires_trigger BEFORE INSERT OR UPDATE ON ai_cache
  FOR EACH ROW EXECUTE FUNCTION ai_cache_set_expires();

-- ═══════════════════════════════════════════════════════════════════════
-- 12. sanitize_events — AI 응답 sanitize 모니터링
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE sanitize_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id text,
  original_text text NOT NULL,
  sanitized_text text NOT NULL,
  trigger_reasons jsonb NOT NULL,
  triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sanitize_events_triggered_idx ON sanitize_events (triggered, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 13. conversation_messages — AI 챗 히스토리
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conv_msg_conv_created_idx ON conversation_messages (conversation_id, created_at);
CREATE INDEX conv_msg_user_created_idx ON conversation_messages (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 14. rate_limits — API 호출 제한
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE rate_limits (
  rate_key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expires_idx ON rate_limits (expires_at);

-- ═══════════════════════════════════════════════════════════════════════
-- 15. counselor_metrics — AI 카운슬러 성능 추적
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE counselor_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id text,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  duration_ms integer NOT NULL,
  source text NOT NULL CHECK (source IN ('anthropic', 'mock')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counselor_metrics_user_created_idx ON counselor_metrics (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- updated_at 자동 갱신 트리거
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER universities_updated_at BEFORE UPDATE ON universities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dept_admissions_updated_at BEFORE UPDATE ON department_admissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER admissions_staging_updated_at BEFORE UPDATE ON admissions_staging
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_specs_updated_at BEFORE UPDATE ON user_specs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_entitlements_updated_at BEFORE UPDATE ON user_entitlements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER admission_sample_stats_updated_at BEFORE UPDATE ON admission_sample_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
