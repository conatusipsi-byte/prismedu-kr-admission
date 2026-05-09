# e2e 테스트 — Playwright

## 사전 설치

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

## 실행 환경

```bash
# 1. 시드 데이터 (서울대 의예과)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
  npx tsx scripts/firestore/init-collections.ts

# 2. firestore.indexes.json deploy (collectionGroup 인덱스)
firebase deploy --only firestore:indexes

# 3. dev 서버
npm run dev    # http://localhost:9002

# 4. e2e 실행
npx playwright test tests/e2e/admissions-search.spec.ts
```

## 환경변수

- `E2E_BASE_URL`: 기본 `http://localhost:9002`. staging 검증 시 staging URL 지정.

## CI 통합 (추후)

GitHub Actions 워크플로 `e2e.yml` (별도 PR) 으로 PR 머지 전 자동 실행 권장.
Firebase Emulator 또는 staging 프로젝트와 함께 동작.

## 본 PR 단계

본 환경에서는 Playwright 미설치 + Firebase 자격증명 미설정 + 시드 데이터 부재로
**spec 파일만 작성 + 실 실행은 사용자 환경에서**.

실행 결과 보고 후 회귀 게이트로 등록.
