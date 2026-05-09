# 사용자 플로우 + 무료/유료 매트릭스

본 문서는 핵심 사용자 시나리오 5개의 화면 전이 다이어그램과, P-001 정책(옵션 B — 표본 부족 학과는 락 적용 X, 정형 정보 무료 공개)에 따른 무료·유료 기능 매트릭스를 정리합니다.

라우트 정의는 `docs/sitemap.md` 참조.

---

## 1. 핵심 플로우 (텍스트 다이어그램)

### 1.1 가입 → 온보딩 → 첫 분석 → 결제 → 상세 분석

```
┌─────────────┐
│      /      │ ← 비로그인 진입
└──────┬──────┘
       │ "무료 분석 시작" CTA
       ▼
┌─────────────┐
│   /login    │ ← 카카오 OAuth
└──────┬──────┘
       │ Firebase Auth 토큰 + users/{uid} 도큐먼트 생성
       ▼
┌────────────────┐
│  /onboarding   │ ← 첫 로그인 1회만
│  ① 학년·학기   │   POST /api/users/[uid]/specs
│  ② 내신        │   POST /api/intent/validate (가/나/다군 검증, P-003)
│  ③ 수능/모의   │
│  ④ 비교과      │
│  ⑤ 의향        │
└──────┬─────────┘
       │
       ▼
┌────────────────┐
│   /analysis    │ ← AnalysisFormWizard 시작
│ "분석 실행" 버튼 │   POST /api/match
└──────┬─────────┘
       │
       ▼
   ┌───┴───────────────────────────┐
   │  결과 카드 분기 (sample-gate)  │
   ├───────────────────────────────┤
   │ • Free preview 20개 = 정상    │ ← 무료 사용자 즉시 노출
   │ • 표본 부족 N개 = 안내 카드   │ ← 락 X, 정형 정보 제공
   │ • Free 한도 외 = 락 (CTA)     │ ← 결제 유도
   └───┬───────────────────────────┘
       │ "더 많은 학과 분석" 클릭 (락 카드)
       ▼
┌────────────────┐
│   /pricing     │ ← 단건 / 시즌권 / 구독
└──────┬─────────┘
       │ 상품 선택
       ▼
┌────────────────┐         POST /api/payment/request
│   /payment     │ ────────────────────────────►  Toss SDK
└──────┬─────────┘                                    │
       │                                              ▼
       │  ┌──────────────────┐                ┌─────────────┐
       │  │ /payment/success │ ◄──────────────│ 토스 콜백    │
       │  │  POST /api/      │                │ paymentKey  │
       │  │  payment/confirm │                └─────────────┘
       │  │  (멱등 트랜잭션)  │
       │  └──────────┬───────┘
       │             │ users.entitlements 갱신
       │             ▼
       │  ┌──────────────────┐
       └─►│   /analysis/[id] │ ← 락 해제, 분해 분석 노출
          │  학종 → 1단×2단   │
          │  분해 표시 (P-006)│
          └──────────────────┘
```

**실패 분기**:
- `/onboarding` 의향 검증 실패 → `AdmissionIntentError` 5종(P-003) → 폼에 인라인 에러
- `/payment/fail` 토스 승인 실패 → 결제 도큐먼트 `status: failed` 기록, 재시도 가능

---

### 1.2 학과 검색 → 모집요강 조회 (비로그인)

```
┌─────────────┐
│      /      │
└──────┬──────┘
       │ "학과 검색" 또는 GNB
       ▼
┌────────────────────┐
│   /admissions      │  GET /api/universities?...
│  ┌──────────────┐  │  GET /api/departments?track=...
│  │ 검색바       │  │
│  │ 카테고리필터 │  │  ← 서울권/거점국립/지방사립 등
│  │ 계열필터     │  │
│  │ 전형필터     │  │
│  └──────┬───────┘  │
│  학과 카드 그리드   │
└──────┬─────────────┘
       │ 학과 클릭
       ▼
┌──────────────────────────────────────┐
│ /admissions/[universityId]           │
│       /[departmentId]                │
│                                      │
│  ┌───────────────────────────────┐   │  GET /api/universities/[uid]/[did]
│  │ 대학·학과 헤더                │   │  GET /api/admissions/[uid]/[did]/[year]
│  │ 모집요강 표 (전형별)           │   │  GET /api/admissions/sample-stats/[uid]/[did]/[year]
│  │   - 모집인원                   │   │
│  │   - 일정                       │   │
│  │   - 영역별 반영비              │   │
│  │   - 수능최저 (배지)            │   │
│  │   - 응시영역기준 (배지)        │   │
│  │ 전년도 입결 카드               │   │
│  │ ⚠️ 합격률 분석 카드 (락) ──┐ │   │  ← P-001: 표본 부족이면 락 X
│  └─────────────────────────────│─┘   │
└─────────────────────────────────│────┘
                                  │
              "로그인 후 분석" 클릭 │
                                  ▼
                              /login → 1.1 플로우로 합류
```

**핵심 — 비로그인 노출 범위 (P-001)**:
- ✅ 모집요강·일정·반영비·응시영역기준·전년도 입결 = 무료 공개
- ⛔ 합격률 분석 = 로그인 + (표본 충족 학과는 락 / 표본 부족 학과는 안내)

---

### 1.3 AI 카운슬러 챗 시나리오

```
┌─────────────┐
│   /chat     │
└──────┬──────┘
       │ 학생 메시지 입력
       ▼
┌──────────────────────────────────┐
│  POST /api/chat                  │
│                                  │
│ ① collectInsufficientSample      │  ← intent → 학과 → sampleStats 조회
│   Schools(uid)                   │
│                                  │
│ ② buildCounselorSystemPrompt     │  ← lib/prompts/counselor-guards.ts
│   - NUMERIC_ESTIMATION_GUARD     │     · 임의 수치 차단 (P-002)
│   - INSUFFICIENT_SAMPLE_GUARD    │     · 표본 부족 학과는 일반론만
│   - student profile + 참고데이터 │
│                                  │
│ ③ Anthropic.messages.create      │  ← Claude API 호출 (스트리밍 X)
│                                  │
│ ④ sanitizeCounselorResponse      │  ← lib/admission/counselor-postprocess.ts
│    문장 단위 수치 패턴 차단      │     · 6 패턴 정규식
│    (표본 부족 컨텍스트일 때만)   │
│                                  │
│ ⑤ recordSanitizeMetric           │  ← fire-and-forget
│   - daily counter                │     · monitoring/counselorSanitize/daily
│   - 20% sample event             │     · monitoring/counselorSanitize/events
│   - Sentry warn (트리거 시)      │
│                                  │
│ ⑥ 응답 반환 + sanitized 플래그   │
└──────────┬───────────────────────┘
           │
           ▼
   ┌────────────────────────────────────────┐
   │ /chat 메시지 카드 렌더               │
   │ • 정상 응답 — 마크다운 포맷           │
   │ • sanitized=true 일 때 ⚠️ 배지 표시 │
   │   (디버그용 — 운영 후 제거 가능)     │
   └────────────────────────────────────────┘
```

**가드 회귀 시 (operations.md §6.5)**:
- LLM 응답에 수치 패턴 잔존 → sanitize 가 발견 → 문장 교체 + 메트릭 기록
- 운영자가 매주 `/admin/sanitize-monitor` 에서 점검

---

### 1.4 재외국민·외국인 전형 분기 (P-013)

```
┌─────────────┐
│      /      │ ← 일반 한국 학생 가정 카피
└──────┬──────┘
       │ Footer / 별도 CTA "재외국민·외국인 전형"
       ▼
┌─────────────────────────────────────┐
│  /admissions/jaeoegukmin            │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 자격 자가진단 (Eligibility) │    │
│  │  - 외국 거주 기간 (개월)    │    │
│  │  - 외국 국적 여부           │    │
│  │  - 외국 학교 졸업 학년      │    │
│  │  - 부모 동반 거주           │    │
│  └─────────────┬───────────────┘    │
│                │                    │
│   ┌────────────┴────────────┐       │
│   │ 카테고리 자동 매칭      │       │
│   │  - overseas_korean      │       │
│   │  - foreigner            │       │
│   │  - foreign_education_   │       │
│   │     12yr                │       │
│   │  - north_korean_        │       │
│   │     defector            │       │
│   └────────────┬────────────┘       │
│                │                    │
│                ▼                    │
│  ┌──────────────────────────┐       │
│  │ 자격 일치 학과 목록       │       │
│  │  - 모집인원              │       │
│  │  - 자격 요건 상세         │       │
│  │  - 일정                  │       │
│  └──────────┬───────────────┘       │
└─────────────┼───────────────────────┘
              │ "분석 시작" (로그인)
              ▼
   ┌──────────────────────────────┐
   │ /analysis (jaeoegukmin 모드) │  ← 일반 매칭과 분리된 흐름
   │                              │     · 일반 학생용 매칭 결과에
   │  • TOEFL/SAT 등 별도 입력    │       jaeoegukmin 트랙 미혼입
   │  • 자격 검증 통과한 학과만    │
   └──────────────────────────────┘
```

**플로우 분기 정책**:
- 일반 학생 가입 시 onboarding 에 jaeoegukmin 옵션 미표시 (UI 단순화)
- jaeoegukmin 라우트는 별도 진입점 (Footer 또는 /admissions 의 안내 배너)
- `/api/match` 가 일반 모드와 jaeoegukmin 모드 구분 — `intent.kind` 메타로 분기

---

### 1.5 표본 부족 학과 처리 플로우 (P-001 옵션 B)

```
┌──────────────────────────────────┐
│ /analysis 분석 결과 페이지       │
│ POST /api/match → 학과별 분기    │
└──────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────┐
│ checkSampleSufficiency(stats) — sample-gate.ts     │
│                                                    │
│   ┌────────────┬────────────┬────────────┐         │
│   │ sufficient │  no_data   │ below_     │         │
│   │            │  /no_      │ threshold  │         │
│   │            │  accepted  │ /weighted_ │         │
│   │            │            │ below      │         │
│   └─────┬──────┴─────┬──────┴─────┬──────┘         │
│         │            │            │                │
│         ▼            ▼            ▼                │
│  ┌──────────┐  ┌──────────────────────┐            │
│  │ 정상     │  │ insufficient_sample  │            │
│  │ 합격 확률│  │ (P-001 옵션 B)       │            │
│  │ 노출     │  │                      │            │
│  └─────┬────┘  │  - probability null  │            │
│        │       │  - 락 X              │            │
│        │       │  - 정형 정보 노출    │            │
│        │       │  - "표본 부족" 메시지│            │
│        │       └──────────┬───────────┘            │
└────────┼──────────────────┼────────────────────────┘
         │                  │
         ▼                  ▼
┌──────────────┐    ┌─────────────────────────┐
│ 무료 사용자  │    │ /admissions/[uid]/[did]  │
│              │    │ 정형 정보 (모집요강·일정 │
│ Free preview │    │ ·반영비·응시영역) 무료   │
│ 20개 안인가? │    │                         │
│              │    │ 분석 카드 위치엔        │
│  Yes → 노출  │    │ "표본이 N건 누적되면    │
│  No  → 락    │    │ 자동으로 표시" 안내     │
└──────────────┘    └─────────────────────────┘
```

**상태별 사용자 노출 메시지** (`gateMessage()` from `sample-gate.ts`):

| 상태 | 헤드라인 | 디테일 |
|---|---|---|
| `no_data` | 합격 사례 표본 없음 | 정형 데이터는 그대로 확인 가능 |
| `no_accepted` | 합격자 표본 부족 | 합격 사례 0건이라 확률 추정 불가 |
| `below_threshold` | 합격 사례 N건 — 표본 부족 | 최소 5건 필요. 적은 표본으로 확률 표시는 왜곡 위험 |
| `weighted_below` | 검증된 표본 부족 | 자가보고 비중이 높아 신뢰도 낮음 |

**락 vs 안내 카드 구분 (UI 가드)**:
- 락 카드: 청록 마스크 + 자물쇠 + "업그레이드" CTA
- 안내 카드: 회색 마스크 + 시계 + "표본 누적 시 자동 표시" 안내. CTA 없음

---

## 2. 무료 vs 유료 기능 매트릭스

### 2.1 페이지 단위 게이트

| 페이지 | 무료 (free) | Pro | Elite | 비고 |
|---|---|---|---|---|
| `/` | ✅ | ✅ | ✅ | SEO |
| `/admissions/*` | ✅ | ✅ | ✅ | 모집요강 무료 (P-001) |
| `/admissions/jaeoegukmin` | ✅ | ✅ | ✅ | 자격 자가진단 무료 |
| `/pricing` | ✅ | ✅ | ✅ | |
| `/login` `/onboarding` | ✅ | ✅ | ✅ | |
| `/dashboard` | ✅ | ✅ | ✅ | KPI 카드는 모두 노출 |
| `/profile` | ✅ | ✅ | ✅ | |
| `/analysis` | ⚠️ 일부 | ✅ | ✅ | Free preview 20 + 표본 부족 학과 무제한 |
| `/analysis/[id]` | ⚠️ 일부 | ✅ | ✅ | 학종 분해는 Pro 이상 |
| `/compare` | ❌ | ✅ | ✅ | Pro 이상 |
| `/what-if` | ❌ | ✅ | ✅ | Pro 이상 |
| `/chat` | ⚠️ 5회/일 | ✅ 무제한 | ✅ 무제한 | aiChatDailyLimit |
| `/planner` | ❌ | ✅ | ✅ | autoPlannerEnabled |
| `/spec-analysis` | ❌ | ✅ | ✅ | specAnalysisEnabled |
| `/payment/*` `/orders` | ✅ | ✅ | ✅ | 결제 흐름 |

### 2.2 기능 단위 게이트 (`PlanFeatures` 매핑)

| 기능 | free | pro | elite | 코드 키 |
|---|---|---|---|---|
| 학과 합격 확률 분석 | 20개 | 무제한 | 무제한 | `schoolAnalysisLimit` |
| 표본 부족 학과 정형 정보 | ✅ | ✅ | ✅ | (락 X — P-001) |
| 학종 1×2 분해 표시 | ❌ | ✅ | ✅ | (P-006 분해) |
| 비교 (`/compare`) | ❌ | ✅ | ✅ | `compareEnabled` (`PlanFeatures` 신규) |
| 가정 시뮬 (`/what-if`) | ❌ | ✅ | ✅ | `whatIfEnabled` |
| AI 카운슬러 채팅 | 5회/일 | 무제한 | 무제한 | `aiChatDailyLimit` |
| 자동 플래너 | ❌ | ✅ | ✅ | `autoPlannerEnabled` |
| 스펙 분석 리포트 | ❌ | ✅ | ✅ | `specAnalysisEnabled` |
| 합격사례 매칭 (코사인 유사) | ❌ | ❌ | ✅ | `admissionMatchingEnabled` |
| 우선 응답 (시즌) | — | — | 24h | `prioritySupportHours` |

### 2.3 페이지 내 게이트 위치 (UI 마킹)

각 페이지에서 락이 발생하는 정확한 컴포넌트:

| 페이지 | 락 컴포넌트 | 락 발동 조건 |
|---|---|---|
| `/analysis` | `DepartmentRow` (preview 20개 외) | `isLockable() === true` (`free_plan_over_preview_quota`) |
| `/analysis/[id]` | `ProbabilityBreakdown` (학종 분해) | `plan === "free"` |
| `/compare` | 페이지 진입 시 | `plan === "free"` → `/pricing` 으로 redirect |
| `/what-if` | 페이지 진입 시 | `plan === "free"` → `/pricing` |
| `/chat` | 메시지 입력 후 응답 | 일일 한도 초과 시 `429` + 업그레이드 CTA |
| `/planner` | 페이지 진입 시 | `plan === "free"` → `/pricing` |
| `/spec-analysis` | 페이지 진입 시 | `plan === "free"` → `/pricing` |
| **표본 부족 학과 (전 페이지)** | **락 X — 안내 카드** | sample-gate `sufficient: false` (P-001) |

### 2.4 상품 카탈로그 (`lib/plans.ts` 갱신 예정)

prismedu.kr `lib/plans.ts` 의 `Plan = "free" | "pro" | "elite"` 구조 유지. 가격·기능명만 한국 시장 기준 재보정 + 단건결제 호환:

| 플랜 | 단건 | 시즌권 (7~2월) | 월 구독 (호환) |
|---|---|---|---|
| free | — | — | — |
| pro | 9,900원 (분석 1회) | 49,000원 | 9,900원/월 |
| elite | — | 99,000원 | 19,000원/월 |

**시즌권**이 핵심 상품 — 한국 입시는 7~2월 집중. 월 구독은 P-008 결제 모델 호환 옵션.

---

## 3. 핵심 검증 룰 (사용자 → 시스템 단방향)

### 3.1 가/나/다군 중복지원 검증 (P-003)

```
사용자 → /onboarding 또는 /profile
          ↓ intent 입력
        클라이언트 폼 검증 (즉시 피드백)
          ↓ POST
        Firestore rules validIntent() (형태 검증만)
          ↓
        /api/intent/validate (의미 검증 + 트랜잭션)
          ↓
        AdmissionIntentValidation { valid, errors[] }
          ↓
        실패 시 클라 폼에 인라인 에러 표시
        성공 시 users/[uid]/specs/[specId].intent 저장
```

### 3.2 응시영역 자격 검증 (B1, P0)

```
사용자 → /analysis "분석 실행"
          ↓
        POST /api/match
          ↓
        loop 학과 후보:
          ↓
        1. evaluateRequiredAreas(track.requiredAreas, csat)
          → qualified=false면 결과에서 즉시 제외
          ↓
        2. evaluateMinReq(track.csatMinimum, csat)
          → met=false면 페널티 또는 제외
          ↓
        3. checkSampleSufficiency(stats)
          → sufficient=false면 insufficient_sample 카드
          ↓
        4. 정상 매칭 알고리즘 진입
```

### 3.3 정직성 가드 (P-002)

```
사용자 → /chat 메시지
          ↓
        POST /api/chat
          ↓
        시스템 프롬프트 빌드 (가드 포함)
          ↓
        Claude API
          ↓
        응답 sanitize (문장 단위)
          ↓
        메트릭 기록 (fire-and-forget)
          ↓
        사용자에게 sanitized 응답 반환
```

---

## 4. 다음 단계

1. **컴포넌트 골격 PR**: 본 문서의 ✨ 표시 컴포넌트(`HakjongProbabilityCard`, `InsufficientSampleCard`, `EligibilityChecker` 등) 빈 stub
2. **무료/유료 게이트 통합 컴포넌트**: `<Gated feature="autoPlanner">` 단일 wrapper (락 UI 일관)
3. **플로우 통합 테스트**: 1.1 ~ 1.5 시나리오를 Playwright e2e 로 — 시즌 전 회귀 게이트
4. **/admin/sanitize-monitor** 우선 구현: 시즌 진입 후 가드 회귀를 즉시 발견하려면 admin 대시보드가 출시 시점에 동작해야 함
