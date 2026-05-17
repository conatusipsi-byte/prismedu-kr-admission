-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ RLS 정책 — firestore.rules 의 정책을 Postgres Row-Level Security 로 이전 ║
-- ║                                                                       ║
-- ║ 정책 분류:                                                              ║
-- ║   - 공개 read: universities, departments, department_admissions,        ║
-- ║                admission_sample_stats, admission_results(verified)      ║
-- ║   - 본인 read/write: user_specs, user_entitlements(read만), orders,    ║
-- ║                      matches, conversation_messages                     ║
-- ║   - 서버 전용 (service_role bypass): admissions_staging, ai_cache,      ║
-- ║              sanitize_events, rate_limits, counselor_metrics            ║
-- ║                                                                       ║
-- ║ 마스터 운영자 정책: service_role 키로 우회 (Firebase MASTER_EMAILS 대응).║
-- ║   클라이언트 측 마스터 우회는 없음 — 서버가 service_role 로 직접 write. ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 모든 테이블 RLS 활성화 — 기본은 차단, 정책으로 명시적 허용
ALTER TABLE universities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_admissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions_staging          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_specs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_results           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_sample_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanitize_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE counselor_metrics           ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- 공개 read — anonymous 와 authenticated 모두 SELECT 허용
-- ═══════════════════════════════════════════════════════════════════════

-- universities — P-001 핵심 (비로그인 학과 상세 페이지)
CREATE POLICY universities_public_read ON universities FOR SELECT
  USING (active = true);

-- departments — 공개 검색
CREATE POLICY departments_public_read ON departments FOR SELECT
  USING (active = true);

-- department_admissions — 공개 모집요강
CREATE POLICY dept_admissions_public_read ON department_admissions FOR SELECT
  USING (true);

-- admission_sample_stats — 표본 충분 여부 안내용 (공개)
CREATE POLICY sample_stats_public_read ON admission_sample_stats FOR SELECT
  USING (true);

-- admission_results — verified=true 만 공개
CREATE POLICY admission_results_verified_read ON admission_results FOR SELECT
  USING (verified = true);

-- ═══════════════════════════════════════════════════════════════════════
-- 본인 데이터 read/write — auth.uid() 매칭
-- ═══════════════════════════════════════════════════════════════════════

-- user_specs — 본인 것만 CRUD
CREATE POLICY user_specs_self_select ON user_specs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY user_specs_self_insert ON user_specs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_specs_self_update ON user_specs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_specs_self_delete ON user_specs FOR DELETE
  USING (auth.uid() = user_id);

-- user_entitlements — 본인 read 만 (write 는 service_role)
CREATE POLICY user_ent_self_read ON user_entitlements FOR SELECT
  USING (auth.uid() = user_id);

-- orders — 본인 read 만 (write 는 결제 confirm 서버에서 service_role)
CREATE POLICY orders_self_read ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- matches — 본인 것만 read (server 가 service_role 로 insert)
CREATE POLICY matches_self_read ON matches FOR SELECT
  USING (auth.uid() = user_id);

-- conversation_messages — 본인 것만 read (server 가 insert)
CREATE POLICY conv_msg_self_read ON conversation_messages FOR SELECT
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 서버 전용 테이블 — RLS 활성화하되 정책 0건 (= 모든 접근 차단).
--   service_role 키는 RLS bypass 하므로 서버는 정상 작동.
--   anonymous / authenticated 일반 접근은 모두 차단.
--
-- 대상: admissions_staging, ai_cache, sanitize_events, rate_limits,
--      counselor_metrics
-- ═══════════════════════════════════════════════════════════════════════

-- (정책 0건 = 차단. 명시적 의도 표현을 위해 주석만 남김)
COMMENT ON TABLE admissions_staging IS '서버 전용 (ETL 운영자 검수). RLS 정책 없음 = service_role 만 접근 가능.';
COMMENT ON TABLE ai_cache IS '서버 전용. service_role 만 접근.';
COMMENT ON TABLE sanitize_events IS '서버 전용 (운영 모니터링). service_role 만 접근.';
COMMENT ON TABLE rate_limits IS '서버 전용 (API 호출 제한 카운터). service_role 만 접근.';
COMMENT ON TABLE counselor_metrics IS '서버 전용 (AI 호출 메트릭). service_role 만 접근.';
