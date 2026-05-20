-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ universities.category 정밀화 (주요 ~50개교)                                 ║
-- ║                                                                       ║
-- ║ KCUE 시드 시 (schlDivNm, schlEstbNm) → 'private_local'/'national_local'  ║
-- ║ 의 보수적 default 만 사용. 본 마이그레이션에서 도메인 지식 기반 정확한 분류.            ║
-- ║                                                                       ║
-- ║ 카테고리 enum (initial_schema.sql 정의):                                    ║
-- ║   seoul_top      서울 SKY + 서강·성균관·한양 (상위권 서울 종합대학)                  ║
-- ║   seoul          서울권 주요 종합대학                                          ║
-- ║   national_flag  거점국립대학교 9개 (부산·경북·전남·전북·충남·충북·강원·제주·경상국립)     ║
-- ║   national_local 그 외 국립·공립                                            ║
-- ║   private_local  지방·서울외 사립                                            ║
-- ║   special        과학기술원·연구중심대학 (KAIST·POSTECH·UNIST·GIST·DGIST)     ║
-- ║                                                                       ║
-- ║ 정직성 (P-002): 본 마이그레이션은 명백한 분류만 다룸. 모호한 학교는 KCUE 기본       ║
-- ║ ('private_local' / 'national_local') 유지 — 별도 admin 검수로 확장.       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- special — 과학기술원 (4년제 + KAIST·POSTECH 포함)
-- ═══════════════════════════════════════════════════════════════════════
-- kaist, postech 는 legacy 에서 이미 'special'
UPDATE universities SET category = 'special' WHERE kcue_code = '0000250'; -- UNIST
UPDATE universities SET category = 'special' WHERE kcue_code = '0000381'; -- GIST
UPDATE universities SET category = 'special' WHERE kcue_code = '0000382'; -- DGIST

-- ═══════════════════════════════════════════════════════════════════════
-- national_flag — 거점국립대학교 9개
-- ═══════════════════════════════════════════════════════════════════════
-- pusan(부산대) 는 legacy 에서 이미 'national_flag'
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000005'; -- 경북대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000023'; -- 전남대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000025'; -- 전북대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000029'; -- 충남대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000030'; -- 충북대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000003'; -- 강원대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000027'; -- 제주대
UPDATE universities SET category = 'national_flag' WHERE kcue_code = '0000007'; -- 경상국립대

-- ═══════════════════════════════════════════════════════════════════════
-- seoul — 서울권 주요 종합대학 (hkuk legacy 외)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000040'; -- 서울시립대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000066'; -- 경희대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000175'; -- 중앙대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000163'; -- 이화여대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000052'; -- 건국대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000100'; -- 동국대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000138'; -- 세종대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000143'; -- 숭실대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000141'; -- 숙명여대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000078'; -- 국민대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000212'; -- 홍익대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000074'; -- 광운대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000109'; -- 명지대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000117'; -- 상명대
UPDATE universities SET category = 'seoul' WHERE kcue_code = '0000136'; -- 성신여대

-- ═══════════════════════════════════════════════════════════════════════
-- national_local — 거점 외 국립
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000008'; -- 국립공주대
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000010'; -- 국립금오공과대
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000013'; -- 국립부경대
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000033'; -- 국립한국해양대
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000034'; -- 국립한국교통대
UPDATE universities SET category = 'national_local' WHERE kcue_code = '0000039'; -- 국립한밭대

-- ═══════════════════════════════════════════════════════════════════════
-- private_local — 서울권 외 주요 사립 (수도권 광역 포함)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000063'; -- 가천대 (성남)
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000082'; -- 단국대 (용인)
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000146'; -- 아주대 (수원)
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000161'; -- 을지대 (의정부·대전)
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000169'; -- 인하대 (인천)
UPDATE universities SET category = 'private_local' WHERE kcue_code = '0000187'; -- 차의과학대 (포천)
