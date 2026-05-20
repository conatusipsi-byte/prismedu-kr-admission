# Setup 가이드

> 새 환경에서 Conatus 를 띄울 때 필요한 외부 서비스 가입·환경변수 등록 절차.
> Supabase / Anthropic / 토스 / Sentry 등 핵심 항목은 `docs/handoff-2026-05-17.md`
> §8·§9 참조. 본 문서는 그 외 ETL·시즌 데이터 적재에 필요한 항목을 추가한다.

## §2.5 KCUE / 대학알리미 OpenAPI

학과·대학 마스터 데이터를 한국대학교육협의회(KCUE) 의 공시 OpenAPI
(`academyinfo.go.kr`) 에서 시드한다. 5종 dataset 을 사용하며 키 발급은
공공데이터포털(data.go.kr)에서 회원가입 후 무료 신청.

### 발급

1. <https://www.data.go.kr> 회원가입.
2. 다음 5개 데이터셋에서 **운영API 활용신청** (개발 키는 1,000 호출/일 한도):

   | dataset                              | 페이지 ID  |
   | ------------------------------------ | ---------- |
   | 한국대학교육협의회_대학알리미 대학 기본 정보 | `15037507` |
   | 한국대학교육협의회_대학 학과 정보 / 학과정보  | `15106836` |
   | 한국대학교육협의회 대학정보공시 학생 현황    | `15037346` |
   | 한국대학교육협의회_대학알리미 재정 현황      | `15038392` |
   | 한국대학교육협의회_대학알리미 교원·연구 현황 | `15037505` |

3. 승인 후 발급되는 **인증키(Encoding key)** 64-hex 문자열을 보관.
   - 같은 사용자에게는 5개 dataset 모두 **동일한 키**가 발급된다.
   - 그러나 키가 어떤 op 들에 접근 가능한지는 dataset 단위로 다르다 — 일부 op 는
     `SERVICE ACCESS DENIED ERROR` 가 반환될 수 있다.

### 환경변수

`.env.local` 에 추가. 공통 키 1개로 전체 service 를 호출하는 시나리오 권장:

```bash
# 공통 키 — 5개 service 모두 같은 키로 호출 가능
# data.go.kr 마이페이지에서 발급받은 64-hex 인증키 입력 (커밋 금지).
KCUE_API_KEY=

# (선택) service 별 다른 키를 쓰는 경우 — 위 KCUE_API_KEY 보다 우선 적용
# KCUE_API_KEY_BASIC_INFO=
# KCUE_API_KEY_DEPARTMENTS=
# KCUE_API_KEY_STUDENT_STATUS=
# KCUE_API_KEY_FINANCE=
# KCUE_API_KEY_FACULTY=
```

### HTTPS / HTTP 주의

`openapi.academyinfo.go.kr` 의 HTTPS 엔드포인트는 SNI 단계에서 키 검증을
거부한다 (2026-05 기준). **클라이언트는 HTTP 로만 호출**해야 한다 —
`lib/etl/kcue-client.ts` 의 `BASE_URL` 이 그렇게 고정되어 있다.

서비스키가 URL 에 노출되는 형태가 표준이지만, 본 키는 read-only 공시 자료
접근용이라 노출 위험이 낮다. 키가 유출되면 data.go.kr 마이페이지에서 재발급.

### 첫 시드 실행

```bash
# Phase 1 — universities (schlId 1..1000 iterate, ~1000 호출)
npx tsx scripts/etl/sync-kcue-baseline.ts --phase=universities --limit=1000

# Phase 2 — departments (학교별 SchoolMajorInfo, 평균 2 페이지/학교)
npx tsx scripts/etl/sync-kcue-baseline.ts --phase=departments --year=2025

# 둘 다
npx tsx scripts/etl/sync-kcue-baseline.ts --phase=all --limit=1000 --year=2023

# dry-run (DB 적재 안 함 — 호출 + 정규화만)
npx tsx scripts/etl/sync-kcue-baseline.ts --phase=universities --limit=10 --dry-run
```

진행률은 stdout 으로 25 대학마다 출력. `DEBUG_KCUE=1` 환경변수를 주면 모든
HTTP 호출 로그가 보인다.

### 멱등성 + 갱신

- universities: `kcue_code` 가 unique. 같은 schlId 두 번 적재해도 update.
- departments: `(university_id, kedi_mjr_id)` 가 unique. 같은 학과 두 번도 안전.
- 학과상태 `폐과` 인 학과는 `active=false` 로 저장 — 데이터 보존하되 검색 제외.

### 호출량 한도

운영 키 일일 한도 **10,000 호출** (개발 키 1,000). 베이스라인 시드는 학교 수
× 4 정도 호출이 발생 (1대학당 학생 1 + 재정 1 + 교원 1 + 학과 평균 2 페이지).
1,000개 대학을 한 번에 돌리면 4,000~6,000 호출 → 첫 실행 후 충분한 여유.

`KcueRateLimitExceededError` 가 발생하면 sync 가 중단된다. 다음 날 다시 실행
하면 멱등 upsert 가 이어서 처리한다.

## §2.6 수능 통계 CSV (KICE)

⚠️  현재 스캐폴드만 — 실 CSV 포맷·디렉토리 위치는 클라이언트 응답 대기.
`scripts/etl/parsers/csat-stats-csv.ts` 안 TODO 참조.
