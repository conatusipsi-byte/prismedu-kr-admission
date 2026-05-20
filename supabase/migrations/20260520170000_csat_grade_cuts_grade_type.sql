-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ csat_grade_cuts.grade_type — 상대평가 / 절대평가 분기                       ║
-- ║                                                                       ║
-- ║ 영어·한국사·제2외국어/한문 영역들은 절대평가 (raw 원점수 컷).                  ║
-- ║ 국어·수학·탐구 영역들은 상대평가 (표준점수 컷).                              ║
-- ║                                                                       ║
-- ║ 절대평가 9등급은 "X미만" 텍스트로 KICE 가 제공 — 숫자 컬럼에 적재 불가 →      ║
-- ║ cut_score 를 NULL 허용 컬럼으로 변경 + grade_type 으로 의미 구분.            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

ALTER TABLE csat_grade_cuts
  ADD COLUMN IF NOT EXISTS grade_type text
    CHECK (grade_type IN ('relative', 'absolute'));

-- cut_score NULL 허용 — 절대평가 9등급 "X미만" 케이스용
ALTER TABLE csat_grade_cuts
  ALTER COLUMN cut_score DROP NOT NULL;

-- 절대평가 시 raw 원점수의 "미만" 하한선 (예: 영어 9등급 = 20미만 → 19)
ALTER TABLE csat_grade_cuts
  ADD COLUMN IF NOT EXISTS cut_score_upper_bound integer;

COMMENT ON COLUMN csat_grade_cuts.grade_type IS
  'relative=표준점수 컷, absolute=원점수 컷 (영어·한국사·제2외국어/한문).';
COMMENT ON COLUMN csat_grade_cuts.cut_score IS
  '상대평가는 표준점수 / 절대평가는 원점수 하한선. 절대평가 9등급은 NULL (X미만 케이스 — cut_score_upper_bound 참조).';
COMMENT ON COLUMN csat_grade_cuts.cut_score_upper_bound IS
  '절대평가 마지막 등급 "X미만" 패턴의 X 값 (예: 영어 9등급=20미만 → 20). 그 외 NULL.';
