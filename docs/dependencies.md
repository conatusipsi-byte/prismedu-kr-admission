# 환경 의존성 — 한국 대학 입시 서비스

신규 프로젝트가 동작하기 위해 prismedu.kr에서 복사해야 할 인프라·라이브러리·설정 파일과, 신규 프로젝트 전용 의존성을 정리합니다.

코드 작업 시작 전 **§1 선행 작업** 을 마쳐야 빌드·테스트가 통과합니다.

---

## 0. 사용 방법

본 문서는 작업 체크리스트입니다. 각 항목 복사·검증 후 체크박스 갱신:

```bash
# 작업 흐름
1. prismedu.kr 레포(`_prism_reference/`)에서 파일 복사
2. import 경로(@/ alias) 검증
3. 본 문서의 §1.2 검증 절차 4단계 실행
4. 통과 시 체크박스 [x]
```

---

## 1. prismedu.kr에서 복사 필요한 인프라 (선행 작업)

### 1.1 빌드·설정 파일

| 파일 | 출처 (prismedu.kr) | 신규 경로 | 검증 포인트 |
|---|---|---|---|
| ☐ `tailwind.config.ts` | `_prism_reference/tailwind.config.ts` | `/tailwind.config.ts` | **mint 컬러 토큰 (`#00C9A7`) 정의 확인** — Gated 컴포넌트가 mint-300/500/600/700 사용. 누락 시 락 카드 시각 깨짐 |
| ☐ `postcss.config.mjs` | 동일 위치 | `/postcss.config.mjs` | tailwind plugin 활성화 |
| ☐ `next.config.ts` | 동일 | `/next.config.ts` | Sentry 통합 + 이미지 도메인 (한국 대학 로고 호스트 추가 필요) |
| ☐ `tsconfig.json` | 동일 | `/tsconfig.json` | `paths: { "@/*": ["./*"] }` alias 검증 |
| ☐ `vitest.config.ts` | 동일 | `/vitest.config.ts` | jsdom + path alias |
| ☐ `vitest.setup.ts` | 동일 | `/vitest.setup.ts` | `@testing-library/jest-dom` 매처 등록 |
| ☐ `vitest.server-only-stub.ts` | 동일 | `/vitest.server-only-stub.ts` | "server-only" import를 테스트에서 우회 |
| ☐ `components.json` | 동일 | `/components.json` | shadcn/ui 설정 |
| ☐ `eslint.config.mjs` | 동일 | `/eslint.config.mjs` | next/core-web-vitals + typescript |
| ☐ `package.json` 의존성 동기 | 동일 | `/package.json` | dependencies / devDependencies 항목 비교 — Anthropic SDK · firebase · @tosspayments/tosspayments-sdk · @sentry/nextjs · @testing-library/* 등 |
| ☐ `.gitignore` | 동일 | `/.gitignore` | `*-service-account.json` 추가 |

### 1.2 검증 절차

각 파일 복사 후 또는 그룹 단위로 다음 4단계 통과 확인:

```bash
npm install
npm run typecheck   # tsc --noEmit. 0 에러
npm run lint        # next lint. 0 경고 (또는 인정 범위 내)
npm run build       # next build. 빌드 성공
npm run test        # vitest run. 모든 테스트 통과
```

위 4단계가 모두 통과해야 다음 그룹으로 진행. 실패 시 멈추고 원인 해결 — `import` 경로 오류·tsconfig alias 누락이 가장 흔함.

### 1.3 핵심 라이브러리

| 파일 | 출처 | 신규 경로 | 비고 |
|---|---|---|---|
| ☐ `lib/utils.ts` | `_prism_reference/src/lib/utils.ts` | `/lib/utils.ts` | `cn` 함수 (clsx + tailwind-merge). **Gated 컴포넌트 의존** |
| ☐ `lib/firebase.ts` | 동일 | `/lib/firebase.ts` | client-side Firebase SDK 초기화 |
| ☐ `lib/firebase-admin.ts` | 동일 | `/lib/firebase-admin.ts` | server-only Admin SDK + `getAdminDb` |
| ☐ `lib/anthropic.ts` | 동일 | `/lib/anthropic.ts` | `getAnthropicClient` — Claude API 래퍼 |
| ☐ `lib/log.ts` | 동일 | `/lib/log.ts` | 구조화 로깅 |
| ☐ `lib/env.ts` | 동일 | `/lib/env.ts` | 환경변수 검증 (zod 기반) |
| ☐ `lib/date.ts` | 동일 | `/lib/date.ts` | date-fns 한국어 |
| ☐ `lib/storage.ts` | 동일 | `/lib/storage.ts` | localStorage 래퍼 (SSR 안전) |
| ☐ `lib/storage-keys.ts` | 동일 | `/lib/storage-keys.ts` | 키 enum |
| ☐ `lib/rate-limit.ts` | 동일 | `/lib/rate-limit.ts` | API rate limit (`enforceRateLimit`) |
| ☐ `lib/ai-cache.ts` | 동일 | `/lib/ai-cache.ts` | LLM 응답 캐시 |
| ☐ `lib/match-cache.ts` | 동일 | `/lib/match-cache.ts` | 매칭 결과 캐시 |
| ☐ `lib/i18n/*` | 동일 | `/lib/i18n/*` | 한국어/영어 fallback |
| ☐ `lib/business-info.ts` | 동일 | `/lib/business-info.ts` | 회사 정보 (사업자번호 등) — 한국 시장 정보로 교체 |

### 1.4 UI 프리미티브 (shadcn) — `components/ui/*` 35개

[`docs/component-inventory.md` §1](./component-inventory.md) 참조. 35개 전부 ♻️ 복사:

```bash
# 일괄 복사 (Bash 예시)
cp -r _prism_reference/src/components/ui/ components/ui/
```

복사 후 검증:
- ☐ Button·Card·Dialog·Form·Table·Tabs·Toast 동작 확인 (Gated 컴포넌트가 의존)
- ☐ `components.json` 의 `componentPath` 가 신규 경로(`./components/ui`)를 가리키는지

### 1.5 인증·세션

| 파일 | 출처 | 신규 경로 | 비고 |
|---|---|---|---|
| ☐ `lib/auth-context.tsx` | 동일 | `/lib/auth-context.tsx` | React Context — 클라이언트 사용자 세션 |
| ☐ `app/api/auth/kakao/*` | 동일 | `/app/api/auth/kakao/*` | OAuth 라우트 |
| ☐ `app/api/auth/session/*` | 동일 | `/app/api/auth/session/*` | 세션 쿠키 설정 |
| ☐ `middleware.ts` | 동일 | `/middleware.ts` | 인증 가드 라우팅 |

⚠️ **`lib/api-auth.ts` 는 신규 작성** (§2.2 참조). prismedu.kr 패턴(`instanceof NextResponse`) 대신 신규 프로젝트는 discriminated union 패턴(`{ ok: true | false; ... }`) 채택. 두 패턴 혼재 금지.

### 1.6 분석·관측

| 파일 | 출처 | 신규 경로 | 비고 |
|---|---|---|---|
| ☐ `lib/analytics/*` | 동일 | `/lib/analytics/*` | GA·이벤트 트래킹 |
| ☐ `sentry.client.config.ts` | 동일 | `/sentry.client.config.ts` | DSN 환경변수 (setup.md §6) |
| ☐ `sentry.server.config.ts` | 동일 | `/sentry.server.config.ts` | server-side |
| ☐ `sentry.edge.config.ts` | 동일 | `/sentry.edge.config.ts` | edge runtime |
| ☐ `instrumentation.ts` | 동일 | `/instrumentation.ts` | OTel 수집 |

### 1.7 정적 페이지 본체 (텍스트만 교체)

| 파일 | 출처 | 신규 경로 |
|---|---|---|
| ☐ `app/privacy/page.tsx` | 동일 | `/app/privacy/page.tsx` |
| ☐ `app/terms/page.tsx` | 동일 | `/app/terms/page.tsx` |
| ☐ `app/refund/page.tsx` | 동일 | `/app/refund/page.tsx` |
| ☐ `app/help/page.tsx` | 동일 | `/app/help/page.tsx` |
| ☐ `app/error.tsx`, `not-found.tsx`, `loading.tsx` | 동일 | `/app/*.tsx` |
| ☐ `app/robots.ts`, `sitemap.ts`, `opengraph-image.tsx` | 동일 | `/app/*.tsx` |
| ☐ `app/globals.css` | 동일 | `/app/globals.css` |
| ☐ `app/layout.tsx` | 동일 | `/app/layout.tsx` |

### 1.8 결제 인프라

| 파일 | 출처 | 신규 경로 | 비고 |
|---|---|---|---|
| ☐ `app/api/payment/request/*` | 동일 | `/app/api/payment/request/*` | 토스 결제 요청 |
| ☐ `app/api/payment/confirm/*` | 동일 | `/app/api/payment/confirm/*` | 토스 승인 트랜잭션 — `parseOrderId` 한국 상품용으로 수정 필요 |
| ☐ `lib/plans.ts` | 동일 | `/lib/plans.ts` | 플랜 정의 — 가격·하이라이트 한국 시장 기준으로 수정 |

---

## 2. 신규 프로젝트 전용 (이미 작성됨 또는 신규 작성)

### 2.1 이미 작성된 신규 자산 (이번 PR 이전)

| 파일 | 정책 |
|---|---|
| `types/admission.ts` | 한국 입시 도메인 타입 (P-001 ~ P-013 반영) |
| `lib/admission/sample-gate.ts` | 표본 부족 게이트 (P-001) |
| `lib/admission/min-req-classifier.ts` | 수능최저 분류 (P-004) + 응시영역 자격 (B1) |
| `lib/admission/counselor-postprocess.ts` | sanitize (P-002) |
| `lib/admission/counselor-metric.ts` | sanitize 메트릭 |
| `lib/prompts/counselor-guards.ts` | LLM 가드 (P-002) |
| `app/api/chat/route.ts` | AI 카운슬러 (이미 작성) |
| `components/access/Gated.tsx` | 락·안내 카드 wrapper (P-001) |
| `firestore.rules` | rules 본문 |
| `scripts/update-track-vocab-fixtures.ts` | 어휘 자동 점검 (P-007) |
| `scripts/etl/admissions-sync.ts` | ETL 2단계 (P-012) |
| `.github/workflows/track-vocab-check.yml` | cron 자동 PR |

### 2.2 본 PR에서 신규 작성

| 파일 | 역할 |
|---|---|
| `lib/api-auth.ts` | `requireAuth` / `requireMasterAuth` (discriminated union 패턴) |
| `lib/api/createStubRoute.ts` | 라우트 stub 생성 헬퍼 |
| `lib/schemas/api/*.ts` | Zod 스키마 (라우트별 입력 검증) |
| `app/api/admissions/*` | 학과 검색·상세·재외국민 (3개 라우트) |
| `app/api/user/*` | profile / specs / dashboard (3개) |
| `app/api/match/*` | 매칭 + simulate + intent/validate (3개) |
| `app/api/admissions/{analyze,similar}` | 분석 (2개) |
| `app/api/payment/cancel` | 결제 취소 신규 |
| `app/api/orders` | 주문 내역 |
| `app/api/admin/*` | etl-status / sample-stats / sanitize-monitor (3개) |
| `scripts/firestore/init-collections.ts` | Firestore 초기화 (서울대 의예과 테스트 데이터) |

---

## 3. 전체 진행률 추정

| 단계 | 작업량 | 누적 |
|---|---|---|
| §1.1 빌드 설정 11개 | 0.5d | 0.5d |
| §1.3 핵심 라이브러리 14개 | 0.5d | 1.0d |
| §1.4 UI 프리미티브 35개 일괄 복사 | 0.3d | 1.3d |
| §1.5 인증·세션 4개 | 0.3d | 1.6d |
| §1.6 분석·관측 5개 | 0.3d | 1.9d |
| §1.7 정적 페이지 11개 | 0.3d | 2.2d |
| §1.8 결제 인프라 3개 | 0.5d (parseOrderId 수정) | 2.7d |
| §2.2 본 PR 신규 작성 | 1.5d | 4.2d |

**합계 약 4~5일 (1인 풀타임)**. 이후부터 페이지·도메인 구현 본격 진입.

---

## 4. 빌드 환경 호환성 메모

### 4.1 prismedu.kr 패턴 그대로 유지
- Next.js 15 App Router
- React 19
- TypeScript 5
- vitest 4
- firebase-admin 13

### 4.2 신규 프로젝트만의 차이
- **api-auth 패턴**: discriminated union (`{ ok, ... }`) 채택. prismedu.kr 의 `instanceof NextResponse` 패턴은 본 프로젝트에서 사용 X.
- **결제 모델**: 단건 + 시즌권 우선. prismedu.kr 의 구독 위주 가격 정책에서 변경.
- **ETL 도구**: poppler-utils + tesseract-ocr-kor (operations.md §10.6).

### 4.3 한국 입시 PWA 고려사항
- 모바일 사용자 비중 높음 (CLAUDE.md 디자인 가이드)
- ServiceWorker / InstallPrompt 동작 확인 필수
- prismedu.kr 의 PWA 설정(`public/manifest.webmanifest` 등) 그대로 복사 — 단, manifest 의 `name`·`short_name`·`theme_color` 신규 브랜드로 교체

---

## 5. 다음 단계 (이 문서 머지 후)

1. **§1.1 빌드 설정 일괄 복사** 후 첫 빌드 (`npm run build`) 통과 확인
2. **§1.4 UI 프리미티브** 일괄 복사 → Gated 회귀 테스트(`Gated.test.tsx`) 실행 → 통과 확인
3. **§2.2 본 PR 신규 작성** 머지
4. **첫 페이지 구현** (`/admissions` 검색 페이지) 진입
