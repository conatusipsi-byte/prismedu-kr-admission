-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Rate-limit / Quota — 원자적 increment RPC                                ║
-- ║                                                                       ║
-- ║ Firestore 의 runTransaction(get → increment → set) 를 단일 SQL 로 대체. ║
-- ║ ON CONFLICT 가 동시 호출에서 atomic 갱신을 보장.                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 1. rate-limit (분 단위 — windowMs 길이의 fixed window)
--    호출 시 windowStart 로 키를 만들어 윈도우별 카운터 분리.
CREATE OR REPLACE FUNCTION rate_limit_check_and_increment(
  p_rate_key text,
  p_window_start timestamptz,
  p_expires_at timestamptz,
  p_limit integer
) RETURNS TABLE(allowed boolean, current_count integer) AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO rate_limits (rate_key, count, window_start, expires_at)
  VALUES (p_rate_key, 1, p_window_start, p_expires_at)
  ON CONFLICT (rate_key) DO UPDATE
    SET count = rate_limits.count + 1
  RETURNING rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rate_limit_check_and_increment IS
  '원자적 rate-limit 카운터 증가 + 임계치 검사. service_role 만 호출 가능 (RLS bypass).';

-- 2. quota — 일별 정량 한도 (Infinity면 차단 안 함, 카운트만 증가)
--    호출 측에서 dailyLimit=Infinity 인 plan 은 검사 우회.
CREATE OR REPLACE FUNCTION quota_check_and_increment(
  p_quota_key text,
  p_window_start timestamptz,
  p_expires_at timestamptz,
  p_daily_limit integer  -- NULL 또는 0 = 무제한
) RETURNS TABLE(allowed boolean, used integer) AS $$
DECLARE
  v_count integer;
BEGIN
  -- 먼저 현재 카운트 조회 — limit 초과면 증가 안 함
  SELECT count INTO v_count FROM rate_limits WHERE rate_key = p_quota_key;
  v_count := COALESCE(v_count, 0);

  IF p_daily_limit IS NOT NULL AND p_daily_limit > 0 AND v_count >= p_daily_limit THEN
    RETURN QUERY SELECT false, v_count;
    RETURN;
  END IF;

  -- 한도 미달 — 카운터 증가 (atomic)
  INSERT INTO rate_limits (rate_key, count, window_start, expires_at)
  VALUES (p_quota_key, 1, p_window_start, p_expires_at)
  ON CONFLICT (rate_key) DO UPDATE
    SET count = rate_limits.count + 1
  RETURNING rate_limits.count INTO v_count;

  RETURN QUERY SELECT true, v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION quota_check_and_increment IS
  '일별 quota 검사 + 증가. dailyLimit NULL/0 이면 무제한 (카운트만).';

-- 3. ai_cache 만료된 항목 정리 (스케줄러 또는 호출 시점)
CREATE OR REPLACE FUNCTION ai_cache_cleanup_expired() RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM ai_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- 4. rate_limits 만료된 항목 정리
CREATE OR REPLACE FUNCTION rate_limits_cleanup_expired() RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM rate_limits WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;
