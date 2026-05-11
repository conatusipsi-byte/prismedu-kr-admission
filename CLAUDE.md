# 프로젝트: 한국 대학 입시 AI 추천 웹 서비스

## 프로젝트 개요
- **클라이언트**: 방준현 (계약 체결: 2026.05.02)
- **벤치마크**: 진학사 + 대학어디가
- **참고**: 운영 중인 prismedu.kr (미국 대학 입시 AI 플랫폼) 코드 80% 재활용
- **출시 목표**: 2026년 9월
- **사이트 완성 목표**: 2026년 6월 30일
- **결제 시스템 추가 완성**: 2026년 7월 초~중순

## 핵심 기능
1. **합격률 분석**: 한국 주요 대학 1,000여 학과에 대해 사용자 성적 입력 시 합격 가능성 산출
2. **맞춤 대학 추천**: AI 기반 Safety/Match/Reach 분류
3. **모집요강·입시정보 조회**: 대학별 상세 정보 한눈에 보기
4. **AI 입시 카운슬러 챗**: 사용자 프로필 기반 실시간 상담
5. **단건 PG 결제 시스템** (추가 작업분, +120만원→110만원 진행)
   - 토스페이먼츠 또는 아임포트 단건결제
   - 결제 페이지·이력·관리자 조회
   - 추후 구독형 전환 대비 DB 구조 설계

## 기술 스택 (실제 채택분)
> 초기 기획에선 PostgreSQL/Prisma/Supabase를 검토했으나, 실제 구현은 **Firebase 스택**으로 확정됨.
- **Frontend**: Next.js 15 (App Router, Turbopack) / React 19 / TypeScript 5 / Tailwind CSS 3
- **UI 컴포넌트**: Radix UI + shadcn/ui (`components.json`) + lucide-react
- **Backend**: Next.js API Routes (`app/api/*`) + `firebase-admin` (서버 SDK)
- **DB / Storage / Auth**: Firebase 11 — Firestore + Firebase Auth + Firebase Storage
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) — `lib/anthropic.ts`, 캐싱은 `lib/ai-cache.ts`, 호출 제한은 `lib/rate-limit.ts`
- **Payment**: 토스페이먼츠 (`@tosspayments/tosspayments-sdk`) — 단건결제, 구독 호환 스키마
- **모니터링**: Sentry (`@sentry/nextjs`)
- **테스트**: Vitest 4 (단위) + Playwright 1.59 (e2e) + Testing Library
- **로컬 개발**: Firebase Emulator (firestore + auth + storage)
- **Deploy**: Vercel
- **Dev port**: 9002

## 디자인 가이드
- **브랜드 컬러**: #00C9A7 (mint)
- **톤앤매너**: 깔끔, 정보 밀도 높지만 답답하지 않게
- **타깃**: 학생·학부모·교사 모두 사용 (UI는 학생 기준 우선)
- **반응형**: 모바일 우선 (학생은 모바일 사용 비중↑)

## 개발 원칙
- prismedu.kr 코드 패턴·컴포넌트를 최대한 재사용한다
- AI API 비용 절감을 위해 캐싱·사용량 제한 로직을 처음부터 넣는다
- 결제 시스템 DB 스키마는 처음부터 구독 호환 구조로 설계한다
- 한국 입시는 자소서 첨삭이 들어가지 않으므로 그 영역은 제외한다
- 시즌(7~11월) 트래픽 폭증 대비 인덱싱·캐싱을 미리 고려한다
- **정직성 원칙**: 표본 부족 학과는 합격 확률을 표시하지 않고, AI 카운슬러도 임의 수치를 만들어내지 않는다. 데이터가 없으면 "모른다"고 말한다.

## 한국 입시 도메인 주의사항
- 모집요강 데이터는 매년 7~9월 시즌마다 업데이트 필요
- 진학사·대학어디가 무단 크롤링 금지 (법적 리스크)
- 학과 단위 (대학 단위 아님) — 같은 대학이라도 학과별 입시 일정·등급 다름
- 정시·수시·학종·교과·논술·실기 전형별 데이터 구조 분리 필요

## 폴더 구조
```
app/                  # Next.js App Router
  api/                # API Routes (서버사이드, firebase-admin 사용)
  admin/              # 운영자 페이지
  admissions/         # 입시 정보·모집요강 조회
  analysis/           # 합격률 분석
  chat/               # AI 카운슬러 챗
  compare/            # 대학 비교
  what-if/            # 가정 시뮬레이션
  spec-analysis/      # 스펙 분석
  planner/            # 입시 계획
  pricing/ payment/ orders/    # 결제 + 주문
  profile/ onboarding/ login/  # 사용자
  privacy/ terms/ refund/      # 정책 페이지
components/           # 재사용 컴포넌트 (ui/는 shadcn/ui 베이스)
lib/                  # 도메인·유틸 (firebase, anthropic, ai-cache, rate-limit, schemas …)
hooks/                # 커스텀 훅
data/                 # 정적 데이터 (대학·학과 등)
scripts/              # CLI/시드 스크립트
tests/                # Playwright e2e
types/                # 공용 타입
docs/                 # 내부 문서
_prism_reference/     # prismedu.kr 참고 코드 (.gitignore 처리됨, 배포 X)
```

## 자주 쓰는 명령어
```bash
npm run dev          # Next.js 개발 서버 (port 9002, turbopack)
npm run dev:emu      # 에뮬레이터 + 개발 서버 동시 (PowerShell — Windows 전용)
npm run emu:start    # Firebase Emulator만 (firestore/auth/storage)
npm run emu:seed     # 에뮬레이터 컬렉션 시드
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest 단위 (1회)
npm run test:watch   # Vitest watch
npm run test:e2e     # Playwright e2e
```

## GitHub Codespaces
- `.devcontainer/devcontainer.json` 포함 — Node 20 + Java 17(Firebase Emulator용) + Playwright(chromium) 자동 설치
- Codespace 진입 후 `npm run dev` 또는 두 터미널에서 `npm run emu:start` + `npm run dev`
- 환경변수는 **GitHub Codespaces Secrets**에 등록 (저장소 Settings → Secrets and variables → Codespaces)
- forwardPorts: 9002(Next), 4000(Emulator UI), 8080(Firestore), 9099(Auth), 9199(Storage)
- `dev:emu` 스크립트는 PowerShell 의존이라 Codespaces(Linux)에선 동작 안 함 → emulator/dev 별도 터미널 사용

## Claude에게 지시할 때
- 코드 변경 시 반드시 prismedu.kr 패턴과 일관성 유지
- 새 컴포넌트 만들기 전에 기존 컴포넌트 재사용 가능한지 먼저 확인
- 한국어 변수명·주석 OK (도메인 용어는 한국어가 더 정확)
- AI API 호출 코드 작성 시 비용·토큰 사용량 주석으로 표시
