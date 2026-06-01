-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ 2027 모집요강 학과 정합 — 명칭 개편(rename) 4건 + 신설/누락(new) 9건           ║
-- ║                                                                       ║
-- ║ 배경: 2027 모집요강 텍스트 추출 적재 시 18학과 매핑 실패(SKIP). 분류 후 처리:    ║
-- ║   ① rename(4) — 기존 활성학과의 2027 개편 명칭. 신규 추가 시 중복 노출 →        ║
-- ║      기존 row name 변경(=id·이력·합격데이터 연속). 학과별 합격률 오도 방지.      ║
-- ║   ② new(9)    — KCUE 미등재 신설/변형. (university_id,id) 합성 slug 로 INSERT. ║
-- ║   ③ skip      — pseudo/정원외(장애인 통합선발×2, SNU 농업생명과학대학 정원외),    ║
-- ║                 모호(경희 경영회계계열·성균 인공지능학과) 은 본 마이그레이션 제외.  ║
-- ║                                                                       ║
-- ║ 적재: 본 구조 변경 후 load-admissions.ts --execute 재실행 → 2027 전형          ║
-- ║   데이터가 name 매칭으로 각 학과에 부착됨.                                     ║
-- ║                                                                       ║
-- ║ 주의(정직):                                                                ║
-- ║   - rename row 의 name 은 KCUE 재sync 시 KCUE 값으로 복귀 가능(name_override   ║
-- ║     미구현). 합격데이터는 department_id 기준이라 연속 유지됨. 후속 과제로 기록.    ║
-- ║   - 신설 9건 track 은 도메인 기준 best-effort 분류(검색 필터용). 합격 데이터는    ║
-- ║     admission tracks 가 정본.                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────
-- ① RENAME — 기존 활성학과 명칭을 2027 모집요강 명칭으로 (id 유지)
-- ─────────────────────────────────────────────────────────────────────────
UPDATE departments SET name='기계공학부', unit_type='division'
  WHERE university_id='kcue_0000066' AND id='u04040100010-ba-d';        -- 기계공학과 → 기계공학부
UPDATE departments SET name='전자공학부 전자공학과', unit_type='division'
  WHERE university_id='kcue_0000066' AND id='u04050200229-ba-d';        -- 전자정보공학부 전자공학과 → 전자공학부 전자공학과
UPDATE departments SET name='전자공학부 반도체공학과', unit_type='division'
  WHERE university_id='kcue_0000066' AND id='u04050200225-ba-d';        -- 전자정보공학부 반도체공학과 → 전자공학부 반도체공학과
UPDATE departments SET name='전자전기정보공학부', unit_type='division'
  WHERE university_id='sungkyunkwan' AND id='u04050200040-ba-d';        -- 전자전기공학부 → 전자전기정보공학부

-- ─────────────────────────────────────────────────────────────────────────
-- ② NEW — KCUE 미등재 신설/변형 학과 (합성 slug id, active_override 로 sync 보호)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO departments
  (university_id, id, campus_id, name, unit_type, track, total_quota,
   active, active_override, active_override_reason, active_override_at,
   degree_course, daytime)
VALUES
  ('yonsei','advanced-pharmaceutical-sciences','main','첨단약과학과','department','natural',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('yonsei','jinri-liberal-humanities','main','진리자유학부(인문)','division','interdisciplinary',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('yonsei','jinri-liberal-natural','main','진리자유학부(자연)','division','interdisciplinary',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('yonsei','mobility-system','main','모빌리티시스템전공','department','engineering',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('sungkyunkwan','battery','main','배터리학과','department','engineering',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('sungkyunkwan','bio-newdrug-regulatory-science','main','바이오신약·규제과학과','department','natural',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('sungkyunkwan','global-ai-convergence','main','글로벌AI융합학부','division','social',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('kcue_0000066','intelligent-electronic-systems','main','지능형전자시스템학과','department','engineering',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간'),
  ('kcue_0000066','korean-medicine-humanities','main','한의예과(인문)','department','natural',0,
     true,true,'2027 모집요강 신설/누락 — KCUE 미등재 수동 추가 (2026-06-01)',NOW(),'학사','주간')
ON CONFLICT (university_id, id) DO NOTHING;  -- 재적용 안전 (이미 적재됨)
