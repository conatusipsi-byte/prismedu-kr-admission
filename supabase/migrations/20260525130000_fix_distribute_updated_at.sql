-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ FIX 20260525120000 — set_updated_at() 트리거 우회                          ║
-- ║                                                                       ║
-- ║ 이전 마이그레이션 (20260525120000) 가 UPDATE ... SET updated_at = ...     ║
-- ║ 를 수행했지만, BEFORE UPDATE 트리거 set_updated_at() 가 NEW.updated_at =  ║
-- ║ now() 로 덮어써서 28,350 row 가 단일 timestamp 로 재고정됨 (원래 의도와    ║
-- ║ 정반대 — 결정성 더 악화).                                                 ║
-- ║                                                                       ║
-- ║ 본 마이그레이션:                                                          ║
-- ║   1. 트리거 일시 비활성                                                    ║
-- ║   2. UPDATE 로 (university_id, id) 사전순 + 1ms 분산                      ║
-- ║   3. 트리거 재활성                                                         ║
-- ║                                                                       ║
-- ║ 안전성:                                                                   ║
-- ║   - DISABLE TRIGGER 는 owner/service_role 필요 — supabase migration       ║
-- ║     컨텍스트는 owner 권한 보유.                                             ║
-- ║   - 트랜잭션 안에서 비활성·UPDATE·재활성 → 다른 세션엔 영향 없음.              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

BEGIN;

ALTER TABLE departments DISABLE TRIGGER departments_updated_at;

WITH ranked AS (
  SELECT university_id, id,
    ROW_NUMBER() OVER (ORDER BY university_id, id) AS rn
  FROM departments
)
UPDATE departments d
SET updated_at = '2026-05-20 09:13:57.306251+00'::timestamptz
  + (r.rn * interval '1 millisecond')
FROM ranked r
WHERE d.university_id = r.university_id AND d.id = r.id;

ALTER TABLE departments ENABLE TRIGGER departments_updated_at;

COMMIT;
