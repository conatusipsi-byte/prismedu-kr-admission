# E2E 워크플로우 임시 비활성화 (2026-05-21)

## 배경
- 대상 워크플로: `.github/workflows/e2e.yml`
- 증상: `main` push / PR 마다 e2e job 이 실패 (빨간 X)
- 에러:
  ```
  [WebServer] bash: ./scripts/dev-with-emulator.sh: No such file or directory
  Error: Process from config.webServer was not able to start. Exit code: 127
  ```

## 원인
Stage 0 (Firebase → Supabase) 마이그레이션 진행 중 `scripts/dev-with-emulator.sh` 가 삭제됨.
그러나 `playwright.config.ts` 의 `webServer.command` 는 여전히 해당 스크립트를 호출하도록 남아 있어
CI 의 `npm run test:e2e` 가 즉시 종료(exit 127).

`scripts/` 디렉터리 현재 내용:
- `etl/`
- `seed-sample-data.ts`
- `smoke-anthropic.ts`
- `smoke-supabase.ts`
- `verify-supabase-schema.ts`

→ Firebase Emulator 기반 dev 부팅 스크립트는 더 이상 존재하지 않음.

## 결정
`.github/workflows/e2e.yml` 의 `e2e` job 에 `if: false` 를 추가하여 임시 비활성화.
파일은 보존(삭제하지 않음) — 복구 시점에 `if:` 한 줄만 제거하면 됨.

`ci.yml`, `staging-deploy.yml`, `track-vocab-check.yml` 은 영향 없음 (해당 스크립트를 참조하지 않음).

## 복구 시 필요한 작업
출시(2026-09) 전 반드시 복구. 복구 체크리스트:

1. **`playwright.config.ts` `webServer` 갱신**
   - 현재: `bash ./scripts/dev-with-emulator.sh` 호출
   - 변경: Supabase 환경에 맞춰 `npm run dev` + 로컬 Supabase(또는 staging URL) 조합으로 재구성
   - Windows 분기(`npm run dev:emu`)는 불필요해졌으므로 단순화 가능

2. **로컬 Supabase 또는 staging URL 사용 결정**
   - 옵션 A: GitHub Actions runner 에서 `supabase start` (Docker 필요, 가장 격리적)
   - 옵션 B: 전용 staging Supabase 프로젝트 URL 을 `E2E_BASE_URL` / env 로 주입 (외부 의존성 ↑)
   - 권장: 옵션 A — CI 격리 + 비밀키 누출 위험 ↓

3. **시드 데이터 로드 자동화**
   - 기존: emulator 기동 후 `npm run emu:seed` 가 Firestore 시드 주입
   - 신규: Supabase 로컬 띄운 뒤 `supabase db reset` + `scripts/seed-sample-data.ts` (또는 신규 SQL 시드) 로 대체
   - `tests/e2e/*.spec.ts` 가 의존하는 픽스처(사용자·대학·학과) 목록을 먼저 추출해 시드 스크립트에 반영

4. **워크플로 env 갱신**
   - Firebase emulator 호스트 env(`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT` 등) 제거
   - Supabase env(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) 로 교체
   - 로컬 supabase 사용 시 fixed local URL/key 사용 가능

5. **e2e.yml `if: false` 제거 + 본 결정 문서 상단 주석 제거**

## 참고
- Stage 0 마이그레이션 관련 결정: (TBD — Supabase 전환 결정 문서 추가 예정)
- 영향 받은 커밋: 본 비활성화 직전 main 브랜치까지의 Supabase 전환 작업
