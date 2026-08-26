# Conatus — 한국 대학 입시 AI 추천

전국 대학 모집요강·전형 정보를 한곳에서 보고, AI가 학생 성적·비교과 입력 기반 합격 가능성을 산출해 학과를 추천하는 웹 서비스. 진학사·대학어디가 벤치마크.

- **도메인**: [conatusipsi.com](https://conatusipsi.com) — 운영 중
- **적재 현황**: 2027학년도 수시 93개교 4,173행 / 정시(예정안) 16개교 617행 (2026-08 기준)
- **클라이언트**: 방준현 (계약 2026-05-02, **2026-08 이관 완료**)
- **기반**: 운영 중인 prismedu.kr (미국 입시 AI 플랫폼) 코드 80% 재활용

> 📌 인수·운영·개발 재개는 **[`HANDOVER.md`](./HANDOVER.md)** 부터.

---

## 핵심 기능

1. **합격률 분석** — 한국 주요 대학 1,000여 학과에 대해 사용자 성적·비교과 입력 시 합격 가능성 산출
2. **맞춤 대학 추천** — Reach / Hard Target / Target / Safety 4분류
3. **모집요강·입시정보 조회** — 대학별 상세 정보 한눈에
4. **AI 입시 카운슬러** — 사용자 프로필 기반 실시간 상담 (Anthropic Claude)
5. **단건 PG 결제** — 토스페이먼츠 (구독 호환 DB 구조)

---

## 핵심 정책 요약

상세는 [`docs/policy.md`](./docs/policy.md). 코드·UI 변경 시 반드시 정합성 확인.

| 코드 | 정책 | 핵심 룰 |
|---|---|---|
| **P-001** | 표본 부족 처리 | 합격 사례 < 5건 학과는 확률 비공개 + 별도 섹션. 결제 CTA 절대 X. |
| **P-002** | 정직성 원칙 | "확정 합격" 표현 차단. AI는 모르는 건 "모른다" 답. |
| **P-003** | 가/나/다군 검증 | 같은 군 내 두 대학 동시 지원 차단 (서버 재검증). |
| **P-006** | 학종 분해 표시 | 학생부종합 결과는 1단계 × 2단계 분해. |
| **P-010** | 영어/한국사 polarity | 가산점 vs 감점 모집요강 표기 그대로 보존. |
| **P-012** | 변환표 후공지 | 정시 변환표는 수능 후 발표 — 시즌 진입 시 status 분기. |
| **P-013** | 외국 고교 분리 | 재외국민·외국인 입시는 일반 분석과 분리된 라우트(`/admissions/jaeoegukmin`). |

자소서는 의도적으로 미포함 — 24학번부터 자소서 폐지.

---

## 빠른 시작 (개발자)

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정 — .env.local.example 참고해 .env.local 작성
#    (Vercel 프로젝트에서 그대로 받아오려면)
npx vercel env pull .env.local --scope joonhyeon-s-projects

# 3. 개발 서버 시작 (포트 9002)
npm run dev
```

`http://localhost:9002/analysis` → 분석 폼 → 결과 페이지.

> ⚠️ 로컬 dev 서버도 **원격 Supabase(프로덕션) DB에 직접 연결**된다. Firebase Emulator는
> 2026-05 Supabase 마이그레이션 때 제거됐다. 데이터 변경 작업은 주의할 것.

### smoke test
```bash
npm run typecheck     # tsc --noEmit
npm run test          # Vitest 단위 테스트
npm run build         # 프로덕션 빌드
npm run lint          # ESLint
```

`npm run test:e2e` (Playwright)는 로컬 실행만 가능 — CI 워크플로는 2026-05-21부터 비활성.

---

## 빠른 시작 (운영자 / 클라이언트)

**→ [`HANDOVER.md`](./HANDOVER.md)** 를 먼저 읽을 것. 현재 되는 것/안 되는 것, 인프라·환경변수,
Claude Code로 개발을 이어가는 방법, 운영 절차가 실측 기준으로 정리돼 있다.

---

## 기술 스택

- **Frontend**: Next.js 15 (App Router, Turbopack) / React 19 / TypeScript 5 / Tailwind CSS 3
- **Backend**: Next.js API Routes (`app/api/*`) — service-role Supabase 클라이언트
- **DB·Auth·Storage**: **Supabase** (PostgreSQL, RLS) — 카카오·이메일 로그인
- **AI**: Anthropic Claude API (캐싱 `ai_cache` + rate limit + plan 게이트)
- **Payment**: 토스페이먼츠 (단건결제, 구독 호환 구조) — ⚠️ 실키 미등록 상태 (HANDOVER.md B장 2번)
- **Deploy**: Vercel (icn1 서울 리전) — `main` push 시 자동 프로덕션 배포
- **Monitoring**: Sentry

---

## 폴더 구조

```
.
├── app/                  # Next.js App Router (페이지·API 라우트)
│   ├── analysis/         # /analysis (폼) + /analysis/[id] (결과)
│   ├── admissions/       # 학과 검색·상세·재외국민 트랙
│   ├── admin/            # 운영자 전용
│   └── api/              # API 라우트 (auth/match/admissions/payment 등)
├── components/
│   ├── analysis/         # 분석 폼·결과 컴포넌트
│   ├── admissions/       # 학과 검색·필터·뱃지
│   ├── access/           # Gated (락·표본 부족·preview 카드)
│   ├── admin/            # 운영자 패널
│   └── ui/               # shadcn/ui 기반 디자인 시스템
├── lib/
│   ├── matching-kr.ts    # 한국 입시 매칭 어댑터
│   ├── matching.ts       # prismedu.kr US 모델 (재사용 원본)
│   ├── admission/        # sample-gate · feature-flags · classifier · labels
│   ├── api-auth.ts       # Supabase 세션 인증 + master 권한
│   ├── schemas/          # zod 입출력 스키마
│   └── supabase-server.ts # 서버(service-role) 클라이언트
├── types/admission.ts    # 도메인 타입 (단일 진실)
├── scripts/etl/          # 모집요강 ETL (추출·매칭·적재) — CLAUDE.md의 ETL 주의사항 필독
├── supabase/             # DB 마이그레이션
└── docs/                 # 정책·운영·스키마 문서 (일부 Firebase 시절 기준 — HANDOVER.md 우선)
```

---

## 주요 문서

| 문서 | 용도 |
|---|---|
| [`HANDOVER.md`](./HANDOVER.md) | **인수인계 — 현재 상태·인프라·운영·Claude 사용법 (최우선)** |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 시 컨텍스트 (정책·ETL 주의사항·안전 규칙) |
| [`docs/policy.md`](./docs/policy.md) | 정책 결정 기록 (P-001 ~ P-013) |
| [`docs/staging-setup.md`](./docs/staging-setup.md) | 첫 staging 배포 5분 절차 |
| [`docs/setup.md`](./docs/setup.md) | 환경 설정 + 권한 이관 (전체) |
| [`docs/operations.md`](./docs/operations.md) | 시즌 운영 매뉴얼 (ETL·인시던트) |
| [`docs/schema.md`](./docs/schema.md) | 데이터 스키마 (일부 Firestore 시절 기준 — 참고용) |
| [`docs/migration.md`](./docs/migration.md) | prismedu.kr 호환 매핑 |
| [`docs/sitemap.md`](./docs/sitemap.md) | 페이지·API 라우트 카탈로그 |
| [`docs/user-flows.md`](./docs/user-flows.md) | 사용자 플로우 (분석·결제·상담) |

---

## 개발 원칙

- **재사용 우선** — prismedu.kr 코드 80% 재활용. 새 컴포넌트 만들기 전에 기존 재사용 가능 여부 확인.
- **AI 비용 절감** — 캐싱·rate limit·token 절약. AI API 호출 코드는 비용 주석으로 표시.
- **결제 호환** — 단건결제 우선이지만 DB 스키마는 처음부터 구독 호환 구조.
- **시즌 대비** — 7~11월 트래픽 폭증 대비 인덱싱·캐싱 미리 고려.
- **정직성** — 데이터가 없으면 "모른다". 표본 부족 학과는 확률 표시 X.
- **자소서 제외** — 24학번부터 자소서 폐지. 분석 폼·결과 어디에도 자소서 없음.

---

## 권한 이관 (개발자 → 클라이언트)

**2026-08 이관 완료.** 계정별 개발자 권한 제거 절차와 키 회전(재발급) 체크리스트는
[`HANDOVER.md` C-2](./HANDOVER.md#c-2-개발자기존-접근-권한-제거-방법).

---

## 라이선스 / 저작권

비공개 — 클라이언트(방준현) 단독 운영 권리. 코드 일부는 prismedu.kr(미국 입시 AI 플랫폼)에서 재사용·어댑트.

문제 발견 시 [`HANDOVER.md` E-6](./HANDOVER.md#e-6-문제가-생겼을-때) 참조.
서비스 상태 즉시 확인: `https://conatusipsi.com/api/health`
