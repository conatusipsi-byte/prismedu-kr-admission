-- Phase 2 batch 4.5 — 4차(수도권 사립) 미매칭 실존 학과 14건 INSERT (2026-06-17)
-- batch 4(강남·삼육·수원·안양·평택·협성) 적재 시 25학과 미매칭 = KCUE baseline ↔ 2027 요강 gap.
-- 실존(요강 원문 grep 확인, trackHint 인문/자연 근거) 14건만 추가. pseudo 11건 제외:
--   자율전공/자유전공 5(글로벌자유전공·동아시아융합자율전공·AI융합자율전공·인문사회자율전공·디자인자율전공2유형)
--   + 국제지역및신학자율전공학부 bundle 1 + 정원외 전형pool 4([정원외]농어촌·특성화고·기초생활·장애인)
--   + 데이터사이언스학과(야간) 1(주간 INSERT에 prefix containment 흡수 → 별도 INSERT 불필요).
-- 학부(전공) 괄호 세부전공은 head 명칭으로 INSERT → 추출 bundle명이 prefix containment 매칭.
-- id=b45-{univ}-NN, active_override. ON CONFLICT (university_id,id)=복합 PK.
INSERT INTO departments
  (university_id, id, campus_id, name, unit_type, track, total_quota, active, active_override, active_override_reason, active_override_at, degree_course, daytime)
VALUES
  -- ── 수원대학교 (kcue_0000140) — 5건 ──
  ('kcue_0000140','b45-suwon-01','main','바이오공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000140','b45-suwon-02','main','소방재난공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000140','b45-suwon-03','main','AI데이터과학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000140','b45-suwon-04','main','컴퓨터공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000140','b45-suwon-05','main','지능형보안학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  -- ── 안양대학교 (kcue_0000147) — 4건. 데이터사이언스학과(야간)은 주간행 prefix 흡수. ──
  ('kcue_0000147','b45-anyang-01','main','예술학부 공연예술전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000147','b45-anyang-02','main','예술학부 음악융합예술전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000147','b45-anyang-03','main','데이터사이언스학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000147','b45-anyang-04','main','AI학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  -- ── 평택대학교 (kcue_0000186) — 5건 ──
  ('kcue_0000186','b45-pyeongtaek-01','main','AI소프트웨어학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000186','b45-pyeongtaek-02','main','AI콘텐츠학과','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000186','b45-pyeongtaek-03','main','빅데이터정보학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000186','b45-pyeongtaek-04','main','환경융합학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000186','b45-pyeongtaek-05','main','패션디자인학과','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 4.5 재정합, 2026-06-17)',NOW(),'학사','주간')
ON CONFLICT (university_id, id) DO NOTHING;
