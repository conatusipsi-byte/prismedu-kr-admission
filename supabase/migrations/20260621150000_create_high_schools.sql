-- 고교 자동완성 데이터 materialization (BUG: 고교 검색 0건, 2026-06-21)
-- 원인: live NEIS Open API(open.neis.go.kr)가 Vercel 서버리스 egress IP(icn1/AWS-Seoul)를
--       클라우드 IP rate-limit/차단으로 HTTP 500 응답 → searchHighSchools가 [] 반환.
--       (키·리전 정상. 직접 호출은 초기 성공하다 다회 호출 시 IP 차단됨 — 서버리스에 부적합.)
-- 수정: NEIS 학교기본정보를 high_schools 테이블에 적재(scripts/etl/seed-highschools.ts)하고
--       검색을 DB에서 서빙(live NEIS 의존 제거). 학교 마스터는 변동 거의 없음(연 1~2회 seed).
create table if not exists public.high_schools (
  code       text primary key,                 -- NEIS SD_SCHUL_CODE (7자리)
  name       text not null,                     -- SCHUL_NM
  region     text not null default '',          -- LCTN_SC_NM (시·도)
  office     text not null default '',          -- ATPT_OFCDC_SC_NM (교육청)
  address    text,                              -- ORG_RDNMA (도로명)
  name_en    text,                              -- ENG_SCHUL_NM
  updated_at timestamptz not null default now()
);

-- 이름 부분일치 검색용. 약 12,000행 → seq scan 도 충분하지만 정렬/prefix 보조.
create index if not exists high_schools_name_idx on public.high_schools (name);
-- 대소문자·영문 검색 보조.
create index if not exists high_schools_name_lower_idx on public.high_schools (lower(name));

-- 공개 데이터(NEIS 공공데이터). 서버 라우트는 service_role 로 조회하지만,
-- 향후 클라이언트 직접 조회 대비 RLS + 공개 읽기 정책.
alter table public.high_schools enable row level security;
drop policy if exists "high_schools public read" on public.high_schools;
create policy "high_schools public read" on public.high_schools
  for select using (true);
