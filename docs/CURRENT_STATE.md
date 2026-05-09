# 현재 진행 상태 — 2026-05-09 기준

다음 세션이 빠르게 시작할 수 있도록 요약. 사이트 완성 마감 **2026-06-30 (~7주 남음)**.

---

## ✅ 완료된 것

### 프론트엔드 (모든 페이지 완성)

**공개 페이지** (비로그인 SEO 가능):
- `/` 랜딩 (Hero/Trust/How-it-works/FAQ/Footer CTA)
- `/admissions` 학과 검색
- `/admissions/[universityId]` 대학 단독 상세
- `/admissions/[universityId]/[departmentId]` 학과 상세 (P-001 무료/유료 게이트)
- `/admissions/jaeoegukmin` 재외국민·외국인 (P-013 분리)
- `/pricing` 요금제 (PRODUCTS_KR 카탈로그)
- `/privacy /terms /refund /help` 법무·고객센터

**인증 사용자 페이지**:
- `/login` 로그인 (Google + 이메일)
- `/onboarding` 4단계 wizard (KR Specs 입력)
- `/dashboard` D-Day + 슬롯 진행도 + 빠른 액션
- `/profile` 계정·프로필·알림·탈퇴
- `/analysis` 분석 폼
- `/analysis/[matchId]` 결과 페이지 (실 동작 확인됨)
- `/chat` AI 카운슬러 (Anthropic 키 미등록 시 mock 응답 fallback)

**Pro 페이지** (ProGate 잠금):
- `/compare` 학과 비교
- `/what-if` 가정 시뮬레이터
- `/planner` 자동 플래너
- `/spec-analysis` 스펙 분석

**결제**:
- `/payment` `/payment/success` `/payment/fail` `/orders`

**관리자** (admins/{uid} active=true 필요):
- `/admin` 루트 대시보드 + KPI placeholder
- `/admin/admissions` 모집요강 staging 관리
- `/admin/orders` 주문 관리
- `/admin/users /admin/sample-stats /admin/sanitize-monitor /admin/etl-status /admin/etl-upload`

### 인프라

- **Firebase**: project `conatusipsi-f8e1d` (asia-northeast3 Seoul)
  - Firestore 보안 규칙 + 인덱스 배포됨 (`departments` composite index 포함)
  - Auth: 이메일/Google 활성화
  - 시드 데이터 5개 학과 (SNU 의예, 연세 경영, 부산 정보컴퓨터, 고려 자유전공, 한예종 영화)
- **GitHub**: https://github.com/conatusipsi-byte/prismedu-kr-admission (private)
- **Vercel**: https://prismedu-kr-admission-joonhyeon-s-projects.vercel.app
  - 환경변수 11개 등록 완료 (Firebase + Admin SDK + MASTER_EMAILS)
  - GitHub 연동 → main push 자동 재배포
  - SSO 보호 해제 (공개 staging)
- **Admin 권한**: `conatusipsi@gmail.com` (uid `GjAiuPFJmGgKu7RXr4HRDepkTJs1`) 부여 완료

---

## 🟡 출시 전 남은 일 (Tier 순)

### Tier 1 — 외부 키 등록 (블록 완화)
- [ ] **Anthropic API 키** 발급 + Vercel 등록 → AI 카운슬러 실 동작
  - 현재 미등록 시 mock 응답 (graceful)
  - `ANTHROPIC_API_KEY` env var 등록만 하면 됨
- [ ] **카카오 OAuth** 등록 (한국 사용자 표준)
  - `NEXT_PUBLIC_KAKAO_CLIENT_ID` + `KAKAO_CLIENT_SECRET`
- [ ] Firebase Auth 승인된 도메인에 Vercel URL 추가
  - Firebase Console → Authentication → Settings → 승인된 도메인
  - `prismedu-kr-admission-joonhyeon-s-projects.vercel.app` 추가

### Tier 2 — 코드 보강 (개발자 작업)
- [ ] Pro 페이지 4개의 실 기능 구현 (현재 ProGate 잠금만)
  - `/compare` → POST /api/compare 라우트 본체
  - `/what-if` → POST /api/match/simulate 본체 (route 골격 있음)
  - `/planner` → /api/planner/* 라우트 신규
  - `/spec-analysis` → POST /api/spec-analysis 본체 (Anthropic 호출)
- [ ] `/admin` 페이지 3개의 실 데이터 fetcher
  - `GET /api/admin/kpi` 신규
  - `GET /api/admin/etl/staging` 본체
  - `GET /api/admin/orders` 본체
- [ ] e2e Playwright 자동화 (Firebase Emulator 필요)
- [ ] Sentry DSN 등록 (선택, 권장)

### Tier 3 — 결제 시스템 (~7월 중)
- [ ] 사업자등록 + 통신판매업 신고 (방준현 작업)
- [ ] 토스페이먼츠 가맹점 가입 → 실키 발급
- [ ] Vercel에 `TOSS_SECRET_KEY` + `NEXT_PUBLIC_TOSS_CLIENT_KEY` 등록
- [ ] 결제 e2e 테스트 + 환불 운영 절차
- [ ] `NEXT_PUBLIC_BIZ_*` 사업자 정보 채우기 (footer 통신판매법 표시)

### Tier 4 — 시즌 진입 (~9월)
- [ ] **도메인 conatusipsi.com 구매 + Vercel 연결**
- [ ] 실 모집요강 데이터 시드 (mock 5개 → 1,000여 학과)
- [ ] Firebase Blaze 업그레이드 (시즌 트래픽 대비)
- [ ] Cloudflare 캐싱 검토
- [ ] 합격 사례 검증 데이터 모집 (정직성 원칙 — 표본 부족 학과 비공개 유지)

---

## 🛠️ 개발 환경 가이드

### 로컬 dev 실행
```bash
npm run dev  # 포트 9002
```

⚠️ **OneDrive 폴더에서 dev 시 ENOENT 가끔 발생**: `.next` 임시 파일이 OneDrive 동기화와 충돌. 해결책 (3가지):
1. `Remove-Item -Recurse -Force .next` 후 dev 재시작 (즉시)
2. OneDrive에서 프로젝트 폴더 동기화 일시 정지 (로컬 권장)
3. 프로젝트를 OneDrive 밖으로 이동 (예: `C:\dev\prismedu-kr-admission`) — 영구 해결

Vercel 빌드는 OneDrive 없으니 무관.

### admin 권한 부여
```bash
node scripts/grant-admin.mjs <이메일>
# 해당 이메일로 한 번 로그인 후 실행 (Firebase Auth user 생성 후)
```

### Firebase 규칙 + 인덱스 재배포
```bash
# CI 토큰 또는 firebase login 후
npx firebase deploy --only firestore:rules,firestore:indexes --project conatusipsi-f8e1d
```

### 환경변수 (Vercel)
- 본 repo에 `.env.local` 은 미포함 (.gitignore 차단)
- 새 개발자는 `.env.local.example` 참고 + Firebase Console에서 config 받아 채우기
- 운영 환경변수는 Vercel 대시보드 또는 `vercel env pull`

---

## 🔐 보안 메모

- **Firebase Admin SDK 키 (JSON)**: `C:\Users\keuke\Documents\firebase-keys\` 보관 (.gitignore 차단)
- **GitHub PAT + Vercel 토큰**: 작업 끝나면 폐기 권장 (CI에선 GitHub Actions Secrets로)
- **민감 키 노출 시**: 즉시 폐기 → 재발급 → Vercel env 갱신
- **MASTER_EMAILS**: 서버 전용 (NEXT_PUBLIC_ 사용 금지). 현재 `hjan040507@gmail.com` 등록

---

## 📚 참고 문서

- 정책: `docs/policy.md` (P-001~P-013)
- 사이트맵: `docs/sitemap.md`
- staging 셋업: `docs/staging-setup.md`
- 컴포넌트 인벤토리: `docs/component-inventory.md`
- 사용자 플로우: `docs/user-flows.md`
- 운영 매뉴얼: `docs/operations.md`
