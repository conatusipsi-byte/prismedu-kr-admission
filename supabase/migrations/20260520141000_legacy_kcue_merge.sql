-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Legacy universities ↔ KCUE 통합                                         ║
-- ║                                                                       ║
-- ║ 10개 legacy 학교(snu, postech, …)가 KCUE sync 로 별도 row (kcue_XXXX) 로  ║
-- ║ 생성되어 중복. legacy id를 정본으로 유지하고:                                 ║
-- ║   1) KCUE 측 row 에 묶인 departments 를 legacy id 로 재연결                ║
-- ║   2) 중복 KCUE 학교 row 삭제 (universities_kcue_code_uidx 점유 해제)        ║
-- ║   3) legacy 행에 kcue_code + kcue_synced_at 채움                         ║
-- ║                                                                       ║
-- ║ 순서가 중요 — 2 가 먼저 끝나야 3 의 UPDATE 가 unique 충돌 없이 통과.            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. KCUE 측 row 의 departments → legacy id 로 재연결
-- ═══════════════════════════════════════════════════════════════════════
UPDATE departments SET university_id = 'snu'           WHERE university_id = 'kcue_0000019';
UPDATE departments SET university_id = 'yonsei'        WHERE university_id = 'kcue_0000149';
UPDATE departments SET university_id = 'korea'         WHERE university_id = 'kcue_0000069';
UPDATE departments SET university_id = 'hanyang'       WHERE university_id = 'kcue_0000203';
UPDATE departments SET university_id = 'sungkyunkwan'  WHERE university_id = 'kcue_0000133';
UPDATE departments SET university_id = 'sogang'        WHERE university_id = 'kcue_0000120';
UPDATE departments SET university_id = 'hkuk'          WHERE university_id = 'kcue_0000192';
UPDATE departments SET university_id = 'kaist'         WHERE university_id = 'kcue_0000374';
UPDATE departments SET university_id = 'postech'       WHERE university_id = 'kcue_0000188';
UPDATE departments SET university_id = 'pusan'         WHERE university_id = 'kcue_0000014';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. 중복 KCUE 학교 row 삭제 (kcue_code unique 점유 해제)
-- ═══════════════════════════════════════════════════════════════════════
DELETE FROM universities WHERE id IN (
  'kcue_0000019', 'kcue_0000149', 'kcue_0000069', 'kcue_0000203', 'kcue_0000133',
  'kcue_0000120', 'kcue_0000192', 'kcue_0000374', 'kcue_0000188', 'kcue_0000014'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. legacy 학교에 KCUE code 부여
-- ═══════════════════════════════════════════════════════════════════════
UPDATE universities SET kcue_code = '0000019', kcue_synced_at = now() WHERE id = 'snu'           AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000149', kcue_synced_at = now() WHERE id = 'yonsei'        AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000069', kcue_synced_at = now() WHERE id = 'korea'         AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000203', kcue_synced_at = now() WHERE id = 'hanyang'       AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000133', kcue_synced_at = now() WHERE id = 'sungkyunkwan'  AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000120', kcue_synced_at = now() WHERE id = 'sogang'        AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000192', kcue_synced_at = now() WHERE id = 'hkuk'          AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000374', kcue_synced_at = now() WHERE id = 'kaist'         AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000188', kcue_synced_at = now() WHERE id = 'postech'       AND kcue_code IS NULL;
UPDATE universities SET kcue_code = '0000014', kcue_synced_at = now() WHERE id = 'pusan'         AND kcue_code IS NULL;
