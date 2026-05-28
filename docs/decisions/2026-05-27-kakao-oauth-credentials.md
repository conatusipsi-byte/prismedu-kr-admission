# Kakao OAuth credentials 동기화 사고 (2026-05-27)

## 배경
카카오 로그인 시 KOE010 "Bad client credentials" 에러가 9 round에 걸쳐 재현됨.

## 원인
Supabase Auth에 등록된 `external_kakao_secret` 값에 수동 입력 시 발생한
i(대문자 I) / l(소문자 L) 시각적 혼동 오타 2곳:
- 5번째 글자: `l` (소문자) → 정확히는 `I` (대문자)
- 19번째 글자: `I` (대문자) → 정확히는 `l` (소문자)

REST API 키(client_id)는 일치했으나 secret만 어긋나 KOE010 발생.

## 해결
Supabase Management API `PATCH /v1/projects/{ref}/config/auth` 로
`external_kakao_secret` 동기화. 카카오 token 엔드포인트 직접 호출로
검증 — KOE010이 KOE320 (invalid code)로 바뀜 = credentials 통과.

## 회귀 방지
- OAuth credentials 수동 입력 금지. 카카오 디벨로퍼스 콘솔에서
  복사-붙여넣기 또는 DOM에서 직접 추출.
- Sans-serif 폰트에서 `Il` / `lI` / `1` 구분이 어려우므로,
  의심 시 monospace 폰트로 한 글자씩 검수.
- 값 변경 후 즉시 `https://kauth.kakao.com/oauth/token` 으로
  code=test 호출해 KOE010 부재 확인.
- Secret 값 자체는 git에 커밋하지 않음 — Supabase Management API에만 저장.

## 관련 커밋
- 686abfc fix(auth): handle Supabase OAuth fragment errors via client fallback
- 7b6f62a fix(auth): surface OAuth provider errors instead of misleading "expired link"
- 147c562 fix(auth): expand Kakao OAuth scopes for biz app conversion
- 5186873 feat(auth): activate Kakao OAuth login
