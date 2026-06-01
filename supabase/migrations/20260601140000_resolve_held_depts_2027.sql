-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ 보류 2학과 처리 — 2027 모집요강 별도 모집단위 확인 후 추가                       ║
-- ║                                                                       ║
-- ║ 20260601130000 에서 "기존 유사단위 존재"로 보류했던 2건을 모집요강 원문으로       ║
-- ║ 재확인 → 둘 다 별도 모집단위(고유 정원·전형) 로 판단, 신규 추가.                  ║
-- ║                                                                       ║
-- ║ ① 경희 경영회계계열 (kcue_0000066): 서울캠 인문, 정원 133(지역균형30/네오르       ║
-- ║    네상스61/기회균형 등). 경영+회계 묶은 계열 모집 — DB 미존재(경영학과·          ║
-- ║    회계·세무학과와 별개 단위). track=social, unit_type=division.               ║
-- ║ ② 성균 인공지능학과 (sungkyunkwan): 정원 20(학생부종합 탐구인재15/논술5).        ║
-- ║    소스가 지능형소프트웨어학과·글로벌AI융합학부와 별개로 명시. DB 인공지능융합전공  ║
-- ║    (social·2027데이터 없음)은 구조 다른 전공이라 병합 부적절. track=engineering. ║
-- ║                                                                       ║
-- ║ 적재: 본 추가 후 load-admissions.ts --execute 재실행 → 2027 전형 부착.          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

INSERT INTO departments
  (university_id, id, campus_id, name, unit_type, track, total_quota,
   active, active_override, active_override_reason, active_override_at,
   degree_course, daytime)
VALUES
  ('kcue_0000066','business-accounting','main','경영회계계열','division','social',0,
     true,true,'2027 모집요강 별도 모집단위 확인 후 추가 — 보류분 처리 (2026-06-01)',NOW(),'학사','주간'),
  ('sungkyunkwan','artificial-intelligence','main','인공지능학과','department','engineering',0,
     true,true,'2027 모집요강 별도 모집단위 확인 후 추가 — 보류분 처리 (2026-06-01)',NOW(),'학사','주간')
ON CONFLICT (university_id, id) DO NOTHING;  -- 재적용 안전
