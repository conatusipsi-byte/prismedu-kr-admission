-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ KICE 수능 통계 테이블 RLS 정책                                                ║
-- ║                                                                       ║
-- ║ 배경:                                                                      ║
-- ║   Supabase Advisors ERROR 2건 — rls_disabled_in_public                  ║
-- ║     - public.csat_grade_cuts (등급컷·표준점수)                                 ║
-- ║     - public.csat_attendance (연도별 응시현황)                                  ║
-- ║                                                                       ║
-- ║   두 테이블은 20260520140000 마이그레이션에서 생성됐지만 RLS 미활성 상태로            ║
-- ║   public schema 에 노출 → anon key 로 UPDATE/DELETE 가능. KICE 등급컷       ║
-- ║   조작 시 합격 확률 계산이 왜곡될 수 있어 보안 위험.                                ║
-- ║                                                                       ║
-- ║ 정책:                                                                      ║
-- ║   - ENABLE ROW LEVEL SECURITY                                            ║
-- ║   - anon + authenticated → SELECT 만 허용 (USING true — KICE 자료는 공개)   ║
-- ║   - 명시적 INSERT/UPDATE/DELETE 정책 없음 → service_role(ETL) 만 가능        ║
-- ║                                                                       ║
-- ║ 출처: 한국교육과정평가원(KICE) 공개 자료 — 출처 명시 의무 외 비공개 사유 없음.        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. csat_grade_cuts — 등급구분·표준점수
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.csat_grade_cuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csat_grade_cuts_anon_select"
  ON public.csat_grade_cuts
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. csat_attendance — 연도별 응시현황
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.csat_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csat_attendance_anon_select"
  ON public.csat_attendance
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 주석: 본 마이그레이션 후 Supabase Advisors `rls_disabled_in_public` ERROR
-- 0건. ETL 스크립트 (scripts/etl/sync-csat-csv.ts) 는 service_role 키로
-- 호출되므로 RLS 우회 — 영향 없음.
-- ═══════════════════════════════════════════════════════════════════════
