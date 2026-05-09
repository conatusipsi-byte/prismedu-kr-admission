# Staging 배포 — 5분 절차서

본 문서는 클라이언트(방준현)가 Vercel·Firebase 가입을 완료한 직후, 첫 staging 환경을 5분 안에 띄우기 위한 절차다. 패닉 상태에서도 따라할 수 있게 짧고 확정적으로 작성.

> 📌 **이미 가입·환경변수 등록까지 완료된 운영자**라면 본 문서 §6 `첫 배포 검증 5단계`만 보면 된다.
> 처음 시작하는 경우 §0 부터 순서대로 따라간다.
> 더 깊은 내용(권한 이관·CDN·시즌 트래픽 대비)은 [`docs/setup.md`](./setup.md) 본문 참조.

---

## 0. 사전 받아야 할 정보 체크리스트

다음 정보를 먼저 확보. 모두 확보된 시점부터 §1을 시작한다.

- [ ] **운영팀 대표 Google 계정** (Vercel·Firebase·Anthropic 모두 동일 계정 사용 권장)
  - 예: `conatusipsi@gmail.com` (운영팀이 새로 발급한 공용 계정)
- [ ] **계정 비밀번호 또는 일시 인증번호 약속** (개발자가 1회 로그인 필요)
- [ ] **GitHub 계정** (조직 또는 개인) — 코드 push·시크릿 등록용
- [ ] **결제 카드** (Anthropic 충전·Vercel Pro·도메인 갱신용)
- [ ] **사업자등록증 사본** (토스페이먼츠 가입 시 — 결제 단계에서 필요, 첫 배포엔 불필요)
- [ ] **2FA 인증 앱이 설치된 폰** (Google Authenticator 등)

> ⚠️ 결제 카드는 첫 배포에 **반드시 필요한 건 아님**. Vercel Hobby + Firebase Spark + Anthropic 0$ 잔액으로 시작 가능. 다만 시즌 진입 전엔 카드 등록 필수.

---

## 1. Vercel 프로젝트 생성 — 약 3분

### 1.1 가입 + GitHub 연결

1. https://vercel.com/login 접속
2. **Continue with GitHub** 클릭 → 운영팀 GitHub 계정으로 인증
3. 권한 요청 화면 → `prismedu-kr-admission` 레포만 선택해서 허용 (또는 전체)

> // TODO: 스크린샷 — Vercel GitHub 연결 화면

### 1.2 프로젝트 import

1. 대시보드 → **Add New...** → **Project**
2. `prismedu-kr-admission` → **Import**
3. **Configure Project** 입력:
   - Project Name: `conatusipsi-staging` (또는 운영팀 명명)
   - Framework Preset: `Next.js` (자동 감지됨)
   - Root Directory: `./` (기본)
4. **Environment Variables** 섹션은 건너뛰고 (§4에서 일괄 등록), **Deploy** 클릭
   - 첫 빌드는 환경변수 부족으로 실패할 수 있음. 정상 — §4 후 재배포로 해결.

> // TODO: 스크린샷 — Vercel Configure Project 화면

### 1.3 프로젝트 ID·Org ID 메모

추후 GitHub Actions 시크릿에 등록하기 위해 두 값을 기록:

1. 프로젝트 페이지 → **Settings** → **General**
2. 다음 두 값 메모:
   - **Project ID**: `prj_xxxxxxxxxxx`
   - **Team/Personal ID** (Settings 페이지 상단 또는 URL에서): `team_xxxxx` 또는 `personal_xxxxx`

> // TODO: 스크린샷 — Vercel Project Settings (Project ID 위치)

### 1.4 Vercel 토큰 생성 (GitHub Actions용)

1. https://vercel.com/account/tokens
2. **Create Token** → 이름 `github-actions-staging`, 만료 `90 days` (시즌 후 회전)
3. 생성된 토큰 (`vc_xxxxxx`) 메모 — 다시 볼 수 없음

---

## 2. Firebase 프로젝트 생성 — 약 5분

### 2.1 프로젝트 생성

1. https://console.firebase.google.com 접속, 운영팀 Google 계정으로 로그인
2. **프로젝트 추가** → 프로젝트 이름: `conatusipsi`
3. Google Analytics: **사용 안 함** (개인정보 우려)
4. 생성 대기 약 30초

> // TODO: 스크린샷 — Firebase 프로젝트 생성

### 2.2 Firestore (asia-northeast3) ⚠️ 중요

**한 번 선택하면 영구 변경 불가.** 반드시 **asia-northeast3 (서울)** 선택.

1. 좌측 메뉴 → **Firestore Database** → **데이터베이스 만들기**
2. 모드: **프로덕션 모드** (보안 규칙 기본 deny)
3. 위치: **asia-northeast3 (Seoul)** ← 절대 다른 거 X
4. **사용 설정**

### 2.3 Authentication

1. 좌측 메뉴 → **Authentication** → **시작하기**
2. 로그인 제공업체:
   - [x] **이메일/비밀번호** — 사용 설정
   - [x] **Google** — 사용 설정 (지원 이메일은 운영팀 대표 메일)
   - 카카오는 별도 OAuth 라우트로 구현됨 (출시 전 카카오 디벨로퍼스에서 별도 설정)

### 2.4 Storage

1. 좌측 메뉴 → **Storage** → **시작하기**
2. 보안 규칙: **프로덕션 모드**
3. 위치: **asia-northeast3** (Firestore와 동일)

### 2.5 웹 앱 등록 + Config 복사

1. **프로젝트 설정** (톱니바퀴 아이콘) → **일반** 탭
2. 하단 **내 앱** 섹션 → 웹 앱 아이콘 (`</>`) 클릭
3. 앱 닉네임: `conatusipsi-web` → **앱 등록**
4. 표시되는 `firebaseConfig` 객체 전체 복사 — §4에서 사용:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "conatusipsi.firebaseapp.com",
     projectId: "conatusipsi",
     ...
   };
   ```

> // TODO: 스크린샷 — Firebase 웹 앱 config 표시 화면

### 2.6 서비스 계정 키 발급

1. **프로젝트 설정** → **서비스 계정** 탭
2. **새 비공개 키 생성** → JSON 파일 다운로드
3. 파일 내용 전체를 §4 `FIREBASE_SERVICE_ACCOUNT` 시크릿에 등록 — 다시 못 받음

> // TODO: 스크린샷 — 서비스 계정 키 다운로드

### 2.7 보안 규칙 배포 (개발자가 한 번 실행)

```bash
npm install -g firebase-tools
firebase login           # 운영팀 계정으로
firebase use --add       # conatusipsi 프로젝트 선택
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

---

## 3. 환경변수 등록 (Vercel + GitHub Secrets)

### 3.1 Vercel 환경변수

Vercel 프로젝트 → **Settings** → **Environment Variables**.

**Production / Preview / Development** 모두 체크해서 등록 (또는 Preview만 — staging 전용 시):

| Key | Value | 비고 |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | §2.5 config의 `apiKey` | 공개 OK |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | §2.5 config의 `authDomain` | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | §2.5 config의 `projectId` | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | §2.5 config의 `storageBucket` | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | §2.5 config의 `messagingSenderId` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | §2.5 config의 `appId` | |
| `FIREBASE_ADMIN_PROJECT_ID` | §2.5 `projectId`와 동일 | 서버 전용 |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | §2.6 JSON의 `client_email` 필드 | 서버 전용 |
| `FIREBASE_ADMIN_PRIVATE_KEY` | §2.6 JSON의 `private_key` 필드 (개행 그대로) | 서버 전용 |
| `ANTHROPIC_API_KEY` | (출시 전엔 placeholder, 출시 시 §5.1) | 서버 전용 |
| `NEXT_PUBLIC_SITE_URL` | `https://conatusipsi-staging.vercel.app` 또는 도메인 연결 후 `https://conatusipsi.com` | OG 메타용 |

> ⚠️ `FIREBASE_ADMIN_PRIVATE_KEY` 는 줄바꿈(`\n`)을 포함한 긴 PEM 문자열이다. Vercel 입력창에 그대로 복사·붙여넣기 (Vercel이 자동 처리). 입력 후 **Encrypted** 체크 확인.

### 3.2 GitHub Secrets (자동 배포용)

레포 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| 시크릿 | 값 출처 |
|---|---|
| `VERCEL_TOKEN` | §1.4에서 메모한 토큰 |
| `VERCEL_ORG_ID` | §1.3에서 메모한 Team/Personal ID |
| `VERCEL_PROJECT_ID` | §1.3에서 메모한 Project ID |
| `FIREBASE_SERVICE_ACCOUNT` | §2.6에서 다운로드한 JSON **전체** (한 줄로 안 줄여도 됨) |
| `ANTHROPIC_API_KEY` | (출시 전 placeholder, 시드용엔 불필요) |

> // TODO: 스크린샷 — GitHub Secrets 등록 화면

---

## 4. 시드 데이터 로드 — 약 1분

`scripts/firestore/seed-staging.ts`가 진학 학과·대학 mock 데이터를 일괄 로드한다.

개발자가 로컬에서 1회 실행:

```bash
# §2.6에서 다운로드한 JSON 파일 경로 입력
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/conatusipsi-firebase-adminsdk.json

npx tsx scripts/firestore/seed-staging.ts
```

진행률 출력:
```
🏗  Firestore staging 시드 시작
✅ 1/5: 서울대학교/의예과 (universities + admissions + sampleStats)
✅ 2/5: 연세대학교/경영학과 (학종 분해 시연)
✅ 3/5: 부산대학교/정보컴퓨터공학부 (P-012 변환표 preliminary 시연)
✅ 4/5: 고려대학교/자유전공학부 (P-001 표본 부족 시연)
✅ 5/5: 한국예술종합학교/영상원 영화과 (실기 전형)
✨ 시드 완료 — 학과 5개, 합격 사례 27건, 표본 통계 6건
```

`--dry-run` 플래그로 미리 확인 가능 (실제 쓰기 안 함).

> ⚠️ 본 시드는 **테스트·시연용 mock**이다. 출시 직전(2026-09)엔 실제 모집요강 ETL 파이프라인 결과로 교체 — 본 mock 데이터는 운영 환경에서 제거.

---

## 5. 도메인 연결 (가비아 → Vercel) — 도메인 구매 후

도메인 미구매 상태에서는 Vercel이 발급하는 `.vercel.app` 주소로 staging 운영 가능. 본 섹션은 도메인 구매 완료 후 진행.

### 5.1 Vercel에 도메인 추가

1. Vercel 프로젝트 → **Settings** → **Domains**
2. `conatusipsi.com` 입력 → **Add**
3. Vercel이 안내하는 DNS 레코드 메모:
   - `A` 레코드: `@` → `76.76.21.21`
   - `CNAME` 레코드: `www` → `cname.vercel-dns.com`

### 5.2 가비아에서 DNS 변경

1. https://my.gabia.com/ → 도메인 → `conatusipsi.com` → **DNS 관리**
2. 기존 A·CNAME 있으면 백업 후 삭제
3. 위 §5.1 레코드 등록 (TTL 기본 3600)

### 5.3 SSL 자동 발급 확인

DNS 전파 5분~1시간 후 Vercel `Settings` → `Domains`에서 `Valid Configuration` 표시 → SSL 자동 발급. https://conatusipsi.com 자물쇠 확인.

---

## 6. 첫 배포 검증 5단계 ⚠️ 매번 확인

각 단계 완료 후 다음으로. 실패 시 멈추고 §7 트러블슈팅.

- [ ] **1. Vercel 빌드 Ready** — 대시보드 `Deployments` → 최신 빌드 초록색 ✅
- [ ] **2. 첫 페이지 200 OK** — staging URL 접속, 한국어 콘텐츠 정상 표시
- [ ] **3. /analysis 폼 진입** — 분석 폼 wizard 1단계 노출, 외국 고교 'yes' 선택 시 `/admissions/jaeoegukmin` redirect (P-013)
- [ ] **4. /admissions/jaeoegukmin 진입** — 자가진단 wizard 정상 동작
- [ ] **5. Firestore 콘솔에서 시드 5개 학과 확인** — `universities` 컬렉션에 snu/yonsei/pusan/korea/knua 도큐먼트 존재

5단계 모두 ✅면 staging 운영 가능 상태.

---

## 7. 트러블슈팅 — 자주 발생 5종

### 7.1 Vercel 빌드 실패: "Missing required environment variables"
- **증상**: 빌드 로그에 `NEXT_PUBLIC_FIREBASE_*` 또는 `FIREBASE_ADMIN_*` 누락 에러
- **원인**: §3.1 표의 키 일부 미등록 또는 오타
- **해결**: Vercel `Settings` → `Environment Variables`에서 §3.1 표와 1:1 대조. 누락 항목 추가 → **Redeploy**.

### 7.2 Firebase "PERMISSION_DENIED"
- **증상**: 첫 페이지는 뜨지만 데이터 안 불러옴, Firestore 쿼리 에러
- **원인**: §2.7 보안 규칙 미배포 또는 운영자 `admins` 도큐먼트 미생성
- **해결**:
  1. `firebase deploy --only firestore:rules,firestore:indexes,storage:rules` 재실행
  2. 운영자가 한 번 로그인 → `users/{uid}` 도큐먼트 자동 생성됨 → 그 uid로 `admins/{uid}` 도큐먼트에 `active: true (boolean)`, `email: "..."` 추가

### 7.3 도메인 SSL 발급 안 됨
- **증상**: https 자물쇠 없음, "Valid Configuration" 안 나옴
- **원인**: DNS 전파 지연 또는 잘못된 A 레코드
- **해결**:
  1. 터미널에서 `dig conatusipsi.com +short` → `76.76.21.21` 나오는지 확인
  2. 가비아에 다른 A 레코드(서버 IP 등) 잔존 시 삭제
  3. 5분~24시간 대기 후 Vercel `Settings` → `Domains` 새로고침

### 7.4 GitHub Actions 실패: "Missing VERCEL_TOKEN"
- **증상**: `staging-deploy.yml` 실행 시 시크릿 부재 에러
- **원인**: §3.2 시크릿 누락 또는 워크플로의 `if: false` 미해제
- **해결**:
  1. `.github/workflows/staging-deploy.yml` 상단 주석의 활성화 절차 따라 `if: false` 제거
  2. 시크릿 5개 모두 등록되었는지 확인 (Settings → Secrets and variables → Actions)

### 7.5 시드 스크립트 실패: "Could not load default credentials"
- **증상**: `npx tsx scripts/firestore/seed-staging.ts` 실행 시 인증 에러
- **원인**: `GOOGLE_APPLICATION_CREDENTIALS` 환경변수 미설정 또는 JSON 경로 오타
- **해결**:
  ```bash
  # JSON 파일 절대 경로 확인
  ls -la /path/to/conatusipsi-firebase-adminsdk.json

  # 환경변수 export 후 재실행 (현 셸에서만 유효)
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/file.json
  npx tsx scripts/firestore/seed-staging.ts
  ```

---

## 8. 다음 단계

배포 완료 후:
1. **Sentry 추가 설정** — `docs/setup.md §6` 참조 (에러 추적)
2. **Anthropic API 키 등록** — AI 카운슬러·매칭 기능 활성화 시점
3. **토스페이먼츠 가맹점 가입** — 결제 출시 직전 (사업자등록증 필요)
4. **시즌 트래픽 대비** — `docs/setup.md §5` (Cloudflare 도입 시점·기준)

상세 운영 매뉴얼: [`docs/operations.md`](./operations.md)
권한 이관 절차: [`docs/setup.md §9`](./setup.md)
