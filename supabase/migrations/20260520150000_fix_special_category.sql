-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ category=special 잘못 매핑 보정                                              ║
-- ║                                                                       ║
-- ║ KCUE sync mapCategory() 가 schlDivNm 에 "전문" 포함 시 'special' 로 분류     ║
-- ║ 했지만, 실제 'special' enum 의도는 과학기술원·연구중심대학(KAIST·POSTECH·    ║
-- ║ UNIST·GIST·DGIST). 전문대학은 사립·공립 분류로 재분류.                       ║
-- ║                                                                       ║
-- ║ 보정 규칙:                                                                 ║
-- ║   - KAIST/POSTECH/UNIST/GIST/DGIST 는 'special' 유지                    ║
-- ║   - 나머지 (모두 KCUE 자동분류로 들어간 전문대학) → 'private_local'           ║
-- ║                                                                       ║
-- ║ TODO: 전문대학 중 공립 (예: 인천재능대 등) 은 'national_local' 로            ║
-- ║       세분화 가능 — schlEstbNm 정보를 별도 캐싱 후 정밀화.                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

UPDATE universities
SET category = 'private_local'
WHERE category = 'special'
  AND id NOT IN ('kaist', 'postech')
  AND kcue_code NOT IN ('0000250', '0000381', '0000382');
