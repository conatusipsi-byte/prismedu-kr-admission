-- Phase 2 batch 2.5 — 창원·교통(거점국립) 미매칭 실존 학과 29건 INSERT (2026-06-17)
-- batch 3(창원·교통) 적재 시 34학과 미매칭 = KCUE baseline ↔ 2027 모집요강 gap.
-- 실존(요강 원문 grep 확인, trackHint 인문/자연 근거) 29건만 추가. pseudo 5건 제외:
--   자율전공학부 3(자연과학계열·GAST·기계항공) + 전형pool 1(특수교육대상자전형 모집단위 미지정)
--   + 철도경영･물류학과 1(기존 active '철도경영·물류학과'와 반각 가운뎃점 U+FF65 차이 → norm() 흡수로 해소, INSERT 아님).
-- id=b25-{univ}-NN, active_override. ON CONFLICT (university_id,id)=복합 PK.
INSERT INTO departments
  (university_id, id, campus_id, name, unit_type, track, total_quota, active, active_override, active_override_reason, active_override_at, degree_course, daytime)
VALUES
  -- ── 국립창원대학교 (kcue_0000028) — 22건. 2027 AI·무전공 개편 신설/개명 모집단위. ──
  ('kcue_0000028','b25-changwon-01','main','창업비즈니스학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-02','main','글로벌문화산업학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-03','main','글로벌인재개발학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-04','main','기술경영공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-05','main','환경에너지공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-06','main','건설시스템공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-07','main','첨단지능정보공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-08','main','재료금속공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-09','main','첨단소재융합공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-10','main','미생물생명공학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-11','main','생명보건학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-12','main','문화기술융합학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-13','main','AI전기공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-14','main','인공지능공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-15','main','인공지능화학공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-16','main','AI생명과학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-17','main','인공지능디펜스공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-18','main','인공지능파이낸스학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-19','main','스마트제조융합공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-20','main','에너지기계공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-21','main','모빌리티기계공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000028','b25-changwon-22','main','원자력기계공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  -- ── 국립한국교통대학교 (kcue_0000034) — 7건. 2027 학부 개편 신설 모집단위. ──
  ('kcue_0000034','b25-kchungju-01','main','나노메디컬공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-02','main','항공모빌리티학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-03','main','AI소프트웨어학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-04','main','식품공학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-05','main','식품영양학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-06','main','생명공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간'),
  ('kcue_0000034','b25-kchungju-07','main','철도AI·데이터공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch 2.5 재정합, 2026-06-17)',NOW(),'학사','주간')
ON CONFLICT (university_id, id) DO NOTHING;
