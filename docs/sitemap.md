# 사이트맵 — 한국 대학 입시 서비스 (conatusipsi.com)

본 문서는 화면 단위의 라우트 구조와 페이지별 컴포넌트·API·인증 요구사항을 정리합니다. prismedu.kr 의 어떤 자산을 재사용·수정·신규 작성하는지 함께 명시.

코드 변경 전 본 문서를 먼저 갱신하는 것이 정합성 유지의 원칙(`docs/policy.md` §0.2 와 동일).

---

## 0. 분류 기호

| 기호 | 의미 |
|---|---|
| ♻️ | prismedu.kr 자산 그대로 재사용 (텍스트만 일부 교체) |
| 🔧 | prismedu.kr 패턴 골격 유지, 도메인 데이터·UI 라벨 교체 |
| ✨ | 신규 작성 |

| 인증 | 의미 |
|---|---|
| 🌐 | 비로그인 접근 가능 (SEO 노출) |
| 🔒 | Firebase Auth 토큰 필수 |
| 👑 | `admins` 도큐먼트 + active=true |

---

## 1. 라우트 트리

```
conatusipsi.com
├── / (랜딩)                                        🌐 🔧
│
├── /admissions                                     🌐 🔧
│   ├── /admissions/[universityId]                  🌐 ✨  (대학 상세)
│   ├── /admissions/[universityId]/[departmentId]   🌐 ✨  (학과 상세 — 모집요강)
│   └── /admissions/jaeoegukmin                     🌐 ✨  (재외국민·외국인 별도 라우트)
│
├── /pricing                                        🌐 🔧
│
├── /privacy /terms /refund /help                   🌐 ♻️
│
├── /login                                          🌐 🔧  (카카오 로그인 + 이메일)
├── /onboarding                                     🔒 🔧  (첫 로그인 시)
│
├── /dashboard                                      🔒 🔧  (메인)
├── /profile                                        🔒 🔧
├── /analysis                                       🔒 🔧  (목록)
│   └── /analysis/[id]                              🔒 🔧  (단일 분석 상세)
├── /compare                                        🔒 🔧
├── /what-if                                        🔒 🔧
├── /chat                                           🔒 🔧
├── /planner                                        🔒 🔧
├── /spec-analysis                                  🔒 🔧
│
├── /payment                                        🔒 🔧
│   ├── /payment/success                            🔒 🔧
│   └── /payment/fail                               🔒 🔧
├── /orders                                         🔒 ✨
│
└── /admin                                          👑 ✨
    ├── /admin/admissions                           👑 ✨
    ├── /admin/users                                👑 ✨
    ├── /admin/orders                               👑 ✨
    ├── /admin/etl-status                           👑 ✨
    ├── /admin/sample-stats                         👑 ✨
    └── /admin/sanitize-monitor                     👑 ✨
```

---

## 2. 페이지 정의

각 페이지에 대해 핵심 컴포넌트·API·인증·재사용 매핑.

### 2.1 공개 페이지

#### `/` — 랜딩

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | 🔧 (prismedu.kr `app/page.tsx`) |
| 핵심 컴포넌트 | ♻️ `AuthSection`, ♻️ `TrustSignalBar`, ♻️ `LiveStatsBar`, ♻️ `PersonaSection`, ♻️ `FAQAccordion`, ♻️ `OnboardingSlides`, ♻️ `AsideHighlights`, 🔧 `SampleReportShowcase` |
| API | `GET /api/stats/live` (실시간 사용자 수·합격사례 수) |
| 메타데이터 | OpenGraph + JSON-LD (FAQPage·Organization·WebSite) — prismedu.kr 패턴 |
| 변경 핵심 | 미국 입시 → 한국 입시 카피 / FAQ 교체 (`lib/landing-faq.ts`) |

#### `/admissions` — 대학·학과 검색·조회

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | 🔧 (prismedu.kr `app/admissions/`) |
| 핵심 컴포넌트 | 🔧 `AdmissionFeed` (피드형 → 학과 검색 그리드), ♻️ `SchoolLogo`, ✨ `DepartmentSearchBar`, ✨ `RegionFilter`, ✨ `TrackFilter` |
| API | `GET /api/universities?q=&category=&region=`, `GET /api/departments?track=&keyword=` |
| 핵심 동작 | 학과 단위 검색 (대학 + 학과 조합), 카테고리(서울권/거점국립/지방사립/특수)·계열·전형 필터 |
| 변경 핵심 | 단일 학교 단위 → 학과 단위 (P-002 결정 무관, 도메인 차이) |

#### `/admissions/[universityId]` — 대학 상세

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | ✨ (prismedu.kr엔 학교 단위 상세만 존재) |
| 핵심 컴포넌트 | ✨ `UniversityHeader` (로고·캠퍼스), ♻️ `Skeleton`, ✨ `DepartmentList` (그 대학 학과 목록) |
| API | `GET /api/universities/[uid]` |

#### `/admissions/[universityId]/[departmentId]` — 학과 상세 (모집요강)

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 (P-001: 정형 정보 무료 공개) |
| 분류 | ✨ |
| 핵심 컴포넌트 | ✨ `AdmissionTracksTable` (전형 종류별 모집인원·일정·반영비), ✨ `CsatMinimumBlock` (자동 판정 가능 시 충족/미충족 배지, 불가 시 `originalText`), ✨ `PrevYearResultCard`, ✨ `RequiredAreasBadge` (응시영역 자격), 🔧 `AdmissionResultModal` |
| API | `GET /api/universities/[uid]/[did]`, `GET /api/admissions/[uid]/[did]/[year]`, `GET /api/admissions/sample-stats/[uid]/[did]/[year]` |
| 무료/유료 게이트 | 모집요강·일정·반영비·응시영역 = 무료. **합격률 분석 카드만 락** (P-001) |

#### `/admissions/jaeoegukmin` — 재외국민·외국인 전형

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | ✨ (P-013) |
| 핵심 컴포넌트 | ✨ `EligibilityChecker` (해외 거주 기간·외국 국적 등 자격 자가진단), ✨ `JaeoegukminTracksList` |
| API | `GET /api/admissions/jaeoegukmin?eligibility=...` |
| 분기 정책 | 일반 한국 학생 입시 플로우와 분리. 자격 미충족자가 일반 매칭에서 노출되지 않도록 별도 라우트. |

#### `/pricing` — 요금제

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | 🔧 (prismedu.kr `app/pricing/`) |
| 핵심 컴포넌트 | 🔧 `PlanCard` (단건/시즌권/구독 호환 표현) |
| API | (정적 데이터 `lib/plans.ts`) |
| 변경 핵심 | 미국 SaaS 가격 → 단건 결제 + 시즌권 (P-013 무관, 결제 모델 차이) |

#### `/privacy` `/terms` `/refund` `/help`

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | ♻️ (텍스트만 한국 입시 도메인으로 교체) |

---

### 2.2 인증 페이지

#### `/login`

| 항목 | 내용 |
|---|---|
| 인증 | 🌐 |
| 분류 | 🔧 |
| 핵심 컴포넌트 | ♻️ `AuthSection` (Kakao/Email 로그인 버튼), ♻️ `AuthGate` |
| API | `POST /api/auth/kakao`, `POST /api/auth/session` |
| 변경 핵심 | 거의 그대로. 카카오 OAuth Redirect URI 교체 (setup.md §3.3) |

#### `/onboarding` — 첫 로그인 프로필·성적 입력

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/onboarding/`) |
| 핵심 컴포넌트 | 🔧 `AnalysisFormWizard` 골격 재사용, 입력 단계 변경: ① 학년·학기 ② 내신(`SchoolRecord.gpaByTerm`) ③ 수능/모의(`CsatScore`) ④ 비교과(`SchoolActivity`) ⑤ 의향(수시 6장 + 정시 가/나/다) |
| API | `POST /api/users/[uid]/specs`, `POST /api/intent/validate` (P-003) |
| 변경 핵심 | US Specs(SAT/AP/EC tier) → KR Specs (등급/표준점수/생기부) |
| 검증 | 의향 입력 시 가/나/다군 단일 슬롯 강제, 수시 6장 한도 — `firestore.rules` `validIntent()` + API 트랜잭션 |

---

### 2.3 사용자 페이지 (인증 필요)

#### `/dashboard` — 메인 대시보드

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/dashboard/`) |
| 핵심 컴포넌트 | 🔧 `TodayFocusCard` (D-Day → 수능/원서접수/면접 등), 🔧 `DashboardTipCard`, ✨ `JeongsiSlotProgress` (가/나/다군 슬롯 채움 상태), ✨ `SusiSlotProgress` (수시 6장 진행), ♻️ `AdmissionFeed`, ♻️ `Sparkline` (모의 점수 추이) |
| API | `GET /api/users/me`, `GET /api/users/me/specs/latest`, `GET /api/users/me/intent` |

#### `/profile` — 프로필·성적 수정

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 |
| 핵심 컴포넌트 | 🔧 onboarding 폼 컴포넌트 재사용 (수정 모드) |
| API | `PUT /api/users/[uid]/specs/[specId]` |

#### `/analysis` — 합격률 분석 목록

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/analysis/`) |
| 핵심 컴포넌트 | 🔧 `AnalysisFormWizard` (분석 트리거), 🔧 `AnalysisResultView`, 🔧 `SchoolModal` → ✨ `DepartmentModal` 전환, 🔧 `SchoolRow` → ✨ `DepartmentRow`, ✨ `HakjongProbabilityCard` (P-006 1단계×2단계 분해), ✨ `InsufficientSampleCard` (표본 부족) |
| API | `POST /api/match` |
| 무료/유료 게이트 | Free preview 20개 학과 + 표본 부족 학과 무제한. Pro/Elite 무제한. |

#### `/analysis/[id]` — 분석 상세

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 |
| 핵심 컴포넌트 | 🔧 `AnalysisResultView` 상세 모드, ✨ `ProbabilityBreakdown` (학종 단계 분해), ♻️ `ProbabilityReveal` (애니메이션) |
| API | `GET /api/match/[id]` |

#### `/compare` — 대학·학과 비교

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/compare/`) |
| 핵심 컴포넌트 | 🔧 비교 그리드 (학교·학과별 합격률·모집인원·전년 컷·수능최저 비교) |
| API | `POST /api/compare` |
| 무료/유료 게이트 | Pro/Elite 전용 |

#### `/what-if` — 가정 시뮬레이터

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/what-if/`) |
| 핵심 컴포넌트 | 🔧 슬라이더 UI, ✨ KR 도메인 슬라이더 (수능 등급·내신·세특 점수) |
| API | `POST /api/match/simulate` |
| 무료/유료 게이트 | Pro/Elite 전용 |

#### `/chat` — AI 카운슬러

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/chat/`) |
| 핵심 컴포넌트 | 🔧 메시지 UI, ✨ `SanitizedBadge` (P-002 sanitize 발동 시 표시) |
| API | `POST /api/chat` (이번 PR 작성된 라우트 — `app/api/chat/route.ts`) |
| 무료/유료 게이트 | 무료 5회/일, 유료 무제한 (`PlanFeatures.aiChatDailyLimit`) |
| 정직성 가드 | `lib/prompts/counselor-guards.ts` + `lib/admission/counselor-postprocess.ts` |

#### `/planner` — 입시 플래너

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/planner/`) |
| 핵심 컴포넌트 | ♻️ `GeneratedTasksPreview`, 🔧 `TaskCategoryBadge` |
| API | `POST /api/planner/generate`, `GET /api/planner/tasks` |
| 카테고리 | 수능 준비 / 내신 / 원서접수 / 면접 / 논술 / 실기 / 자료준비 |
| 무료/유료 게이트 | Pro/Elite 전용 (`PlanFeatures.autoPlannerEnabled`) |

#### `/spec-analysis` — 스펙 분석

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/spec-analysis/`) |
| 핵심 컴포넌트 | 🔧 `SpecAnalysisPanel`, 🔧 `SpecAnalysisView` |
| API | `POST /api/spec-analysis` |
| 무료/유료 게이트 | Pro/Elite 전용 |

---

### 2.4 결제 관련

#### `/payment` — 결제 시작

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | 🔧 (prismedu.kr `app/payment/`) |
| 핵심 컴포넌트 | ♻️ Toss SDK 결제창 호출 |
| API | `POST /api/payment/request` |

#### `/payment/success` `/payment/fail`

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | ♻️ |
| API | `POST /api/payment/confirm` (success), 실패 로그 (fail) |
| 변경 | `parseOrderId` 패턴 그대로, 상품 ID 매핑만 한국 상품 카탈로그로 |

#### `/orders` — 주문 내역

| 항목 | 내용 |
|---|---|
| 인증 | 🔒 |
| 분류 | ✨ (prismedu.kr 의 `subscription/` 일부 패턴 차용) |
| 핵심 컴포넌트 | ✨ `OrderList`, ✨ `OrderDetail`, ✨ `RefundButton` (조건부 노출) |
| API | `GET /api/orders/me`, `POST /api/orders/[orderId]/refund-request` |

---

### 2.5 관리자 페이지

`👑 isMaster()` 권한 게이트.

#### `/admin` — 운영자 대시보드

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ (prismedu.kr 미구현) |
| 핵심 컴포넌트 | ✨ `AdminNotificationsList` (`monitoring/adminNotifications/items`), ✨ `KpiOverview` |
| API | `GET /api/admin/notifications` |

#### `/admin/admissions` — 모집요강 관리

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ |
| 핵심 컴포넌트 | ✨ `StagingDiffView` (operations.md §2 이월 검수), ✨ `PromoteButton`, ✨ `EncodingBadge` (OCR 의심 학과 ⚠️ 표시) |
| API | `GET /api/admin/admissions/staging`, `POST /api/admin/admissions/promote` |

#### `/admin/users`

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ |
| 핵심 컴포넌트 | ✨ `UserList`, ✨ `EntitlementEditor` (단건 권한 부여·회수) |
| API | `GET /api/admin/users`, `POST /api/admin/users/[uid]/grant`, `POST /api/admin/users/[uid]/revoke` |

#### `/admin/orders`

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ |
| 핵심 컴포넌트 | ✨ `OrderListAdmin`, ✨ `RefundProcessor` |
| API | `GET /api/admin/orders`, `POST /api/admin/orders/[orderId]/refund` |

#### `/admin/etl-status` — ETL 상태 모니터링

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ (P-007 + P-012 + operations.md §10) |
| 핵심 컴포넌트 | ✨ `EtlPhaseStatus` (initial / conversion 진행도), ✨ `EncodingStatsChart` (utf8/adobe_korea1/ocr 분포), ✨ `RetryRequiredQueue`, ✨ `TrackVocabPRList` (자동 PR 검수 대기 목록) |
| API | `GET /api/admin/etl/encoding-stats`, `GET /api/admin/etl/conversion-status`, `GET /api/admin/etl/retry-queue` |

#### `/admin/sample-stats` — 합격사례 표본 통계

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ (P-001 + P-005) |
| 핵심 컴포넌트 | ✨ `SampleStatsTable` (학과별 verifiedCount·weightedCount·acceptedCount), ✨ `InsufficientSampleList` (비공개 학과 목록), ✨ `CampaignTriggerList` (자가보고 캠페인 우선 학과) |
| API | `GET /api/admin/sample-stats?year=&trackKind=` |

#### `/admin/sanitize-monitor` — 카운슬러 후처리 발동률

| 항목 | 내용 |
|---|---|
| 인증 | 👑 |
| 분류 | ✨ (P-002, operations.md §6) |
| 핵심 컴포넌트 | ✨ `SanitizeRateChart` (일별 시계열), ✨ `PatternDistributionDonut`, ✨ `RecentEventsTable` (샘플링 20%), ✨ `TopContextSchools` |
| API | `GET /api/admin/sanitize/daily?from=&to=`, `GET /api/admin/sanitize/events?limit=` |

---

## 3. 라우트 그룹 요약 표

| 그룹 | 페이지 수 | ♻️ | 🔧 | ✨ |
|---|---|---|---|---|
| 공개 | 9 | 4 | 3 | 2 |
| 인증 | 2 | 0 | 2 | 0 |
| 사용자 | 9 | 0 | 9 | 0 |
| 결제 | 4 | 1 | 2 | 1 |
| 관리자 | 7 | 0 | 0 | 7 |
| **합계** | **31** | **5** | **16** | **10** |

재사용 비율: **♻️+🔧 = 21/31 (68%)** — `CLAUDE.md` 가 명시한 "prismedu.kr 코드 80% 재활용" 목표와 근접. 단, 재활용은 **컴포넌트·인프라 레이어**가 핵심이며 페이지 콘텐츠·도메인 로직은 대부분 🔧 수준의 수정 필요.

### MVP 출시 차단 요건 (Launch Blockers)

다음 페이지·플로우는 MVP 출시 시점에 **반드시** 동작해야 한다. 미동작 시 출시 연기.

| # | 페이지·플로우 | 차단 사유 | 연관 정책 |
|---|---|---|---|
| 1 | `/admissions/[universityId]/[departmentId]` | "분석은 유료, 정보는 무료" 마케팅 포지셔닝의 **핵심 무대**. 이 페이지 미동작 시 비로그인 SEO·전환 funnel 전체 붕괴. | P-001 |
| 2 | `/admissions/jaeoegukmin` | 외국 고교 출신 학생이 일반 분석 폼에 진입하면 자격 미충족만 받게 됨 — **사용자 이탈 직격**. 진입점 분리가 출시 차단 요건. | P-013 |
| 3 | `/admin/sanitize-monitor` | LLM 가드 회귀를 즉시 발견하지 못하면 정직성 원칙이 사실상 무력화. **운영 방어선**이 출시 시점에 동작해야 함. | P-002 |
| 4 | `/chat` | AI 카운슬러 = 핵심 기능 4번. 미동작 시 가치 제안 자체 소실. | P-002 |
| 5 | `/payment` + `/payment/success` + `/payment/fail` | **수익 발생 흐름**. 미동작 시 비즈니스 모델 자체 X. | — |

#### 메인 플로우 차단 요건

다음 5단계 플로우(user-flows.md §1.1)가 끊김 없이 동작해야 함:

```
가입 → 온보딩 → 첫 분석 → 결제 → 상세 분석
```

각 전이에서 1초 이상 지연·에러·빈 페이지 발생 시 출시 차단.

#### 출시 후 점진 추가 가능 (Non-blocker)

다음 페이지는 출시 후 점진 추가 가능:

- `/what-if` (Pro 가정 시뮬)
- `/spec-analysis` (Pro 스펙 리포트)
- `/compare` (Pro 비교)
- `/planner` (Pro 자동 플래너)
- `/admin/admissions`, `/admin/users`, `/admin/orders`, `/admin/etl-status`, `/admin/sample-stats` (운영자가 Firebase 콘솔로 임시 대체 가능)

다만 시즌 진입(7~9월) 전에는 모든 admin 페이지 완성 권장 — 시즌 트래픽 시 콘솔 직접 조작은 인적 오류 위험 큼.

#### 출시 게이트 체크리스트

PR 머지 직전 다음 확인:

- [ ] Launch Blocker #1~5 모두 Vercel 프로덕션에서 정상 응답 (200 OK + 핵심 컴포넌트 렌더)
- [ ] 메인 플로우 5단계 e2e Playwright 통과 (5초 내)
- [ ] `/admin/sanitize-monitor` 가 가짜 sanitize 이벤트 1건 노출 (cold start 확인)
- [ ] `/admissions/jaeoegukmin` 자격 자가진단 4개 카테고리 모두 분기 동작
- [ ] 결제 테스트 키로 `/payment` 1회 성공 (orders 도큐먼트 생성 확인)

---

## 4. API 엔드포인트 정리

| 카테고리 | 엔드포인트 | prismedu.kr 매핑 |
|---|---|---|
| 인증 | `/api/auth/{kakao,session}` | ♻️ |
| 결제 | `/api/payment/{request,confirm}` | ♻️ |
| 매칭 | `/api/match`, `/api/match/[id]`, `/api/match/simulate` | 🔧 (alg 재계수) |
| 채팅 | `/api/chat` | 🔧 (이번 PR 작성됨) |
| 의향 | `/api/intent/validate` | ✨ (P-003) |
| 학과 | `/api/universities`, `/api/universities/[uid]`, `/api/departments`, `/api/admissions/[uid]/[did]/[year]` | ✨ |
| 표본 | `/api/admissions/sample-stats/[uid]/[did]/[year]` | ✨ |
| 재외국민 | `/api/admissions/jaeoegukmin` | ✨ |
| 사용자 | `/api/users/me`, `/api/users/[uid]/specs` | 🔧 |
| 주문 | `/api/orders/me`, `/api/orders/[orderId]/refund-request` | ✨ |
| 플래너 | `/api/planner/{generate,tasks}` | 🔧 |
| 분석 | `/api/spec-analysis`, `/api/compare` | 🔧 |
| 통계 | `/api/stats/live` | ♻️ |
| Admin | `/api/admin/*` (10여 개) | ✨ |

---

## 5. 라우트 가드·미들웨어

| 라우트 패턴 | 가드 |
|---|---|
| `/admin/*` | `middleware.ts` 에서 `isMaster()` 체크. 미통과 시 `/login?next=...` 또는 403 |
| `/dashboard` `/analysis` `/compare` `/what-if` `/chat` `/planner` `/spec-analysis` `/profile` `/orders` | `AuthGate` 컴포넌트 — 비로그인 시 `/login` |
| `/payment/*` | `AuthRequired` + `SessionExpiryWatcher` |
| `/admissions/*` `/pricing` `/privacy` `/terms` `/refund` `/help` `/` | 가드 없음 — SEO 노출용 |

prismedu.kr 의 `src/middleware.ts` 와 `AuthGate.tsx` 패턴 그대로 ♻️ 재사용.

---

## 6. 다음 단계

1. **컴포넌트 인벤토리 PR**: 본 문서의 `🔧` 페이지에서 어느 prismedu.kr 컴포넌트가 그대로 살아남는지 1:1 매핑 PR (각 페이지 하나씩, 작은 PR로 분할)
2. **API 라우트 골격 PR**: `app/api/*` 의 신규 라우트 파일 빈 stub 생성 (zod 스키마만 정의, 본체는 추후)
3. **admin 라우트 보안 점검**: `middleware.ts` 에 `/admin/*` `isMaster()` 가드 + Sentry 미들웨어 통합
4. **`/admissions/jaeoegukmin` 우선순위**: P-013 결정에 따라 분리 라우트는 출시 직후 필수 — 외국 고교 출신 학생 진입 차단 방지
