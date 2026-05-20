-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ KCUE 통합 2차 — slug · 학과 필터 컬럼 · CSAT 통계                          ║
-- ║                                                                       ║
-- ║ 1) universities.slug      URL 라우팅용 영문 슬러그                          ║
-- ║ 2) departments.degree_course · daytime  학과 표시 필터용                  ║
-- ║ 3) csat_grade_cuts · csat_attendance  KICE 수능 통계                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. universities.slug — 영문 URL 슬러그
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE universities
  ADD COLUMN IF NOT EXISTS slug text;

-- 기존 legacy 행은 id 그대로 슬러그 backfill (snu, postech 등)
UPDATE universities SET slug = id WHERE slug IS NULL AND kcue_code IS NULL;
-- KCUE 행은 kcue_<schlId> 형태로 fallback backfill (나중에 일부는 영문 슬러그로 update)
UPDATE universities SET slug = id WHERE slug IS NULL;

-- 슬러그 unique 제약 — partial (NULL 허용)
CREATE UNIQUE INDEX IF NOT EXISTS universities_slug_uidx ON universities (slug);

COMMENT ON COLUMN universities.slug IS
  'URL 라우팅용 영문 슬러그 (예: snu, postech, yonsei-university). legacy id 와 호환되도록 별도 컬럼.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. departments — 학위과정·주야 분리 컬럼
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS degree_course text,
  ADD COLUMN IF NOT EXISTS daytime text;

-- 기존 KCUE row 의 id 포맷 `<kediMjrId>-<deg>-<day>` 에서 역추출 backfill
UPDATE departments
SET degree_course = CASE
    WHEN id LIKE '%-ba-%'  THEN '학사'
    WHEN id LIKE '%-ma-%'  THEN '석사'
    WHEN id LIKE '%-phd-%' THEN '박사'
    WHEN id LIKE '%-ass-%' THEN '전문학사'
    ELSE NULL
  END,
  daytime = CASE
    WHEN id LIKE '%-d' THEN '주간'
    WHEN id LIKE '%-n' THEN '야간'
    ELSE NULL
  END
WHERE kedi_mjr_id IS NOT NULL
  AND (degree_course IS NULL OR daytime IS NULL);

-- legacy row 들은 학사·주간이 기본 (수동 입력된 schools)
UPDATE departments
SET degree_course = '학사',
    daytime = '주간'
WHERE kedi_mjr_id IS NULL
  AND degree_course IS NULL;

CREATE INDEX IF NOT EXISTS departments_filter_idx
  ON departments (university_id, active, degree_course, daytime);

COMMENT ON COLUMN departments.degree_course IS
  '학위과정: 학사 / 석사 / 박사 / 전문학사. KCUE pbnfDgriCrseDivNm 매핑.';
COMMENT ON COLUMN departments.daytime IS
  '주간 / 야간. KCUE dghtDivNm 매핑.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. csat_grade_cuts — KICE 등급구분·표준점수
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS csat_grade_cuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_kind text NOT NULL CHECK (exam_kind IN ('main', 'mock_jun', 'mock_sep', 'mock_other')),
  exam_year integer NOT NULL,        -- 학년도 (예: 2026 학년도 본수능 = 2025 시행)
  exam_date date NOT NULL,           -- 실 시행일 (CSV 파일명 yyyymmdd 추출)
  subject text NOT NULL,             -- 국어 / 수학 / 영어 / 탐구 / 한국사 / 제2외국어·한문
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 9),
  cut_score integer NOT NULL,        -- 표준점수 컷 (영어·한국사는 원점수)
  population_count integer,          -- 해당 등급 인원
  ratio_percent numeric(5, 2),       -- 해당 등급 비율
  source text NOT NULL DEFAULT 'kice_csv',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_kind, exam_date, subject, grade)
);
CREATE INDEX IF NOT EXISTS csat_grade_cuts_subject_grade_idx
  ON csat_grade_cuts (subject, grade, exam_year DESC);

COMMENT ON TABLE csat_grade_cuts IS
  'KICE 수능 등급컷·표준점수 (출처: 한국교육과정평가원 공개 자료). 본수능·모의평가 통합.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. csat_attendance — KICE 연도별 응시현황
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS csat_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_year integer NOT NULL,          -- 학년도
  exam_date date NOT NULL,             -- 시행일
  applied_count integer NOT NULL,      -- 지원인원
  attended_count integer NOT NULL,     -- 응시인원
  attended_ratio numeric(5, 2),        -- 응시율 %
  source text NOT NULL DEFAULT 'kice_csv',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_year, exam_date)
);
CREATE INDEX IF NOT EXISTS csat_attendance_year_idx ON csat_attendance (exam_year DESC);

COMMENT ON TABLE csat_attendance IS
  'KICE 수능 연도별 응시현황 (출처: 한국교육과정평가원 공개 자료).';
