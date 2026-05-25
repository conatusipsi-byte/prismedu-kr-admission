# 2026-05-26 — 컨설팅 시스템 출시 후 / 별도 견적 작업 목록

**상태**: 미착수 (의도적, 본 PR 범위 외)
**관련**: `docs/consulting-system-complete.md`

7일 작업으로 컨설팅 시스템 코드는 완성됐으나, 다음 항목은 본 견적 범위 밖이거나
운영 진입 후에만 의미가 있어 별도 작업으로 격리.

---

## A. 출시 전 외부 활성화 (운영자 작업)

본 PR 의 코드는 동작 준비 완료. 운영자가 다음 환경변수 / 데이터 입력 후 즉시 활성화:

| 항목 | 조치 | 담당 |
|---|---|---|
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | Vercel 환경변수 등록 | 클라이언트 (사업자등록 완료 후) |
| `RESEND_API_KEY` | 등록 | 운영자 |
| `MASTER_EMAILS` | 운영자 이메일 추가 | 운영자 |
| 컨설턴트 프로필 (`ConsultantProfile.tsx`) | 실명·약력·사진 교체 | 클라이언트 카피 + 디자인 |
| 가용 시간 시드 (`consulting_time_slots`) | 운영자 실제 가능 시간 입력 | 클라이언트 결정 후 admin 페이지 또는 SQL |

---

## B. 본 PR 미포함 (출시 후 우선순위 작업)

| 우선순위 | 항목 | 비고 |
|---|---|---|
| 🔴 P1 | 강제 취소 시 사용자 알림 메일 | 운영자가 강제 취소했을 때 사용자에게 이유 통보. Resend 템플릿 1건 추가 |
| 🟠 P2 | booking ↔ order_id 매핑 컬럼 | admin 페이지에서 결제 정보 직접 조회. 마이그레이션 + 결제 webhook 보강 |
| 🟠 P2 | 미예약 신청서 자동 cleanup | 30일 이상 booking 없는 application 자동 삭제 (또는 archive). cron + RLS 검토 |
| 🟡 P3 | 컨설턴트 프로필 admin 페이지 | 운영자가 프로필을 코드 변경 없이 갱신. 단일 컨설턴트 운영 동안엔 후순위 |
| 🟡 P3 | 가용 시간 admin 페이지 | 현재 SQL/시드 스크립트 의존. 운영 진입 시 admin UI 필요 |

---

## C. 본 견적 명시 제외 (계약서 제3조, 별도 견적 필요)

| 항목 | 비고 |
|---|---|
| 알림톡(카카오) 발송 | 외부 API 가입 + 비용 |
| 외부 캘린더 연동 (Google/Outlook) | OAuth + sync 로직 |
| Zoom/Meet 자동 미팅 링크 생성 | 외부 API + 컨설팅 진행 도구 통합 |
| 관리자 통계 대시보드 | 차트·집계·기간 비교 (본 PR 단순 카운트만) |
| 다중 컨설턴트 운영 | 컨설턴트 마스터 테이블 + 슬롯-컨설턴트 매핑 + 사용자 선택 UI |
| 컨설팅 후기/평가 | 사용자 입력 + admin 관리 + 공개 노출 정책 |
| 환불 자동화 (토스 cancel API) | 현재는 entitlement 환불만, 토스 결제 환불은 운영자 수동 |

---

## D. 기술 부채

### D-1. RPC 단 검증 한계

`create_consulting_booking` / `cancel_consulting_booking` RPC 의 트랜잭션 정확성을
JS 단 테스트로는 100% 검증 불가. prod DB 에서 다음 시나리오 직접 검증 권장:
- 동시 예약 race (동일 slot 에 2명 동시 POST → UNIQUE 충돌)
- season_consult_3 시기 슬롯 자동 매칭 (가장 이른 validFrom 선택)
- 강제 취소 시 entitlement.active jsonb 갱신 (사용자 row 잠금)

### D-2. 영수증 메일 발송 보장 X

`sendPaymentReceipt()` 가 비동기 fire-and-forget. 발송 실패는 Sentry 캡처만,
재시도 큐 없음. 메일 SLA 가 중요해지면 큐(Vercel Cron + outbox 테이블) 추가 검토.

### D-3. cancellation_reason 일관성

일반 취소 → `reason` 그대로. 강제 취소 → `admin_override:` prefix. 표시 측에서
prefix 기반 구분이지만 enum 화하지 않음. 사유 분류가 늘면 enum + 별도 컬럼 분리 권장.

### D-4. timeSlot 환불 정확성

cancel RPC 의 시기 슬롯 환불은 "가장 최근 usedAt" 을 찾아 복구. booking ↔ timeSlot
1:1 대응을 가정하지만 booking row 에는 어떤 timeSlot 을 소비했는지 명시 컬럼이 없다.
대부분 케이스에서 정확하지만, 사용자가 단기간에 여러 시기 슬롯을 사용 후 취소 시 정확성
보장이 약함. `consulting_bookings.consumed_time_slot` 컬럼 추가 권장.

---

## E. 시각 검수 (운영자 측 확인 필요)

본 PR 의 자동 검증 한계 — 다음은 환경변수 설정 후 운영자가 직접 확인:

1. **결제 흐름**: 5종 상품 각 1회 결제 (TOSS 활성화 후)
2. **영수증 메일 수신**: 각 상품 영수증의 한국어 사용 안내 정확성
3. **시기 지정 UX**: season_consult_3 사용자가 캘린더에서 미도래 슬롯 tooltip 인지 명확한지
4. **관리자 페이지 정상 동작**: 운영자 직접 시연
5. **모바일 UX**: 컨설팅 페이지 + 캘린더 + my-bookings 가 모바일 (375px) 에서 정상 표시
