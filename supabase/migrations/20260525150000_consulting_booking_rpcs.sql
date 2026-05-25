-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ 컨설팅 예약 트랜잭션 RPC — Day 4 (2026-05-25)                                ║
-- ║                                                                       ║
-- ║ create_consulting_booking(uid, time_slot_id, application_id):         ║
-- ║   1. slot 잠금 (SELECT … FOR UPDATE) — 동시 예약 race 차단                 ║
-- ║   2. slot.status='available' 재확인                                       ║
-- ║   3. application 본인 소유 + entitlement 확인                                ║
-- ║   4. season_consult_3 시기 슬롯 자동 매칭 (slot.start_at 기준)                ║
-- ║   5. booking INSERT (UNIQUE time_slot_id 로 동시성 보장)                     ║
-- ║   6. time_slot.status='booked' UPDATE                                  ║
-- ║   7. entitlement timeSlots[ts].usedAt set (시기 지정 한정)                   ║
-- ║                                                                       ║
-- ║ cancel_consulting_booking(uid, booking_id, reason):                   ║
-- ║   1. booking 잠금 + 본인 소유 확인                                            ║
-- ║   2. 24시간 전 정책 검증                                                      ║
-- ║   3. booking UPDATE status='cancelled'                                  ║
-- ║   4. time_slot.status='available' 복귀                                  ║
-- ║   5. entitlement 환불 (timeSlots[ts].usedAt 제거, remaining++)               ║
-- ║                                                                       ║
-- ║ 모든 RPC: SECURITY DEFINER + auth.uid() 검증 — RLS 우회하되 본인 확인.         ║
-- ║ 반환 형식: JSONB { ok: bool, code: text, ... }                            ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 보조: 시기 슬롯 매칭 — slot.start_at 시점에 사용 가능한 시기 슬롯 자동 선택
-- ═══════════════════════════════════════════════════════════════════════
-- season_consult_3 사용자가 X 일 슬롯을 예약할 때 사용 규칙:
--   - validFrom <= now() (이미 도래) + remaining ≥ 1 + usedAt is null
--   - 가장 이른 validFrom 부터 (전반기 슬롯이 후반기 슬롯에 침범 안 함)
-- consult_one / season_consult_1: 시기 매칭 없음 → 함수 호출 X.

-- ═══════════════════════════════════════════════════════════════════════
-- create_consulting_booking
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_consulting_booking(
  p_user_id UUID,
  p_time_slot_id UUID,
  p_application_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_slot RECORD;
  v_app  RECORD;
  v_ent  RECORD;
  v_active JSONB;
  v_entry JSONB;
  v_entry_idx INT;
  v_consulting JSONB;
  v_timed JSONB;
  v_ts_key TEXT;
  v_ts_meta JSONB;
  v_picked_idx INT := -1;
  v_picked_ts TEXT;
  v_picked_validfrom_ms BIGINT;
  v_now_ms BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
  v_untimed_credit BOOLEAN := FALSE;
  v_booking_id UUID;
  v_total_unexpired INT := 0;
  v_used_count INT := 0;
BEGIN
  -- 1. slot 잠금 + 가용 확인
  SELECT id, start_at, end_at, status INTO v_slot
  FROM consulting_time_slots
  WHERE id = p_time_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_not_found');
  END IF;
  IF v_slot.status <> 'available' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  END IF;
  IF v_slot.start_at <= NOW() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'slot_in_past');
  END IF;

  -- 2. application 존재 + 본인 소유
  SELECT id INTO v_app
  FROM consulting_applications
  WHERE id = p_application_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'application_not_owned');
  END IF;

  -- 3. entitlement 잠금 + 컨설팅 권한 점검
  SELECT active INTO v_ent
  FROM user_entitlements
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_consulting_credit');
  END IF;
  v_active := COALESCE(v_ent.active, '[]'::jsonb);

  -- 4. 사용 가능 슬롯 선택 — 우선순위 (a) 시기 지정 가용, (b) 시기 미지정 (consult_one/season_consult_1)
  --    season_consult_3 의 가용 시기 슬롯: validFrom <= now, remaining ≥ 1, usedAt 없음.
  v_picked_validfrom_ms := 9999999999999;
  FOR v_entry_idx IN 0..jsonb_array_length(v_active) - 1 LOOP
    v_entry := v_active->v_entry_idx;
    IF (v_entry->>'productKind') NOT IN ('consult_one', 'season_consult_1', 'season_consult_3') THEN CONTINUE; END IF;
    -- validUntil 만료 확인
    IF v_entry ? 'validUntil' AND (v_entry->>'validUntil')::timestamptz <= NOW() THEN CONTINUE; END IF;
    v_total_unexpired := v_total_unexpired + 1;

    v_consulting := v_entry #> '{bundleContents,consulting}';
    v_timed := v_consulting->'timeSlots';

    IF v_timed IS NULL OR v_timed = 'null'::jsonb THEN
      -- 시기 미지정 — 잠재 untimed credit. 실제 사용 가능 여부는 booking 카운트 차감 후 결정.
      v_untimed_credit := TRUE;
    ELSE
      FOR v_ts_key IN SELECT jsonb_object_keys(v_timed) LOOP
        v_ts_meta := v_timed->v_ts_key;
        IF (v_ts_meta->>'remaining')::int <= 0 THEN CONTINUE; END IF;
        IF v_ts_meta ? 'usedAt' AND (v_ts_meta->>'usedAt') IS NOT NULL THEN CONTINUE; END IF;
        IF (v_ts_meta->>'validFrom')::timestamptz > NOW() THEN CONTINUE; END IF;
        -- 가장 이른 validFrom 우선
        IF EXTRACT(EPOCH FROM (v_ts_meta->>'validFrom')::timestamptz)::BIGINT * 1000 < v_picked_validfrom_ms THEN
          v_picked_validfrom_ms := EXTRACT(EPOCH FROM (v_ts_meta->>'validFrom')::timestamptz)::BIGINT * 1000;
          v_picked_idx := v_entry_idx;
          v_picked_ts := v_ts_key;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 5. 가용 슬롯 없음 → 거부
  IF v_picked_idx < 0 AND NOT v_untimed_credit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_consulting_credit', 'totalUnexpired', v_total_unexpired);
  END IF;

  -- 6. 시기 미지정 슬롯만 가용한 경우 — booking 카운트 ≥ 시기 미지정 슬롯 수 검증
  IF v_picked_idx < 0 AND v_untimed_credit THEN
    DECLARE
      v_untimed_total INT := 0;
      v_untimed_used INT := 0;
      v_existing_bookings INT;
    BEGIN
      FOR v_entry_idx IN 0..jsonb_array_length(v_active) - 1 LOOP
        v_entry := v_active->v_entry_idx;
        IF (v_entry->>'productKind') = 'consult_one' THEN
          v_untimed_total := v_untimed_total + 1;
        ELSIF (v_entry->>'productKind') = 'season_consult_1' THEN
          v_untimed_total := v_untimed_total + COALESCE((v_entry #>> '{bundleContents,consulting,totalSlots}')::int, 0);
        END IF;
      END LOOP;
      SELECT COUNT(*) INTO v_existing_bookings
      FROM consulting_bookings
      WHERE user_id = p_user_id AND status = 'confirmed';
      v_used_count := v_existing_bookings;
      -- 시기 지정 슬롯 usedAt 차감 (entitlement 에서 이미 빠진 만큼 booking 카운트 보정)
      DECLARE v_timed_used INT := 0;
      BEGIN
        FOR v_entry_idx IN 0..jsonb_array_length(v_active) - 1 LOOP
          v_entry := v_active->v_entry_idx;
          v_timed := v_entry #> '{bundleContents,consulting,timeSlots}';
          IF v_timed IS NULL THEN CONTINUE; END IF;
          FOR v_ts_key IN SELECT jsonb_object_keys(v_timed) LOOP
            IF (v_timed->v_ts_key) ? 'usedAt' AND ((v_timed->v_ts_key)->>'usedAt') IS NOT NULL THEN
              v_timed_used := v_timed_used + 1;
            END IF;
          END LOOP;
        END LOOP;
        v_untimed_used := GREATEST(0, v_existing_bookings - v_timed_used);
      END;
      IF v_untimed_used >= v_untimed_total THEN
        RETURN jsonb_build_object('ok', false, 'code', 'no_consulting_credit');
      END IF;
    END;
  END IF;

  -- 7. booking INSERT — UNIQUE(time_slot_id) 제약이 동시 race 차단
  INSERT INTO consulting_bookings (user_id, time_slot_id, application_id, status)
  VALUES (p_user_id, p_time_slot_id, p_application_id, 'confirmed')
  RETURNING id INTO v_booking_id;

  -- 8. time_slot.status='booked'
  UPDATE consulting_time_slots SET status = 'booked', updated_at = NOW() WHERE id = p_time_slot_id;

  -- 9. 시기 지정 슬롯이면 entitlement.active jsonb 갱신
  IF v_picked_idx >= 0 THEN
    v_active := jsonb_set(
      v_active,
      ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'usedAt'],
      to_jsonb(NOW()::text)
    );
    v_active := jsonb_set(
      v_active,
      ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'],
      to_jsonb(GREATEST(0, COALESCE((v_active #>> ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'])::int, 1) - 1))
    );
    UPDATE user_entitlements SET active = v_active, updated_at = NOW() WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bookingId', v_booking_id,
    'slotStartAt', v_slot.start_at,
    'slotEndAt', v_slot.end_at,
    'consumedTimeSlot', v_picked_ts
  );

EXCEPTION
  WHEN unique_violation THEN
    -- UNIQUE(time_slot_id) 충돌 — 동시 race
    RETURN jsonb_build_object('ok', false, 'code', 'slot_unavailable');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- cancel_consulting_booking — 24시간 전 정책 + 환불
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_consulting_booking(
  p_user_id UUID,
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_booking RECORD;
  v_slot RECORD;
  v_ent RECORD;
  v_active JSONB;
  v_entry JSONB;
  v_entry_idx INT;
  v_timed JSONB;
  v_ts_key TEXT;
  v_refunded_ts TEXT := NULL;
  v_min_cancel_at TIMESTAMPTZ;
BEGIN
  -- 1. booking 잠금
  SELECT b.id, b.user_id, b.time_slot_id, b.status, b.created_at, s.start_at
  INTO v_booking
  FROM consulting_bookings b
  JOIN consulting_time_slots s ON s.id = b.time_slot_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_not_found');
  END IF;
  IF v_booking.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_owner');
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'currentStatus', v_booking.status);
  END IF;

  -- 2. 24시간 전 정책
  v_min_cancel_at := v_booking.start_at - INTERVAL '24 hours';
  IF NOW() > v_min_cancel_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'cancellation_window_expired',
      'minCancelAt', v_min_cancel_at,
      'slotStartAt', v_booking.start_at
    );
  END IF;

  -- 3. booking UPDATE
  UPDATE consulting_bookings
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_booking_id;

  -- 4. time_slot 복귀 (다른 booking 차지 X — UNIQUE 보장)
  UPDATE consulting_time_slots
  SET status = 'available', updated_at = NOW()
  WHERE id = v_booking.time_slot_id;

  -- 5. entitlement 환불 — 시기 지정 슬롯의 usedAt 제거 (가장 최근 사용 1건)
  SELECT active INTO v_ent FROM user_entitlements WHERE user_id = p_user_id FOR UPDATE;
  IF FOUND THEN
    v_active := COALESCE(v_ent.active, '[]'::jsonb);
    -- 가장 최근 usedAt 슬롯 찾기 (= 마지막 사용분 환불)
    DECLARE
      v_latest_used_ms BIGINT := 0;
      v_picked_idx INT := -1;
      v_picked_ts TEXT;
      v_used_ms BIGINT;
    BEGIN
      FOR v_entry_idx IN 0..jsonb_array_length(v_active) - 1 LOOP
        v_entry := v_active->v_entry_idx;
        v_timed := v_entry #> '{bundleContents,consulting,timeSlots}';
        IF v_timed IS NULL THEN CONTINUE; END IF;
        FOR v_ts_key IN SELECT jsonb_object_keys(v_timed) LOOP
          IF NOT ((v_timed->v_ts_key) ? 'usedAt') THEN CONTINUE; END IF;
          IF ((v_timed->v_ts_key)->>'usedAt') IS NULL THEN CONTINUE; END IF;
          v_used_ms := EXTRACT(EPOCH FROM ((v_timed->v_ts_key)->>'usedAt')::timestamptz)::BIGINT * 1000;
          IF v_used_ms > v_latest_used_ms THEN
            v_latest_used_ms := v_used_ms;
            v_picked_idx := v_entry_idx;
            v_picked_ts := v_ts_key;
          END IF;
        END LOOP;
      END LOOP;

      IF v_picked_idx >= 0 THEN
        v_active := jsonb_set(
          v_active,
          ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'usedAt'],
          'null'::jsonb
        );
        v_active := jsonb_set(
          v_active,
          ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'],
          to_jsonb(COALESCE((v_active #>> ARRAY[v_picked_idx::text, 'bundleContents', 'consulting', 'timeSlots', v_picked_ts, 'remaining'])::int, 0) + 1)
        );
        UPDATE user_entitlements SET active = v_active, updated_at = NOW() WHERE user_id = p_user_id;
        v_refunded_ts := v_picked_ts;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bookingId', p_booking_id,
    'status', 'cancelled',
    'refundedTimeSlot', v_refunded_ts
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 권한 — authenticated role 만 호출 가능 (RLS 가 아닌 RPC 단)
-- ═══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.create_consulting_booking(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consulting_booking(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.create_consulting_booking(UUID, UUID, UUID) IS
  'Day 4 — 컨설팅 예약 트랜잭션. slot 잠금 + booking INSERT + entitlement 차감. season_consult_3 시기 슬롯 자동 매칭.';
COMMENT ON FUNCTION public.cancel_consulting_booking(UUID, UUID, TEXT) IS
  'Day 4 — 예약 취소 트랜잭션. 24시간 전 정책 + slot 복귀 + entitlement 환불 (시기 지정 슬롯 usedAt 제거).';
