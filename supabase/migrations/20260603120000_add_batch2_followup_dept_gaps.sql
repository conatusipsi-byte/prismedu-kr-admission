-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Phase 2 batch 2 후속 — DB 미등재 실존 학과 48건 INSERT (2026-06-03)           ║
-- ║                                                                       ║
-- ║ 배경: batch2 적재 시 매핑 실패 학과를 (a)pseudo/계열 (b)개편 rename(NAME_ALIAS)  ║
-- ║   (c)DB 미등재 실존 으로 분류. 본 마이그레이션은 (c)만 INSERT.                   ║
-- ║                                                                       ║
-- ║ 검증(정직성):                                                              ║
-- ║   - 실존+모집요강: 전부 해당 대학 2027 수시 모집요강 추출(JSON)에 모집인원>0 으로  ║
-- ║     존재(행합·열합 체크섬 통과분). 표본 원문대조 완료.                            ║
-- ║   - 동일 active 학과 부재 확인: norm() 정확매칭 0 + 유사 active 학과 없음         ║
-- ║     (있으면 NAME_ALIAS 개편 rename 으로 처리, 본 INSERT 제외).                  ║
-- ║   - pseudo 제외: [전공개방]·자유전공·자율전공·특수교육대상자·단과대 계열(동국       ║
-- ║     경영대학139·바이오시스템대학10)·정원외 통합선발 은 학과 단위 아님 → 미INSERT. ║
-- ║                                                                       ║
-- ║ id: 합성 영문 slug. active_override=true 로 KCUE 재sync 시 비활성화 방지.        ║
-- ║ track: 검색 필터용 best-effort(인문→social, 자연→natural/공학계 engineering,    ║
-- ║   예체능→interdisciplinary). 합격 데이터 정본은 department_admissions.tracks.   ║
-- ║                                                                       ║
-- ║ 적재: 본 INSERT 후 load-admissions.ts --execute → 2027 전형이 name 매칭 부착.  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

INSERT INTO departments
  (university_id, id, campus_id, name, unit_type, track, total_quota,
   active, active_override, active_override_reason, active_override_at,
   degree_course, daytime)
VALUES
  -- 이화 (kcue_0000163)
  ('kcue_0000163','french-lang-lit','main','불어불문학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','history','main','사학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','philosophy','main','철학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','sociology','main','사회학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','social-welfare','main','사회복지학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','communication-media','main','커뮤니케이션·미디어학부','division','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','computer-engineering','main','컴퓨터공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','cyber-security','main','사이버보안학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','elementary-education','main','초등교육과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','history-education','main','역사교육전공','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','social-studies-education','main','사회교육전공','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','geography-education','main','지리교육전공','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000163','physical-education-science','main','체육과학부','division','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 인하 (kcue_0000169)
  ('kcue_0000169','bio-food-engineering','main','바이오식품공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 건국 (kcue_0000052)
  ('kcue_0000052','chinese-lang-lit','main','중어중문학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','philosophy','main','철학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','geography','main','지리학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','electrical-electronic-eng','main','전기전자공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','artificial-intelligence','main','인공지능학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','materials-engineering','main','재료공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','industrial-management-convergence','main','산업경영융합학부','division','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','political-science-diplomacy','main','정치외교학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','advanced-bio-engineering','main','첨단바이오공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','biotechnology','main','생명공학부','division','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','food-convergence','main','식품융합학부','division','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','environmental-ecology-science','main','환경생태과학부','division','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','film-arts','main','영화예술학과','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000052','physical-education','main','체육교육과','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 동국 (kcue_0000100)
  ('kcue_0000100','cultural-heritage','main','문화유산학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','chemistry','main','화학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','physics','main','물리학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','convergence-environmental-science','main','융합환경과학과','department','natural',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','food-bio-convergence-eng','main','식품바이오융합공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','mechanical-robot-energy-eng','main','기계로봇에너지공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','medical-ai-engineering','main','의료인공지능공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','intelligent-network-convergence','main','지능형네트워크융합학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','criminology','main','범죄학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000100','global-trade','main','글로벌무역학과','department','social',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 홍익 (kcue_0000212)
  ('kcue_0000212','nano-semiconductor-eng','main','나노반도체공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000212','ai-mechanical-convergence-eng','main','AI기계융합공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000212','sports-coaching','main','스포츠지도학과','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 가천 (kcue_0000063)
  ('kcue_0000063','ai-systems','main','인공지능시스템학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000063','information-security','main','정보보호학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000063','vocal-music','main','성악전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000063','instrumental-music','main','기악전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000063','composition','main','작곡전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  ('kcue_0000063','taekwondo','main','태권도전공','department','interdisciplinary',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간'),
  -- 중앙 (kcue_0000175)
  ('kcue_0000175','intelligent-semiconductor-eng','main','지능형반도체공학과','department','engineering',0,true,true,'2027 모집요강 실존 학과 — KCUE 미등재 수동 추가 (batch2 후속, 2026-06-03)',NOW(),'학사','주간')
ON CONFLICT (university_id, id) DO NOTHING;
