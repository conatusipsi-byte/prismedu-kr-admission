-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ KCUE / 대학알리미 외부코드 매핑                                          ║
-- ║                                                                       ║
-- ║ academyinfo.go.kr 의 학교/학과 식별자를 우리 슬러그 기반 PK 와 분리해서  ║
-- ║ 외부코드 컬럼으로 보존. ETL 시드 멱등성과 추후 인사이트 매칭에 사용.       ║
-- ║                                                                       ║
-- ║   - universities.kcue_code      7자리 문자열 (예: '0000100' = 동국대)   ║
-- ║   - departments.kedi_mjr_id     KEDI 전공 ID (예: 'U04080100427')      ║
-- ║   - departments.std_clft_mjr_id 표준분류 전공 ID (예: 'D15090')         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- universities — KCUE 학교코드
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE universities
  ADD COLUMN IF NOT EXISTS kcue_code text,
  ADD COLUMN IF NOT EXISTS kcue_synced_at timestamptz;

-- NULL 허용 + 비어있지 않은 값은 unique. 일부 기존 대학은 KCUE 코드 매핑 전.
CREATE UNIQUE INDEX IF NOT EXISTS universities_kcue_code_uidx
  ON universities (kcue_code)
  WHERE kcue_code IS NOT NULL;

COMMENT ON COLUMN universities.kcue_code IS
  '대학알리미(academyinfo.go.kr) 학교코드(schlId). 7자리 zero-padded 문자열.';
COMMENT ON COLUMN universities.kcue_synced_at IS
  '마지막 KCUE 동기화 시각 — sync 스크립트가 갱신';

-- ═══════════════════════════════════════════════════════════════════════
-- departments — KEDI 전공 ID + 표준분류 전공 ID
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS kedi_mjr_id text,
  ADD COLUMN IF NOT EXISTS std_clft_mjr_id text,
  ADD COLUMN IF NOT EXISTS kcue_synced_at timestamptz;

-- (university_id, kedi_mjr_id) 가 KCUE 학과 멱등 키. 같은 KEDI ID 가 학교 간에는
-- 중복될 수 있으므로 university 안에서만 unique.
CREATE UNIQUE INDEX IF NOT EXISTS departments_kedi_mjr_id_uidx
  ON departments (university_id, kedi_mjr_id)
  WHERE kedi_mjr_id IS NOT NULL;

COMMENT ON COLUMN departments.kedi_mjr_id IS
  'KEDI 전공 ID — SchoolMajorInfoService.getSchoolMajorInfo 의 kediMjrId. 학과 unique key.';
COMMENT ON COLUMN departments.std_clft_mjr_id IS
  '표준분류 전공 ID — 학문 분류용 (예: D15090).';
COMMENT ON COLUMN departments.kcue_synced_at IS
  '마지막 KCUE 동기화 시각.';
