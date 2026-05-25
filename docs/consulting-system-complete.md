# 컨설팅 예약 시스템 — 완성 보고

**Date**: 2026-05-26
**Status**: ✅ 코드 완성 (외부 활성화 대기)
**계약**: 2026-05-21 추가 계약 (+110만원, 7일 작업)

---

## 1. 시스템 개요

1:1 입시 컨설팅 (60분) 의 결제 → 신청서 → 예약 → 수행 → 이력 전 흐름.
4종 컨설팅 상품 (단건 + 시즌권 번들 × 2 + 시기 지정 패키지) 지원.

### 1.1 사용자 흐름

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ /pricing │ → │ /payment │ → │/consulting│ → │my-booking│
│   카탈로그  │   │  토스결제 │   │ 캘린더+신청서│   │   이력    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
                     ↓                ↓             ↓
              /api/payment/      /api/consulting/  /api/consulting/
              confirm (RPC X)    bookings (RPC)    bookings/[id] PATCH
                     ↓                ↓             ↓
              user_entitlements  consulting_       consulting_bookings
              .active 갱신       bookings INSERT   .status=cancelled
              + 영수증 메일      + time_slot 점유   + time_slot 복귀
                                + entitlement 차감 + entitlement 환불
```

### 1.2 관리자 흐름

```
/admin/consulting → 4 탭 (예정/완료/취소/미예약)
                  → 카드 액션 (메모/상태/강제 취소)
                  → /api/admin/consulting/bookings (GET, PATCH)
```

---

## 2. DB 스키마

마이그레이션:
- `20260522100000_consulting_system.sql` — 3개 테이블 + RLS (Day 1)
- `20260525150000_consulting_booking_rpcs.sql` — create + cancel RPC (Day 4)
- `20260525200000_admin_booking_notes_and_force_cancel.sql` — admin_notes + force cancel (Day 6)

### 2.1 테이블

| 테이블 | 목적 | 핵심 컬럼 |
|---|---|---|
| `consulting_time_slots` | 예약 가능 시간 마스터 | id, start_at, end_at, status (`available`/`booked`/`blocked`), duration_minutes |
| `consulting_applications` | 신청서 | user_id, student_name, consultation_topics[], questions |
| `consulting_bookings` | 예약 (슬롯+신청서 결합) | user_id, time_slot_id (UNIQUE), application_id, status, admin_notes |

### 2.2 RPC 함수

| 함수 | 역할 | 트랜잭션 안전성 |
|---|---|---|
| `create_consulting_booking(uid, slot_id, app_id)` | 예약 생성 + entitlement 차감 | SELECT … FOR UPDATE 로 slot 잠금 → UNIQUE 제약으로 race 차단 |
| `cancel_consulting_booking(uid, booking_id, reason, force)` | 취소 + slot 복귀 + 환불 | booking 잠금 + entitlement 잠금 + 24h 정책 (force=true 우회) |

### 2.3 entitlement.active jsonb 모양 (4 상품)

```jsonc
// consult_one (단건)
{ "orderId": "...", "productKind": "consult_one", "validUntil": "...", "grantedAt": "..." }

// season_consult_1 (시기 미지정 번들)
{
  "orderId": "...", "productKind": "season_consult_1", "validUntil": "...", "grantedAt": "...",
  "bundleContents": {
    "subscription": { "active": true },
    "consulting": { "totalSlots": 1 }
  }
}

// season_consult_3 (시기 지정 번들)
{
  "orderId": "...", "productKind": "season_consult_3", ...,
  "bundleContents": {
    "subscription": { "active": true },
    "consulting": {
      "totalSlots": 3,
      "timeSlots": {
        "before_june": { "remaining": 1, "validFrom": "2026-06-01T00:00:00+09:00" },
        "before_sept": { "remaining": 1, "validFrom": "2026-09-01T00:00:00+09:00" },
        "after_csat":  { "remaining": 1, "validFrom": "2026-11-14T00:00:00+09:00" }
      }
    }
  }
}

// consult_one + booking 사용 후 (timed slot 사용 표시)
"timeSlots": {
  "before_june": { "remaining": 0, "usedAt": "2026-06-10T...", "validFrom": "..." }
}
```

---

## 3. API 엔드포인트

### 3.1 사용자 routes

| Method | Path | 책임 | 정책 |
|---|---|---|---|
| GET | `/api/consulting/slots?from&to` | 가용 슬롯 목록 (1주) | 공개 (캐시 60s) |
| POST | `/api/consulting/applications` | 신청서 INSERT | entitlement 보유 필수 |
| GET | `/api/consulting/applications` | 본인 신청 이력 | 인증 |
| POST | `/api/consulting/bookings` | 예약 생성 (RPC) | entitlement.hasAccess |
| GET | `/api/consulting/bookings` | 본인 예약 (upcoming/past/cancelled) | 인증 |
| PATCH | `/api/consulting/bookings/[id]` | 취소 (RPC) | 본인 + 24h 정책 |

### 3.2 관리자 routes

| Method | Path | 책임 | 정책 |
|---|---|---|---|
| GET | `/api/admin/consulting/bookings` | 전체 예약 + 사용자 JOIN | requireMasterAuth |
| PATCH | `/api/admin/consulting/bookings/[id]` | adminNotes/setStatus/forceCancel | requireMasterAuth |
| GET | `/api/admin/consulting/applications?filter=unbooked` | 미예약 신청서 | requireMasterAuth |

---

## 4. 권한 정책

### 4.1 사용자 진입 가드

| 경로 | middleware | layout | 추가 |
|---|---|---|---|
| `/consulting` | 세션 쿠키 검사 | 세션 검증 | page.tsx 에서 entitlement.hasAccess 미보유 + pendingFutureSlots=0 → /pricing#consulting |
| `/consulting/my-bookings` | 동일 | 동일 | entitlement 게이트 우회 (이력 조회 권리) |

### 4.2 관리자 진입 가드 (다층)

1. middleware (Edge) — 세션 쿠키 없으면 즉시 redirect
2. `/admin/layout.tsx` (Node) — `requireMasterAuthFromHeaders()` 실패 → `notFound()` (404 위장, 존재 비공개)
3. API routes — `requireMasterAuth(req)` → 비-master 403

### 4.3 RLS (Supabase)

- `consulting_time_slots`: 공개 SELECT, service_role INSERT/UPDATE
- `consulting_applications`: 본인 row CRUD, service_role 전체
- `consulting_bookings`: 본인 row SELECT/INSERT/UPDATE, service_role 전체

---

## 5. 시기 지정 정책 (season_consult_3)

### 5.1 시기 정의 (lib/plans.ts)

| 시기 | validFrom (KST) | 의미 |
|---|---|---|
| `before_june` | 2026-06-01 00:00 | 6월 모의평가 이후 |
| `before_sept` | 2026-09-01 00:00 | 9월 모의평가 이후 |
| `after_csat` | 2026-11-14 00:00 | 2026 수능일 이후 |

### 5.2 가용성 판정 규칙

슬롯이 예약 가능하려면 다음 OR:
1. `untimedRemaining > 0` (consult_one + season_consult_1)
2. 어떤 timedSlot 에 대해 `validFrom <= slot.start_at AND remaining >= 1 AND usedAt is null`

### 5.3 시기 슬롯 매칭 (RPC)

`create_consulting_booking` 가 가용 시기 슬롯 중 가장 이른 `validFrom` 부터 차감 — 전반기 슬롯이 후반기 슬롯을 침범하지 않도록.

### 5.4 환불 (cancel RPC)

가장 최근 `usedAt` 슬롯의 `usedAt=null`, `remaining++` — booking 과 시기 슬롯의 1:1 대응 가정.

---

## 6. 결제 + 영수증

### 6.1 결제 흐름

1. `/payment` 카드 → `/api/payment/request` (orderId 생성, `getEffectivePriceKrw` 적용)
2. 토스 SDK `loadTossPayments(NEXT_PUBLIC_TOSS_CLIENT_KEY)`
3. 사용자 결제 → `/payment/success?paymentKey&orderId&amount`
4. 클라이언트가 `/api/payment/confirm` POST → 토스 confirm → entitlement 부여 → 영수증 메일

### 6.2 가격 정책 (P-014)

| 상품 | 얼리버드 (~2027.03) | 정가 | 유효 |
|---|---|---|---|
| report_one | ₩9,900 | (placeholder) | 30일 |
| season_pass | ₩29,000 | ₩40,000 | 180일 |
| consult_one | ₩180,000 | — | 60일 |
| season_consult_1 | ₩190,000 | ₩300,000 | 180일 |
| season_consult_3 | ₩490,000 | ₩700,000 | 365일 |

### 6.3 영수증 메일 (Resend)

상품별 사용 안내 분기:
- consult_one: `/consulting` 예약 + 60일 안내
- season_pass: 즉시 활성 + 180일 안내
- season_consult_1: 시즌권 즉시 + 컨설팅 1회 (시기 무관)
- season_consult_3: 시즌권 즉시 + 시기별 사용 가능일 (2026-06-01 / 09-01 / 11-14)

발송 실패 시 결제 성공 응답 유지 (Sentry 캡처, 사용자 차단 X).

---

## 7. 환경변수 의존성

| 변수 | 필수 | 영향 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 전체 동작 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role RPC + auth.admin |
| `TOSS_SECRET_KEY` | 결제 활성 | webhook confirm |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 결제 활성 | /payment 카드 활성화 (BUG-005 패턴) |
| `RESEND_API_KEY` | 영수증 활성 | 결제 후 메일. 없으면 silent skip |
| `MASTER_EMAILS` | 관리자 활성 | /admin/consulting 접근 |

---

## 8. 테스트

총 678 회귀 (Day 7 완료 시점):
- Day 1-3: 신청서 + slots + 인증
- Day 4: booking RPC + 캘린더 필터 + my-bookings (25)
- Day 5: 결제 webhook 번들 분기 + 영수증 (18)
- Day 6: 관리자 API + 권한 가드 (12)
- Day 7: 시나리오 + 경계 케이스 (15)

### 8.1 한계 (의도된)

- jsdom 환경 — 실 브라우저 동작 (네트워크 latency, 동시성) 미시뮬레이션
- 토스 SDK 실 호출 X (TOSS 키 의존)
- RPC 트랜잭션 — JS 단에서 mocked, 실 동작은 prod DB 에서 검증
- E2E (Playwright) — 환경변수 미설정 상태로 미수행

---

## 9. 정직성 원칙 (P-002) 적용

- 시기 정책 사용자 명시 (배너 + tooltip + 영수증)
- 24시간 취소 정책 명시 (카드 + confirm modal + 정책 안내)
- 동시 race 차단: DB UNIQUE → 친화적 에러
- 환불 후 어떤 슬롯 복구됐는지 즉시 표시
- 관리자 메모 사용자 비공개 (UI 라벨 + API 응답 분리)
- 관리자 페이지 비공개 (404 위장, SEO 차단)
