-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ universities.slug 친화적 영문 슬러그 backfill                                ║
-- ║                                                                       ║
-- ║ 매핑 전략:                                                                 ║
-- ║   - legacy 학교 (snu, postech, …)   기존 id 그대로 (이미 backfill)             ║
-- ║   - 주요 KCUE 학교 (37개)           영문 약칭 / 정식명 슬러그                     ║
-- ║   - 나머지 KCUE (≈274개)            kcue_<schlId> fallback (이미 backfill)   ║
-- ║                                                                       ║
-- ║ URL 라우트 (/admissions/[universityId]) 는 id OR slug 양쪽 lookup 으로     ║
-- ║ 변경 — application 코드에서 처리. 본 마이그레이션은 컬럼 값만.                     ║
-- ║                                                                       ║
-- ║ 출처: 각 학교 영문 공식 명칭 또는 일반화된 약칭 (KCUE engNm 미제공, 도메인 지식).        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

UPDATE universities SET slug = 'kangwon'            WHERE kcue_code = '0000003';
UPDATE universities SET slug = 'knu'                WHERE kcue_code = '0000005'; -- 경북대 Kyungpook National
UPDATE universities SET slug = 'gnu'                WHERE kcue_code = '0000007'; -- 경상국립대 Gyeongsang National
UPDATE universities SET slug = 'kongju'             WHERE kcue_code = '0000008';
UPDATE universities SET slug = 'kumoh'              WHERE kcue_code = '0000010';
UPDATE universities SET slug = 'pknu'               WHERE kcue_code = '0000013'; -- 부경대 Pukyong National
UPDATE universities SET slug = 'jnu'                WHERE kcue_code = '0000023'; -- 전남대 Jeonnam (Chonnam) Nat'l
UPDATE universities SET slug = 'jbnu'               WHERE kcue_code = '0000025'; -- 전북대 Jeonbuk Nat'l
UPDATE universities SET slug = 'jejunu'             WHERE kcue_code = '0000027';
UPDATE universities SET slug = 'cnu'                WHERE kcue_code = '0000029'; -- 충남대 Chungnam Nat'l
UPDATE universities SET slug = 'cbnu'               WHERE kcue_code = '0000030'; -- 충북대 Chungbuk Nat'l
UPDATE universities SET slug = 'kmou'               WHERE kcue_code = '0000033'; -- 한국해양대
UPDATE universities SET slug = 'ut'                 WHERE kcue_code = '0000034'; -- 한국교통대
UPDATE universities SET slug = 'hanbat'             WHERE kcue_code = '0000039';
UPDATE universities SET slug = 'uos'                WHERE kcue_code = '0000040'; -- 서울시립대 Univ. of Seoul
UPDATE universities SET slug = 'konkuk'             WHERE kcue_code = '0000052';
UPDATE universities SET slug = 'gachon'             WHERE kcue_code = '0000063';
UPDATE universities SET slug = 'khu'                WHERE kcue_code = '0000066'; -- 경희대 Kyung Hee
UPDATE universities SET slug = 'kwangwoon'          WHERE kcue_code = '0000074';
UPDATE universities SET slug = 'kookmin'            WHERE kcue_code = '0000078';
UPDATE universities SET slug = 'dankook'            WHERE kcue_code = '0000082';
UPDATE universities SET slug = 'dongguk'            WHERE kcue_code = '0000100';
UPDATE universities SET slug = 'mju'                WHERE kcue_code = '0000109'; -- 명지대 Myongji
UPDATE universities SET slug = 'smu'                WHERE kcue_code = '0000117'; -- 상명대 Sangmyung
UPDATE universities SET slug = 'sungshin'           WHERE kcue_code = '0000136';
UPDATE universities SET slug = 'sejong'             WHERE kcue_code = '0000138';
UPDATE universities SET slug = 'sookmyung'          WHERE kcue_code = '0000141';
UPDATE universities SET slug = 'soongsil'           WHERE kcue_code = '0000143';
UPDATE universities SET slug = 'ajou'               WHERE kcue_code = '0000146';
UPDATE universities SET slug = 'eulji'              WHERE kcue_code = '0000161';
UPDATE universities SET slug = 'ewha'               WHERE kcue_code = '0000163';
UPDATE universities SET slug = 'inha'               WHERE kcue_code = '0000169';
UPDATE universities SET slug = 'cau'                WHERE kcue_code = '0000175'; -- 중앙대 Chung-Ang
UPDATE universities SET slug = 'cha'                WHERE kcue_code = '0000187';
UPDATE universities SET slug = 'hongik'             WHERE kcue_code = '0000212';
UPDATE universities SET slug = 'unist'              WHERE kcue_code = '0000250'; -- 울산과학기술원
UPDATE universities SET slug = 'gist'               WHERE kcue_code = '0000381'; -- 광주과학기술원
UPDATE universities SET slug = 'dgist'              WHERE kcue_code = '0000382'; -- 대구경북과학기술원
