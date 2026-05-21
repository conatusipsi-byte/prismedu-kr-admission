-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Supabase Advisors WARN 일괄 해소                                            ║
-- ║                                                                       ║
-- ║ 본 마이그레이션은 db advisors 가 보고한 WARN 20건을 일괄 처리한다 (HIBP 1건은    ║
-- ║ Auth Settings 라 별도 Management API 로 처리).                              ║
-- ║                                                                       ║
-- ║ 1) auth_rls_initplan (11) — RLS 정책의 auth.uid() 가 매 row 재평가되어          ║
-- ║    대용량 테이블에서 성능 저하. `(select auth.uid())` 로 감싸면 planner 가      ║
-- ║    init-plan 으로 1회만 평가 (Supabase RLS 성능 best-practice).               ║
-- ║                                                                       ║
-- ║ 2) function_search_path_mutable (7) — search_path 미고정 함수는 호출자        ║
-- ║    검색경로에 따라 동작이 달라질 수 있어 SECURITY DEFINER 함수에선 보안 위험.       ║
-- ║    모든 7개 함수에 search_path=public,pg_temp 고정.                          ║
-- ║                                                                       ║
-- ║ 3) anon/authenticated_security_definer_function_executable (2)            ║
-- ║    public.handle_new_user 는 SECURITY DEFINER 인데 anon/authenticated 가  ║
-- ║    EXECUTE 가능 → 권한 회수. auth.users INSERT 트리거에 연결되어 있어         ║
-- ║    직접 호출은 필요 없음 (트리거는 함수 owner 권한으로 실행).                     ║
-- ║                                                                       ║
-- ║ 회귀 검증:                                                                  ║
-- ║   - 모든 정책의 의미는 동일 — (select auth.uid()) 는 auth.uid() 와 결과 같음. ║
-- ║   - 기존 사용자 SELECT/UPDATE 동작 변화 없음.                                  ║
-- ║   - handle_new_user trigger 는 owner(postgres) 권한으로 호출되므로 영향 없음.  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. RLS 정책 11건 — auth.uid() → (select auth.uid()) 재작성
--    Postgres 는 정책 본문 ALTER 불가 → DROP + CREATE 패턴.
-- ═══════════════════════════════════════════════════════════════════════

-- admins.admins_self_read (SELECT)
DROP POLICY IF EXISTS "admins_self_read" ON public.admins;
CREATE POLICY "admins_self_read" ON public.admins
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- conversation_messages.conv_msg_self_read (SELECT)
DROP POLICY IF EXISTS "conv_msg_self_read" ON public.conversation_messages;
CREATE POLICY "conv_msg_self_read" ON public.conversation_messages
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- matches.matches_self_read (SELECT)
DROP POLICY IF EXISTS "matches_self_read" ON public.matches;
CREATE POLICY "matches_self_read" ON public.matches
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- orders.orders_self_read (SELECT)
DROP POLICY IF EXISTS "orders_self_read" ON public.orders;
CREATE POLICY "orders_self_read" ON public.orders
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- profiles.profiles_self_read (SELECT)
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

-- profiles.profiles_self_update (UPDATE — USING + CHECK)
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- user_entitlements.user_ent_self_read (SELECT)
DROP POLICY IF EXISTS "user_ent_self_read" ON public.user_entitlements;
CREATE POLICY "user_ent_self_read" ON public.user_entitlements
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- user_specs.user_specs_self_select (SELECT)
DROP POLICY IF EXISTS "user_specs_self_select" ON public.user_specs;
CREATE POLICY "user_specs_self_select" ON public.user_specs
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- user_specs.user_specs_self_insert (INSERT — CHECK only)
DROP POLICY IF EXISTS "user_specs_self_insert" ON public.user_specs;
CREATE POLICY "user_specs_self_insert" ON public.user_specs
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- user_specs.user_specs_self_update (UPDATE — USING + CHECK)
DROP POLICY IF EXISTS "user_specs_self_update" ON public.user_specs;
CREATE POLICY "user_specs_self_update" ON public.user_specs
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_specs.user_specs_self_delete (DELETE)
DROP POLICY IF EXISTS "user_specs_self_delete" ON public.user_specs;
CREATE POLICY "user_specs_self_delete" ON public.user_specs
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. 함수 search_path 고정 7건
--    search_path=public,pg_temp — 시스템 카탈로그 외 안전.
-- ═══════════════════════════════════════════════════════════════════════
ALTER FUNCTION public.ai_cache_cleanup_expired()                                  SET search_path = public, pg_temp;
ALTER FUNCTION public.ai_cache_set_expires()                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                                            SET search_path = public, pg_temp;
ALTER FUNCTION public.quota_check_and_increment(text, timestamptz, timestamptz, int) SET search_path = public, pg_temp;
ALTER FUNCTION public.rate_limit_check_and_increment(text, timestamptz, timestamptz, int) SET search_path = public, pg_temp;
ALTER FUNCTION public.rate_limits_cleanup_expired()                                SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                                             SET search_path = public, pg_temp;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. handle_new_user (SECURITY DEFINER) EXECUTE 권한 회수
--    auth.users INSERT 트리거가 함수 owner 권한으로 호출하므로 anon/auth 가
--    EXECUTE 권한을 가질 필요 없음.
-- ═══════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- ═══════════════════════════════════════════════════════════════════════
-- 참고: auth_leaked_password_protection (HIBP) 은 Auth 설정 — DDL 외.
-- supabase Management API 로 본 마이그레이션 적용 후 별도 활성.
-- ═══════════════════════════════════════════════════════════════════════
