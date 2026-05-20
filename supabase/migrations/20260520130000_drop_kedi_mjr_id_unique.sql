-- KEDI 전공 ID 는 학과 ID 가 아닌 분류 코드 — 같은 학교 안에서도 학사/석사/박사
-- 행마다 동일한 kediMjrId 가 반복된다. (대학원·전문대학원 통합 학과정보 응답).
-- 따라서 (university_id, kedi_mjr_id) 단일 unique 보장은 데이터와 모순.
-- 학과 row 의 진짜 unique 키는 PK (university_id, id) — id 가 이미 deg/day 포함.

DROP INDEX IF EXISTS departments_kedi_mjr_id_uidx;

-- 조회 효율을 위한 일반 인덱스(non-unique)는 유지.
CREATE INDEX IF NOT EXISTS departments_kedi_mjr_id_idx
  ON departments (university_id, kedi_mjr_id)
  WHERE kedi_mjr_id IS NOT NULL;
