-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Legacy departments ↔ KCUE 학과 매핑                                       ║
-- ║                                                                       ║
-- ║ 시드 데이터로 들어간 legacy 학과 (snu/medicine 등) 와 KCUE sync 가 만든     ║
-- ║ 같은 학과의 학사·주간 row 가 중복. legacy id 를 정본으로 유지하고,            ║
-- ║   1) legacy row 에 kedi_mjr_id + std_clft_mjr_id 채움                  ║
-- ║   2) KCUE 측 학사·주간 row 삭제                                          ║
-- ║                                                                       ║
-- ║ 매핑 출처: 본 turn 의 자동 검색 — 같은 학교 안에서 active·학사·주간 +        ║
-- ║   학과명 ilike '%legacy 이름%' 매칭. 11/16 legacy 매핑 (5건은 KCUE 측      ║
-- ║   폐과 또는 sub-track 분리로 단일 매칭 불가 — legacy 단독 유지).             ║
-- ║                                                                       ║
-- ║ 학사 외 학위과정(석사·박사) KCUE row 들은 보존 — 대학원 검색용.              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. legacy 학과에 KEDI 전공 ID 부여 (11건)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE departments SET kedi_mjr_id = 'U06010100002' WHERE university_id = 'snu'          AND id = 'medicine';
UPDATE departments SET kedi_mjr_id = 'U04080100063' WHERE university_id = 'snu'          AND id = 'computer-science';
UPDATE departments SET kedi_mjr_id = 'U02010100035' WHERE university_id = 'snu'          AND id = 'business';
UPDATE departments SET kedi_mjr_id = 'U04080100065' WHERE university_id = 'yonsei'       AND id = 'computer-science';
UPDATE departments SET kedi_mjr_id = 'U02010100035' WHERE university_id = 'yonsei'       AND id = 'business';
UPDATE departments SET kedi_mjr_id = 'U04050200159' WHERE university_id = 'kaist'        AND id = 'ee';
UPDATE departments SET kedi_mjr_id = 'U04080100061' WHERE university_id = 'postech'      AND id = 'cs';
UPDATE departments SET kedi_mjr_id = 'U04040100012' WHERE university_id = 'hanyang'      AND id = 'mechanical';
UPDATE departments SET kedi_mjr_id = 'U02010200088' WHERE university_id = 'sungkyunkwan' AND id = 'global-economics';
UPDATE departments SET kedi_mjr_id = 'U04080200017' WHERE university_id = 'sungkyunkwan' AND id = 'software';
UPDATE departments SET kedi_mjr_id = 'U01010600181' WHERE university_id = 'hkuk'         AND id = 'english-literature';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. KCUE 측 학사·주간 중복 row 삭제 (legacy 가 정본)
-- ═══════════════════════════════════════════════════════════════════════
-- id 포맷: `<kediMjrId lowercase>-ba-d` (학사·주간). 석사·박사·야간 row 는 보존.
DELETE FROM departments
WHERE (university_id, id) IN (
  ('snu',          'u06010100002-ba-d'),
  ('snu',          'u04080100063-ba-d'),
  ('snu',          'u02010100035-ba-d'),
  ('yonsei',       'u04080100065-ba-d'),
  ('yonsei',       'u02010100035-ba-d'),
  ('kaist',        'u04050200159-ba-d'),
  ('postech',      'u04080100061-ba-d'),
  ('hanyang',      'u04040100012-ba-d'),
  ('sungkyunkwan', 'u02010200088-ba-d'),
  ('sungkyunkwan', 'u04080200017-ba-d'),
  ('hkuk',         'u01010600181-ba-d')
);
