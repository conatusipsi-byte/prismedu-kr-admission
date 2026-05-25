-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ KCUE departments updated_at 분산 — cursor pagination 회귀 차단             ║
-- ║                                                                       ║
-- ║ 결함 (QA round 2 P0, 2026-05-25):                                      ║
-- ║   sync-kcue-baseline.ts 가 단일 트랜잭션 upsert 로 9,000+ row 를 적재해     ║
-- ║   모든 KCUE row 의 updated_at 이 트랜잭션 시작 시각 1개 값으로 고정됨.       ║
-- ║                                                                       ║
-- ║ 영향:                                                                  ║
-- ║   - search/route.ts 가 `.lt(updated_at, cursor)` strict less-than 으로 ║
-- ║     커서 페이지네이션 → 동일 timestamp 묶음을 통째로 건너뜀.                ║
-- ║   - ORDER BY tiebreak 부재로 같은 timestamp 안에서 비결정적 반환.            ║
-- ║                                                                       ║
-- ║ 본 마이그레이션:                                                          ║
-- ║   동일 timestamp 묶음을 (university_id, id) 사전순으로 1ms 씩 분산.        ║
-- ║   원본 timestamp 는 보존되지 않지만 ≈ 데이터 신선도 의미가 없는 batch        ║
-- ║   sync timestamp 라 영향 없음.                                            ║
-- ║                                                                       ║
-- ║ 멱등성:                                                                  ║
-- ║   같은 timestamp 가 다시 등장하지 않으면 본 마이그레이션은 no-op (WHERE     ║
-- ║   조건 미매칭). 다음 KCUE sync 가 단일 timestamp 로 재적재해도, sync         ║
-- ║   스크립트 본체 보강 (per-row updated_at) 와 함께라면 재발 X.                ║
-- ║                                                                       ║
-- ║ 진단 SQL 출처: 본 turn 의 supabase db query 검증.                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

WITH bulk_rows AS (
  SELECT university_id, id, updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY updated_at
      ORDER BY university_id, id
    ) AS rn,
    COUNT(*) OVER (PARTITION BY updated_at) AS cnt
  FROM departments
),
to_redistribute AS (
  -- 100개 이상 row 가 동일 timestamp 를 공유하는 경우만 분산 (= KCUE batch).
  -- 100 미만이면 정상적인 시드/수동 입력으로 간주하고 보존.
  SELECT university_id, id, updated_at, rn
  FROM bulk_rows
  WHERE cnt >= 100
)
UPDATE departments d
SET updated_at = r.updated_at + (r.rn * interval '1 millisecond')
FROM to_redistribute r
WHERE d.university_id = r.university_id AND d.id = r.id;

-- 진단 — 본 마이그레이션 적용 후 동일 timestamp 묶음 max 크기.
-- (수동 SELECT, COMMENT 로 의도 기록)
COMMENT ON COLUMN departments.updated_at IS
  'row 마지막 수정 시각. KCUE bulk sync 는 batch 후 본 마이그레이션 / scripts/etl 로 1ms 분산 적용 — cursor pagination 결정성 보장.';
