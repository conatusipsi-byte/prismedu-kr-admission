# 프로젝트: 한국 대학 입시 AI 추천 웹 서비스

> **📌 먼저 읽을 것: [`HANDOVER.md`](./HANDOVER.md)**
> 2026-08 개발자→클라이언트(방준현) 이관 완료. 현재 **되는 것/안 되는 것**, 인프라·환경변수,
> 운영 절차는 전부 HANDOVER.md 에 실측 기준으로 정리돼 있다. `docs/CURRENT_STATE.md` 등
> 일부 오래된 문서보다 **HANDOVER.md 를 우선**한다.

## 프로젝트 개요
- **클라이언트**: 방준현 (계약 체결: 2026.05.02, **2026-08 이관 완료 — 이후 클라이언트 직접 운영**)
- **벤치마크**: 진학사 + 대학어디가
- **참고**: 운영 중인 prismedu.kr (미국 대학 입시 AI 플랫폼) 코드 80% 재활용
- **출시 목표**: 2026년 9월
- **사이트 완성 목표**: 2026년 6월 30일
- **결제 시스템 추가 완성**: 2026년 7월 초~중순

## 핵심 기능
1. **합격률 분석**: 성적 입력 → 학과별 합격 가능성. **현재 근거는 대학 공시 전년도 입결(컷) 기반
   `official_estimate` 추정** — 개별 합격자 표본(`admission_sample_stats`)은 **0행**이다.
   UI에 "추정" 배지 + "합격자 표본 아님" 문구 필수. 플래그 `NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED`
   (현재 프로덕션 ON). 자세한 배경은 HANDOVER.md B장 1번.
2. **맞춤 대학 추천**: Reach / Hard Target / Target / Safety 분류
3. **모집요강·입시정보 조회**: 2027학년도 수시 93교·정시(예정안) 16교 적재됨
4. **AI 입시 카운슬러 챗 / 적합도 분석 / 생기부 5축 분석**: 프로필 기반, 비용 통제 필수
5. **단건 PG 결제 시스템**: 코드 완성. **⚠️ 프로덕션 미작동 — 토스 실키 미등록**
   (`/api/health` → `toss.set=false`, 결제 페이지 503). 사업자등록·통신판매업 신고 선행 필요.
   → 결과적으로 Pro 전용 기능은 현재 `MASTER_EMAILS` 또는 `user_entitlements` 수동 부여로만 열림.

## 기술 스택 (실제 채택분)
> 초기 기획에선 PostgreSQL/Prisma/Supabase·Firebase 등을 검토했고, 실제 구현은 **Supabase 스택**으로 확정됨.
> (2026-05 Firebase→Supabase 마이그레이션 완료. `docs/supabase-migration-handoff.md` 참조 — 일부 과거 주석/문서에 firebase 잔재가 남아있을 수 있음.)
- **Frontend**: Next.js 15 (App Router, Turbopack) / React 19 / TypeScript 5 / Tailwind CSS 3
- **UI 컴포넌트**: Radix UI + shadcn/ui (`components.json`) + lucide-react
- **Backend**: Next.js API Routes (`app/api/*`) — 서버는 service-role Supabase 클라이언트 (`lib/supabase-server.ts`)
- **DB / Storage / Auth**: Supabase(ref `bqmccfeglxzzrmgdirxe`) — Postgres(RPC 예: `search_admissions_v2`)
  + Supabase Auth + Supabase Storage. RLS 로 행 보안.
  로그인은 **카카오 + 이메일만 활성**. 구글은 `app/login/LoginView.tsx` 의 `GOOGLE_OAUTH_ENABLED=false` 로 비활성.
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) — `lib/anthropic.ts`, 캐싱 `lib/ai-cache.ts`(Supabase `ai_cache`), 호출 제한 `lib/rate-limit.ts`(Supabase `rate_limits` RPC)
- **Payment**: 토스페이먼츠 (`@tosspayments/tosspayments-sdk`) — 단건결제, 구독 호환 스키마
- **모니터링**: Sentry (`@sentry/nextjs`)
- **테스트**: Vitest 4 (단위, CI 활성) + Playwright 1.59 (e2e — **CI 비활성**, `.github/workflows/e2e.yml`
  2026-05-21 부터 중단. Supabase 전환 후 미복구) + Testing Library
- **로컬 개발**: dev 서버는 원격 Supabase(스테이징/프로덕션)에 연결 — `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY` 필요. (Firebase Emulator 미사용)
- **Deploy**: Vercel
- **Dev port**: 9002

## 디자인 가이드
- **브랜드 컬러**: #10B981 (emerald) — 2026-05 리브랜드. 구 민트 #00C9A7 은 레거시(신규 코드는 `brand-*` emerald 토큰 사용)
- **톤앤매너**: 깔끔, 정보 밀도 높지만 답답하지 않게
- **타깃**: 학생·학부모·교사 모두 사용 (UI는 학생 기준 우선)
- **반응형**: 모바일 우선 (학생은 모바일 사용 비중↑)

## 개발 원칙
- prismedu.kr 코드 패턴·컴포넌트를 최대한 재사용한다
- AI API 비용 절감을 위해 캐싱·사용량 제한 로직을 처음부터 넣는다
- 결제 시스템 DB 스키마는 처음부터 구독 호환 구조로 설계한다
- 한국 입시는 자소서 첨삭이 들어가지 않으므로 그 영역은 제외한다
- 시즌(7~11월) 트래픽 폭증 대비 인덱싱·캐싱을 미리 고려한다
- **정직성 원칙**: 근거 없는 수치를 만들지 않는다. 표본/입결이 없으면 확률을 표시하지 않고,
  추정치는 반드시 "추정"임을 UI에 명시한다. AI 카운슬러도 임의 합격선·수치를 생성하지 않는다.
  데이터가 없으면 "모른다"고 말한다. (정책 코드: `docs/policy.md` P-001·P-002)

## ETL(모집요강 적재) 주의사항 — 사고 방지용, 반드시 지킬 것

1. **`load-admissions.ts` 는 `--only=<univId,...>` 없이 `--execute` 하지 않는다.**
   전체 실행은 `tracks` 컬럼을 통째로 UPSERT 하므로, 나중에 JSONB 병합으로 넣은
   **정시 트랙(현재 617행)이 소실**된다. 신규/재적재 대학만 `--only` 로 한정할 것.
   ```bash
   npx tsx scripts/etl/load-admissions.ts --only=<univId>             # dry-run (DB 무변경)
   npx tsx scripts/etl/load-admissions.ts --only=<univId> --execute   # 실제 적재
   ```
   적재 전후로 정시 행 수(`tracks` 에 `jeongsi*` 키 보유 행)를 비교 검증한다.
2. **정시는 `load-jeongsi-plan.ts` 로만 적재** — read-modify-write JSONB **MERGE** 방식이라
   기존 수시 트랙을 보존한다. 단순 upsert 금지. 적재 후 non-jeongsi 트랙 잔존 여부를 self-assert 한다.
   현재 정시는 전형시행계획 **예정안**(`planStatus="preliminary"`) → 12월 확정본으로 교체 필요.
3. **central 독립 재검증** — 추출 스크립트의 self-report(“행합 일치” 등)를 신뢰하지 말고,
   `scripts/etl/text-extract-test/central-verify.py` 로 원문 대조를 **독립 실행**한다.
   과거 self-report 통과분에서 alias 키 유니코드(`⋅` U+22C5)·norm 충돌·커버리지 누락이 검출된 적 있다.
4. **무결성 게이트를 우회하지 않는다** — 체크섬·학년도 검증 실패 source 는 적재 거부가 정상.
   `--allow-checksum-fail` 은 원인 규명 후에만. (예: 중앙대 열합 미일치 → 재정합 후 적재)
5. **학과 매칭은 추정 금지** — `dept-matcher` 로 못 붙인 학과는 SKIP + 리포트. 임의 생성·강제 매칭 금지.
6. **학년도 독립 검증** — 파일명이 아니라 **PDF 본문**으로 학년도를 확인한다.
   (충남대: 파일명만 2027, 내용은 2026 → 제외. 서울과기대: "(안)" 초안 → `meta.draft=true`)
7. **`scripts/seed-sample-data.ts` 는 실행 금지.** 경쟁률·컷·합격표본을 `Math.random()` 으로
   생성해 DB에 넣는 초기 시연용 스크립트다. 2026-06 에 이 난수 데이터를 전량 purge 했고
   (현재 `admission_sample_stats` 0행), 재실행하면 **가짜 합격률이 프로덕션에 노출**된다.
8. 현황: 100교 목표 중 **93교 적재**. 남은 7교와 사유는 HANDOVER.md B장 4번.

## 한국 입시 도메인 주의사항
- 모집요강 데이터는 매년 7~9월 시즌마다 업데이트 필요
- 진학사·대학어디가 무단 크롤링 금지 (법적 리스크)
- 학과 단위 (대학 단위 아님) — 같은 대학이라도 학과별 입시 일정·등급 다름
- 정시·수시·학종·교과·논술·실기 전형별 데이터 구조 분리 필요

## 폴더 구조
```
app/                  # Next.js App Router
  api/                # API Routes (서버사이드, Supabase service-role)
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
lib/                  # 도메인·유틸 (supabase, anthropic, ai-cache, rate-limit, schemas …)
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
npm run dev          # Next.js 개발 서버 (port 9002, turbopack) — 원격 Supabase 연결
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest 단위 (1회)
npm run test:watch   # Vitest watch
npm run test:e2e     # Playwright e2e
```

## GitHub Codespaces
- `.devcontainer/devcontainer.json` 포함 — Node 20 + Playwright(chromium) 자동 설치
- Codespace 진입 후 `npm run dev` (원격 Supabase 연결)
- 환경변수는 **GitHub Codespaces Secrets** 또는 `.env.local` 에 등록. 필수: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`·`ANTHROPIC_API_KEY`·토스/Resend 키 등 (없으면 DB·로그인·결제·AI 동작 안 함)
- forwardPorts: 9002(Next)
- Firebase Emulator 는 더 이상 사용하지 않음 (Supabase 마이그레이션 후 제거)

## Claude에게 지시할 때
- 코드 변경 시 반드시 prismedu.kr 패턴과 일관성 유지
- 새 컴포넌트 만들기 전에 기존 컴포넌트 재사용 가능한지 먼저 확인
- 한국어 변수명·주석 OK (도메인 용어는 한국어가 더 정확)
- AI API 호출 코드 작성 시 비용·토큰 사용량 주석으로 표시

## 안전 규칙 (Claude 작업 시)
- **DB를 변경하는 작업(데이터 삭제·대량 UPDATE·마이그레이션)은 실행 전 사용자 확인 + 백업 확인.**
  dry-run 결과를 먼저 보여주고 승인을 받는다.
- **`main` push = 즉시 프로덕션 배포**(Vercel Git 연동). push 전 `npm run typecheck` → `npm test`
  → `npm run build` 통과를 확인하고, 사용자 승인 없이 push 하지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`·`TOSS_SECRET_KEY`·`VERCEL_TOKEN` 등 비밀키에 `NEXT_PUBLIC_` 금지.
  키 값을 문서·커밋·로그·응답 본문에 절대 남기지 않는다.
- 새 환경변수는 Vercel production/preview/development **3개 타깃 모두** 등록(누락 시 preview 로그인 전면 불능).
- AI 기능 수정 시 캐시(`ai_cache`)·rate limit·plan 게이트를 제거하지 않는다(운영 API 비용 직결).
