-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ legacy departments active_override — KCUE 폐과 오마킹 보호                  ║
-- ║                                                                       ║
-- ║ KCUE SchoolMajorInfo 응답의 schlMjrStatNm = "폐과" 가 사실은 정상 운영      ║
-- ║ 중인 학과를 잘못 마킹한 경우가 있음. ETL sync 마다 active=false 로 덮어쓰는    ║
-- ║ 회귀를 방지하기 위해, admin 이 정상 운영을 확인한 학과는 override 플래그로      ║
-- ║ 보호한다.                                                                  ║
-- ║                                                                       ║
-- ║ 보호 메커니즘:                                                              ║
-- ║   - active_override IS NOT NULL  → KCUE sync 가 active 컬럼을 건드리지 않음 ║
-- ║   - active_override = true       → active 강제 true                       ║
-- ║   - active_override = false      → active 강제 false (의도적 비활성)         ║
-- ║                                                                       ║
-- ║ 본 마이그레이션은 클라이언트 확인 5건 (2026-05-21) 일괄 적용.                    ║
-- ║ ETL 스크립트는 sync 시 active_override 가 NULL 인 row 만 active 갱신.        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS active_override BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS active_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS active_override_at TIMESTAMPTZ;

COMMENT ON COLUMN departments.active_override IS
  'KCUE 자동 마킹 보호 플래그. NULL = ETL 자동값 사용 / true = 강제 활성 / false = 강제 비활성. KCUE sync 는 NULL 인 row 만 active 컬럼을 갱신.';
COMMENT ON COLUMN departments.active_override_reason IS
  '오버라이드 사유 (감사용)';
COMMENT ON COLUMN departments.active_override_at IS
  '오버라이드 적용 시각';

-- ═══════════════════════════════════════════════════════════════════════
-- 클라이언트 확인 5건 — 정상 운영 중이지만 KCUE 가 폐과로 마킹한 학과
-- ═══════════════════════════════════════════════════════════════════════
UPDATE departments
SET
  active = true,
  active_override = true,
  active_override_reason = '클라이언트 확인 — KCUE 폐과 마킹 오류 (2026-05-21)',
  active_override_at = NOW()
WHERE (university_id, id) IN (
  ('korea',  'computer-science'),
  ('korea',  'media'),
  ('korea',  'design-art'),
  ('sogang', 'computer-science'),
  ('pusan',  'info-comp')
);

-- 부분 인덱스 — override 적용 row 빠르게 조회 (감사·재검수 용도)
CREATE INDEX IF NOT EXISTS departments_active_override_idx
  ON departments (university_id, id)
  WHERE active_override IS NOT NULL;
