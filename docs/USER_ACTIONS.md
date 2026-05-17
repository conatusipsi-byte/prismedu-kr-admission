# 사용자 액션 체크리스트 — 외부 키 등록

방준현 클라이언트가 직접 처리해야 하는 4개 작업. 각 항목은 ~5분이면 끝나며 등록 후 **Vercel 재배포 자동 트리거됨** (env 변경 시 next deploy 권장 — 1번 끝의 빈 commit push 또는 Vercel 대시보드 Redeploy).

작업 순서: ①Firebase 도메인 → ②Sentry → ③Anthropic → ④카카오 (난이도 오름차순).

---

## ① Firebase 승인 도메인 추가 — 2분, 필수

**왜 필요**: 이거 안 하면 Google 로그인 시 `auth/unauthorized-domain` 에러로 가입 자체 불가.

1. https://console.firebase.google.com/project/conatusipsi-f8e1d/authentication/settings 접속
2. **승인된 도메인** 섹션 → **도메인 추가** 클릭
3. 다음 도메인 추가 (한 번에 하나씩):
   - `prismedu-kr-admission-joonhyeon-s-projects.vercel.app` (현재 staging URL)
   - (도메인 구매 후) `conatusipsi.com`
4. 완료 — 즉시 반영. 재배포 불필요.

---

## ② Sentry DSN 등록 — 5분, 권장 (시즌 트래픽 7~11월 디버깅 핵심)

**왜 필요**: 출시 후 prod 에러를 모니터링. DSN 없으면 `lib/sentry-report.ts` + `app/global-error.tsx` 가 silent no-op.

### Sentry 프로젝트 생성

1. https://sentry.io/signup/ — 무료 플랜 (월 5K 에러 / 5K replays) 충분
2. 조직 생성 시 이름은 **자유** (예: `conatusipsi`)
3. **Create Project** → Platform = **Next.js**
4. 프로젝트 이름 = `kr-admission` (또는 자유)
5. 생성 후 노출되는 DSN 복사:
   `https://abc123…@o12345.ingest.sentry.io/67890`

### Vercel env 등록

https://vercel.com/joonhyeon-s-projects/prismedu-kr-admission/settings/environment-variables

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | (위 DSN 그대로) | Production + Preview |
| `SENTRY_DSN` | (동일 값) | Production + Preview |
| `NEXT_PUBLIC_SENTRY_ENV` | `production` | Production |

소스맵 업로드까지 원하면 (선택, 권장):
1. Sentry → **Settings → Account → API → Auth Tokens** → **Create New Token**
2. 권한: `project:releases`, `project:write`
3. Vercel env 추가:
   - `SENTRY_ORG` = (Sentry 조직 슬러그, URL `sentry.io/[org]` 의 그 부분)
   - `SENTRY_PROJECT` = `kr-admission` (또는 위에서 생성한 이름)
   - `SENTRY_AUTH_TOKEN` = (방금 발급한 토큰)

### 검증

env 등록 후 Vercel 재배포(빈 commit + push 또는 대시보드 Redeploy). 그 다음:

```
https://prismedu-kr-admission-joonhyeon-s-projects.vercel.app/api/health
```

응답 JSON 의 `env.sentry.set` 이 `true` 면 OK. `notes.sentryMissing` 메시지가 사라짐.

---

## ③ Anthropic API 키 등록 — 5분, 권장

**왜 필요**: AI 카운슬러가 실 응답. 미등록 시 `lib/anthropic.ts` 가 mock fallback 동작 (정형 가이드 응답만).

1. https://console.anthropic.com/settings/keys 접속 (없으면 회원가입)
2. **결제 등록** (선불 충전 권장): https://console.anthropic.com/settings/billing
   - 첫 충전 권장액: **$10** (~13,000원). 비용 가드(plans.ts featureLimit)가 토큰 소모를 자동 차단해서 갑작스런 고지 없음.
   - 결제 안 하면 키 발급은 되지만 첫 호출에서 401 (credit_balance_too_low).
3. **Create Key** → 이름 = `kr-admission-prod` → 복사 (한 번만 노출됨, 분실 시 재발급)
4. Vercel env:
   | Name | Value | Environments |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Production + Preview |
5. 재배포 → `/api/health` 의 `env.anthropic.set` = `true` 확인

### 비용 가드 — 이미 코드에 있음

- `lib/plans.ts featureLimit("aiChatDailyLimit")` — 무료 사용자 5회/일, Pro/Elite 무제한
- `/api/chat` 가 Firestore quotaUsage 트랜잭션으로 일별 카운트 강제
- `/api/spec-analysis` 는 1분 5회 rate limit (큰 토큰 소모)

→ Anthropic 비용은 사용자 수 × Pro 비율에 비례. staging 단계는 본인만 쓰니 $10 으로 충분.

---

## ④ 카카오 OAuth 등록 — 10분, 권장 (한국 사용자 기본 로그인)

**왜 필요**: 한국 학생 다수가 Google 계정 없이 카카오만 사용. 미등록이어도 Google + 이메일 로그인은 동작.

### 카카오 디벨로퍼 앱 생성

1. https://developers.kakao.com/console/app 접속 → 카카오 계정 로그인
2. **애플리케이션 추가하기**:
   - 앱 이름: `conatusipsi`
   - 사업자명: 사업자등록 후 본명 또는 사업자명 (지금은 본명 가능)
3. 생성된 앱 → 좌측 **앱 키** 메뉴
   - **REST API 키** 복사 → `KAKAO_CLIENT_SECRET` 가 아니라 `NEXT_PUBLIC_KAKAO_CLIENT_ID` 에 들어감 (네이밍 헷갈림 주의)
4. 좌측 **카카오 로그인** 메뉴 → **활성화 ON**
5. **Redirect URI** 추가:
   - `https://prismedu-kr-admission-joonhyeon-s-projects.vercel.app/api/auth/kakao/callback`
   - (도메인 구매 후) `https://conatusipsi.com/api/auth/kakao/callback`
   - 로컬 개발용: `http://localhost:9002/api/auth/kakao/callback`
6. **동의항목** 메뉴:
   - 카카오계정(이메일): **필수 동의**
   - 프로필 정보(닉네임): **필수 동의**
7. 좌측 **보안** 메뉴 → **Client Secret** 코드 발급 → 복사 → `KAKAO_CLIENT_SECRET` 에 사용

### Vercel env

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_KAKAO_CLIENT_ID` | (REST API 키) | Production + Preview |
| `KAKAO_CLIENT_SECRET` | (Client Secret 코드) | Production + Preview |

재배포 → `/api/health` 의 `env.kakao.set` = `true` 확인 → 로그인 페이지에서 카카오 버튼 활성화.

---

## 종합 검증 — 전부 등록 후

```bash
curl https://prismedu-kr-admission-joonhyeon-s-projects.vercel.app/api/health | jq
```

응답이 다음과 같으면 완료:
```json
{
  "ok": true,
  "env": {
    "firebase": { "complete": true },
    "anthropic": { "set": true },
    "kakao": { "set": true },
    "sentry": { "set": true },
    "toss": { "set": false },     // 7월 사업자등록 후
    "business": { "complete": false }
  },
  "services": { "firebase": { "ok": true } },
  "notes": {}                      // 모든 missing 안내 사라짐
}
```

토스 + 사업자정보는 **Tier 3 (~7월)** 항목이라 6/30 사이트 완성 마감 시점엔 미등록이 정상.

---

## 비용 합산 — 출시 전까지

| 항목 | 월 예상 (출시 전 staging 기준) |
|---|---|
| Vercel | $0 (Hobby plan 충분) |
| Firebase Spark | $0 (시즌 진입 시 Blaze 업그레이드 필요) |
| Anthropic | $0~5 (본인 시연 + 소수 베타 테스터) |
| Sentry | $0 (Free plan) |
| 카카오 | $0 (개발자 등록만) |
| **합계** | **$0~5/월** |

시즌 진입(7~11월) 후 trafic 폭증 시 Firebase Blaze + Anthropic 사용량이 핵심 비용 — `docs/operations.md` 의 시즌 운영 매뉴얼 참고.

---

## ⑤ SMTP 메일 발신 설정 (Resend) — 10분, 이메일 로그인 필수

**왜 필요**: Supabase 기본 메일러는 시간당 3~4통 제한 + 도메인 검증 없음 → 거의 스팸함 직행. SMTP 안 붙이면 이메일 가입자가 인증 메일을 못 받아 로그인 불가.

### Resend 가입

1. https://resend.com/signup — 무료 플랜 (월 3,000통 / 일 100통, 출시 직후 충분)
2. 가입 후 **Domains → Add Domain** → `conatusipsi.com` 입력
3. 화면에 노출되는 DNS 레코드 3개 복사 (`MX`, `TXT` SPF, `TXT` DKIM)

### 가비아 DNS 추가

My가비아 → 서비스 관리 → conatusipsi.com → DNS 설정. Resend가 안내한 값 그대로:

| 호스트 | 타입 | 값 |
|---|---|---|
| `send` | MX | `feedback-smtp.us-east-1.amazonses.com.` (우선순위 10) |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` |
| `resend._domainkey` | TXT | (Resend가 안내한 긴 키 그대로) |

> 호스트 입력 시 `.conatusipsi.com` 접미사가 자동 추가되는 가비아 UI 특성상 `send`만 입력하면 됨 (`send.conatusipsi.com`이 됨).

### 검증

1. Resend 대시보드 → Domains → **Verify** 버튼 (DNS 전파 10분~수시간 대기)
2. 상태가 **Verified** 가 되면 → **API Keys → Create API Key** → 권한 `Sending access` → 키 복사

### Supabase SMTP 등록

https://supabase.com/dashboard/project/[PROJECT_REF]/auth/templates → **SMTP Settings** 또는 Auth → Email:

| 항목 | 값 |
|---|---|
| Sender email | `no-reply@send.conatusipsi.com` (또는 `hello@conatusipsi.com`) |
| Sender name | `conatusipsi` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | (위 API Key 붙여넣기) |

**Enable Custom SMTP** 토글 ON → Save. 즉시 반영.

### 검증

회원가입 시도 → 인증 메일 도착 확인 → 링크 클릭 → 로그인.

---

## 문제 발생 시

- Vercel env 등록했는데 안 잡힘 → 재배포 필수 (env는 build-time 주입). 빈 commit push 또는 대시보드 Redeploy.
- `/api/health` 에서 `set: false` 인데 등록한 게 맞다 → 변수 이름 오타 가능성 (특히 `NEXT_PUBLIC_` 접두사 누락/추가).
- 키 노출 의심 → 즉시 폐기 → 재발급 → Vercel env 갱신. 노출된 키는 절대 재사용 금지.
- 이메일 인증 메일 안 옴 → ① SMTP 미설정(위 ⑤번 진행), ② 스팸함 확인, ③ Supabase rate limit (시간당 4통 — 같은 메일로 반복 가입 시 막힘).
