-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ 폐과 오마킹 학과 활성화 (2차) — 2027 모집요강 적재분 기준                       ║
-- ║                                                                       ║
-- ║ 20260521120000 (1차, 5건: 고려/서강/부산) 과 동일 메커니즘.                   ║
-- ║ 기준: KCUE 가 active=false 로 마킹했으나 2027 모집요강에 실제 전형이           ║
-- ║   적재되어 있음 = 정상 운영 중 → active_override=true 로 보호 활성화.          ║
-- ║                                                                       ║
-- ║ 식별 (운영 DB 조회): active=false AND active_override IS NULL AND            ║
-- ║   department_admissions(year=2027) 존재 → 6건.                              ║
-- ║                                                                       ║
-- ║ 주의(정직): SNU 치의학과(u06010200005-ma-d) 는 degree_course='석사' 라        ║
-- ║   활성화해도 기본(학사) 검색에는 노출되지 않음. degree_course 재분류는 별도      ║
-- ║   클라이언트 확인 사안이라 본 마이그레이션에서 건드리지 않음 (추측 금지).         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

UPDATE departments
SET
  active = true,
  active_override = true,
  active_override_reason = '클라이언트 확인 — KCUE 폐과 마킹 오류, 2027 모집요강에 실제 전형 존재 (2026-06-01)',
  active_override_at = NOW()
WHERE (university_id, id) IN (
  ('kcue_0000066', 'u04110300043-ba-d'),  -- 경희대 자율전공학부
  ('kcue_0000066', 'u06030100004-ba-d'),  -- 경희대 약학과
  ('korea',        'u01020300068-ba-d'),  -- 고려대 심리학부
  ('snu',          'u06010200005-ma-d'),  -- 서울대 치의학과 (degree_course='석사' 별도 검토)
  ('sungkyunkwan', 'u04070100041-ba-d'),  -- 성균관대 반도체시스템공학과
  ('sungkyunkwan', 'u04080100061-ba-d')   -- 성균관대 컴퓨터공학과
);
