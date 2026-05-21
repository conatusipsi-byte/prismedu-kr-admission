-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ universities.category v2 — 5+1 카테고리 재설계                              ║
-- ║                                                                       ║
-- ║ 배경:                                                                      ║
-- ║   기존 6개 카테고리(seoul_top·seoul·national_flag·national_local·          ║
-- ║   private_local·special) 가 ① "서울 상위권 vs 서울권" 구분의 모호함,          ║
-- ║   ② 경기·인천 사립이 "지방사립"으로 들어가 사용자 멘탈모델과 불일치,             ║
-- ║   ③ 거점국립 vs 그 외 국립을 사용자가 구분 안 함, 의 문제로 클라이언트          ║
-- ║   요청에 따라 재설계 (2026-05-21).                                          ║
-- ║                                                                       ║
-- ║ 신규 카테고리:                                                              ║
-- ║   seoul          서울권 (= 기존 seoul_top + seoul 통합)                    ║
-- ║   gyeonggi       경기권 (= 신규, 경기·인천 소재 사립·국립)                       ║
-- ║   national       지방국립 (= 기존 national_flag + national_local 통합)     ║
-- ║   private_local  지방사립 (= 비서울·비경기 사립)                                ║
-- ║   special        특수대학 (= KAIST·POSTECH·UNIST·GIST·DGIST 5곳만)         ║
-- ║   military       사관학교 (UI 필터 미노출 / DB 보존)                           ║
-- ║                                                                       ║
-- ║ 교대 처리:                                                                  ║
-- ║   - 서울교대 → seoul                                                       ║
-- ║   - 그 외 교대 (경인·춘천·청주·전주·부산·대구·진주·광주·공주·제주) → national      ║
-- ║                                                                       ║
-- ║ ⚠️ 정직성 (P-002):                                                          ║
-- ║   - 경기권 분리는 KCUE 코드 명시 매핑 학교만 (도메인 지식 검증된 ID).              ║
-- ║   - location/region 컬럼이 universities 에 없으므로(campuses jsonb 만 존재) ║
-- ║     모호한 학교는 기존 분류 유지 (KCUE default = private_local).               ║
-- ║   - 추후 admin 시각 검수로 확장 (이 마이그레이션은 보수적 1차 매핑).               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. CHECK 제약 임시 해제 — 신규 enum 값으로 UPDATE 가능하게
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE universities DROP CONSTRAINT IF EXISTS universities_category_check;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. seoul_top → seoul 통합 (SKY·서성한·외대 등)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'seoul' WHERE category = 'seoul_top';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. national_flag + national_local → national 통합
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'national' WHERE category IN ('national_flag', 'national_local');

-- ═══════════════════════════════════════════════════════════════════════
-- 4. special 정리 — 5개 과학기술원만 유지, 나머지는 (있을 경우) private_local 로
--    이미 20260520150000_fix_special_category.sql 가 처리했지만 멱등 재확인.
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities
SET category = 'private_local'
WHERE category = 'special'
  AND id NOT IN ('kaist', 'postech')
  AND kcue_code NOT IN ('0000250', '0000381', '0000382');

-- ═══════════════════════════════════════════════════════════════════════
-- 5. 경기권 분리 — KCUE 코드 명시 매핑 (도메인 지식, location 컬럼 미존재).
--    location 데이터 부재로 인해 보수적으로 알려진 학교만 분류.
--    20260520143000 가 private_local 로 분류했던 KCUE 매핑 학교 중 경기·인천 소재만 이동.
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'gyeonggi' WHERE kcue_code = '0000063'; -- 가천대 (성남)
UPDATE universities SET category = 'gyeonggi' WHERE kcue_code = '0000082'; -- 단국대 (용인)
UPDATE universities SET category = 'gyeonggi' WHERE kcue_code = '0000146'; -- 아주대 (수원)
UPDATE universities SET category = 'gyeonggi' WHERE kcue_code = '0000169'; -- 인하대 (인천)
UPDATE universities SET category = 'gyeonggi' WHERE kcue_code = '0000187'; -- 차의과학대 (포천)
-- 을지대(0000161) 는 의정부·대전 양 캠퍼스 — 보수적으로 private_local 유지 (admin 검수 후 확장)

-- ═══════════════════════════════════════════════════════════════════════
-- 6. 교대 분리 — 학교명 매칭 (KCUE 시드에 일부 포함될 수 있음)
--    서울교대 → seoul, 그 외 → national
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'seoul'
  WHERE n LIKE '%서울교육대%' OR n LIKE '%서울교대%';

UPDATE universities SET category = 'national'
  WHERE (
    n LIKE '%경인교육대%' OR n LIKE '%경인교대%' OR
    n LIKE '%춘천교육대%' OR n LIKE '%춘천교대%' OR
    n LIKE '%청주교육대%' OR n LIKE '%청주교대%' OR
    n LIKE '%전주교육대%' OR n LIKE '%전주교대%' OR
    n LIKE '%부산교육대%' OR n LIKE '%부산교대%' OR
    n LIKE '%대구교육대%' OR n LIKE '%대구교대%' OR
    n LIKE '%진주교육대%' OR n LIKE '%진주교대%' OR
    n LIKE '%광주교육대%' OR n LIKE '%광주교대%' OR
    n LIKE '%공주교육대%' OR n LIKE '%공주교대%' OR
    n LIKE '%제주교육대%' OR n LIKE '%제주교대%'
  )
  AND category <> 'seoul'; -- 서울교대 보호

-- ═══════════════════════════════════════════════════════════════════════
-- 7. 사관학교 — military 카테고리. 학교명 매칭으로 시드된 row 가 있으면 보정.
--    UI 필터에서는 노출 X (DB 보존만).
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'military'
  WHERE n LIKE '%육군사관학교%' OR n LIKE '%해군사관학교%' OR n LIKE '%공군사관학교%'
     OR n LIKE '%국군간호사관학교%' OR n LIKE '%국방대%' OR n LIKE '%육사' OR n LIKE '%해사' OR n LIKE '%공사';

-- ═══════════════════════════════════════════════════════════════════════
-- 8. CHECK 제약 재추가 — 신규 enum 으로
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE universities
  ADD CONSTRAINT universities_category_check
  CHECK (category IN (
    'seoul', 'gyeonggi', 'national', 'private_local', 'special', 'military'
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 9. 인덱스 재확인 — 기존 universities_category_active_idx 는 그대로 사용 가능
--    (컬럼 이름·타입 동일). 별도 작업 불필요.
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN universities.category IS
  '대학 분류 v2 (2026-05-21~): seoul / gyeonggi / national / private_local / special / military. military 는 UI 필터 미노출.';
