# conatusipsi — 한국 대학 입시 AI 추천

전국 1,000여 학과의 모집요강·전형 정보를 한곳에서 보고, AI가 학생 성적·비교과 입력 기반 합격 가능성을 산출해 학과를 추천하는 웹 서비스. 진학사·대학어디가 벤치마크.

- **도메인**: [conatusipsi.com](https://conatusipsi.com) (출시 예정 2026-09)
- **클라이언트**: 방준현 (계약 2026-05-02)
- **기반**: 운영 중인 prismedu.kr (미국 입시 AI 플랫폼) 코드 80% 재활용

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

# 2. 로컬 emulator 시작 (Firestore + Auth + Storage)
npm run emu:start

# 3. 시드 데이터 로드 (별도 터미널)
npm run emu:seed

# 4. 개발 서버 시작 (포트 9002)
npm run dev
```

`http://localhost:9002/analysis` → 분석 폼 → 결과 페이지.

### 4단계 smoke test
```bash
npm run typecheck
npm run test          # 16 files / 316+ tests
npm run build
npm run lint
```

---

## 빠른 시작 (운영자 / 클라이언트)

처음 staging 환경을 띄울 때는 [`docs/staging-setup.md`](./docs/staging-setup.md) — 5분 절차서.

전체 운영 매뉴얼은 [`docs/setup.md`](./docs/setup.md) — Vercel · Firebase · Sentry · Anthropic · 토스페이먼츠 가입 절차 포함.

---

## 기술 스택

- **Frontend**: Next.js 15 (App Router) / TypeScript / Tailwind CSS
- **Backend**: Next.js API Routes / Firebase Admin SDK
- **DB·Auth·Storage**: Firebase (Firestore asia-northeast3 / Auth / Storage)
- **AI**: Anthropic Claude API (모델은 비용·성능 보고 결정)
- **Payment**: 토스페이먼츠 (단건결제, 구독 호환 구조)
- **Deploy**: Vercel (icn1 함수 리전)
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
│   ├── admission/        # sample-gate · classifier · labels
│   ├── api-auth.ts       # Firebase 세션 인증
│   ├── schemas/          # zod 입출력 스키마
│   └── firebase-admin.ts # 서버 SDK
├── types/admission.ts    # Firestore 도메인 타입 (단일 진실)
├── scripts/firestore/    # 시드 스크립트 (init-collections / seed-staging)
└── docs/                 # 정책·운영·스키마 문서
```

---

## 주요 문서

| 문서 | 용도 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 시 컨텍스트 (정책·금기사항) |
| [`docs/policy.md`](./docs/policy.md) | 정책 결정 기록 (P-001 ~ P-013) |
| [`docs/staging-setup.md`](./docs/staging-setup.md) | 첫 staging 배포 5분 절차 |
| [`docs/setup.md`](./docs/setup.md) | 환경 설정 + 권한 이관 (전체) |
| [`docs/operations.md`](./docs/operations.md) | 시즌 운영 매뉴얼 (ETL·인시던트) |
| [`docs/schema.md`](./docs/schema.md) | Firestore 스키마 |
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

서비스 안정화 후 운영 권한 완전 이전 절차는 [`docs/setup.md §9`](./docs/setup.md#9-권한-이관-체크리스트-개발자--클라이언트-운영팀). 누락 시 보안 리스크 큼 — 시크릿 회전 포함 10단계 체크리스트.

---

## 라이선스 / 저작권

비공개 — 클라이언트(방준현) 단독 운영 권리. 코드 일부는 prismedu.kr(미국 입시 AI 플랫폼)에서 재사용·어댑트.

문제 발견 시 [`docs/operations.md`](./docs/operations.md)의 인시던트 런북 참조 또는 운영팀 슬랙으로 문의.
