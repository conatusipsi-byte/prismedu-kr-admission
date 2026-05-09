# 정책 결정 기록 (Policy Decisions Log)

본 문서는 한국 대학 입시 서비스(conatusipsi.com)에 적용되는 **운영 정책 결정사항**을 기록한다.

코드·UI·운영 변경 시 본 문서의 정책과 충돌하지 않는지 반드시 확인. 정책 변경이 필요하면 본 문서를 먼저 갱신한 후 코드를 수정한다 (반대 순서 금지 — 코드만 바뀌고 정책 문서는 낡으면 인계 시 정합성 깨짐).

---

## 0. 사용 방법

### 0.1 결정 상태 분류

| 상태 | 의미 |
|---|---|
| **agreed-with-client** | 클라이언트(방준현) 와 합의된 정책. 변경 시 클라이언트 재합의 필요 |
| **dev-internal** | 개발 단계 자체 결정. 클라이언트 검수 후 격상 가능 |
| **deprecated** | 폐기된 정책. 이력 보존용. 신규 코드는 따르지 않음 |

### 0.2 신규 정책 추가 절차

1. 본 문서 끝에 다음 P 번호로 추가 (현재 마지막 번호 +1)
2. 결정사항·결정일·합의자·관련 코드/운영 문서 링크 명시
3. 코드 변경 PR 본문에 정책 번호 인용 (예: "P-007 정책 반영")
4. PR 머지 전 본 문서 갱신 PR 별도 제출 또는 같은 PR 에 포함

### 0.3 정책 변경·폐기 절차

1. 기존 정책에 `**변경 이력**` 섹션 추가 (날짜·변경사유·승인자)
2. 폐기 시 상태를 `deprecated` 로 변경, 본문은 보존, 폐기일·사유·후속 정책 번호 명시
3. 관련 코드의 인라인 주석에서 정책 번호 인용한 부분 함께 갱신

---

## 정책 결정 목록

### P-001: 표본 부족 학과 처리 정책

- **결정일**: 2026-05-XX
- **상태**: agreed-with-client
- **합의자**: 방준현 (클라이언트), 안홍준 (개발)
- **결정사항**: 옵션 B 채택
  - 정형 정보(모집요강·전형 일정 등)는 무료 공개
  - 합격률 분석은 "표본 부족으로 분석 불가" 메시지 노출
  - 락 적용하지 않음 (결제해도 분석 결과 안 나오므로 환불 분쟁 방지)
- **마케팅 포지셔닝**: "분석은 유료, 정보는 무료"
- **관련 코드**: `lib/admission/sample-gate.ts` (`isLockable` 함수)
- **관련 운영**: `docs/operations.md` §4

---

### P-002: AI 카운슬러 정직성 원칙

- **결정일**: 2026-05-XX
- **상태**: dev-internal (클라이언트 검수 후 격상 권장)
- **결정사항**: 임의 수치 추정 차단
  - 합격률·점수컷·등급컷 임의 추정 금지
  - 표본 부족 학과는 일반론적 조언만 제공
  - 외부 사이트(진학사·대학어디가) 추정값 인용 금지
- **다층 방어**:
  1. 시스템 프롬프트 가드 (`NUMERIC_ESTIMATION_GUARD`)
  2. 응답 후처리 sanitize (`sanitizeCounselorResponse`)
  3. 메트릭 기록 + Sentry warn
- **관련 코드**:
  - `lib/prompts/counselor-guards.ts`
  - `lib/admission/counselor-postprocess.ts`
  - `lib/admission/counselor-metric.ts`
- **관련 운영**: `docs/operations.md` §6

---

### P-003: 가/나/다군 중복지원 검증

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: API 트랜잭션 + 클라이언트 폼 이중 검증
  - 클라이언트 폼: 즉시 피드백
  - Firestore rules: 형태(structure) 검증만 (susi ≤ 6, jeongsi.{ga,na,da} 단일 슬롯)
  - API 라우트: 의미 검증 + 트랜잭션
- **에러 코드**: `AdmissionIntentError` 5종 (`susi_overflow` / `jeongsi_group_collision` / `duplicate_department` / `invalid_track_kind` / `cross_group_violation`)
- **관련 코드**:
  - `types/admission.ts` (`AdmissionIntent`, `AdmissionIntentError`)
  - `app/api/intent/validate/route.ts` (예정)
  - `firestore.rules` (`validIntent()`)

---

### P-004: 수능최저 자동판정 한계

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 단순 케이스만 자동 판정
  - **자동 판정 ✅**: `simple_sum` (합), `simple_avg` (평균)
  - **자동 판정 ❌**: `with_required` (포함 강제), `conditional` (계열별 차등), `custom` (자유 텍스트)
  - 자동 판정 불가 케이스는 모집요강 원문(`originalText`) 그대로 노출 + "수동 확인 필요" 배지
- **관련 코드**: `lib/admission/min-req-classifier.ts` (`classifyMinReq`, `evaluateMinReq`)
- **관련 운영**: `docs/operations.md` §6.4 (ETL 분류기 어휘 점검)

---

### P-005: 합격사례 표본 임계치

- **결정일**: 2026-05-XX
- **상태**: dev-internal (시즌 1회 운영 후 재검토 권장)
- **결정사항**:
  - `SAMPLE_THRESHOLD = 5` (일반 전형 — `acceptedCount` 기준)
  - `WEIGHTED_THRESHOLD = 3.0` (가중 표본 — confidence 합)
  - `STAGE1_PASS_THRESHOLD = 7` (학종 1단계 통과 표본)
  - `STAGE2_ACCEPTED_THRESHOLD = 5` (학종 최종 합격 표본)
- **재검토 트리거**: 시즌(7~11월) 종료 후, 표본 분포·자가보고 비율 분석으로 임계치 조정 검토
- **관련 코드**: `lib/admission/sample-gate.ts`

---

### P-006: 학종 합격 확률 표시 방식

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 1단계 × 2단계 분해 표시
  - `stage1Pass`: 서류 통과 확률 (1단계 컷 기준)
  - `stage2Pass`: 1단계 통과 가정 시 최종 합격 확률
  - `combined = stage1Pass × stage2Pass`: 최종 합격 확률
  - 양쪽 표본 모두 임계치 충족 시에만 노출. 한쪽만 부족해도 `sampleSufficient: false`
- **이유**: 학종 1단계 컷과 최종 컷은 분포가 다름. 단일 확률로 합치면 면접 영향 가림.
- **관련 코드**: `types/admission.ts` (`HakjongProbability`), `lib/admission/sample-gate.ts` (`checkHakjongSampleSufficiency`)

---

### P-007: trackPattern 어휘 자동 점검

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 사람 기억에 의존하던 수동 점검을 GitHub Actions cron 자동화로 대체
  - 매년 7/1·8/1·9/1 cron 실행
  - 신규 어휘 발견 시 PR draft 자동 생성 (자동 머지 X — 사람 검수 후 머지)
  - 노이즈 필터: `rawCount ≥ 3` → trusted, `1~2` → suspicious (별도 섹션 + 경고)
- **머지 게이트**: 7~9월 PR 모두 머지되어야 ETL 본 시즌 가동 조건
- **관련 코드**:
  - `scripts/update-track-vocab-fixtures.ts`
  - `scripts/etl/admissions-sync.ts`
  - `.github/workflows/track-vocab-check.yml`
- **관련 운영**: `docs/operations.md` §6.4

---

### P-008: Cloudflare/CDN 도입 시점

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 출시 직후엔 Vercel 자체 CDN 만 사용. 시즌 1개월 전(2026.06 말~07 초) 트래픽 baseline 측정 후 도입 여부 결정.
- **도입 트리거**:
  - Vercel Pro 1TB 한도 70% 초과 예상
  - 어뷰징·크롤링 의심 패턴 1건 이상 관측
  - 결제 페이지 봇 트래픽 1% 초과
- **기본 권장**: Vercel Pro + Cloudflare Free 조합
- **관련 운영**: `docs/setup.md` §5

---

### P-009: ~~broadcast 모집단위 합격선 정책~~ — **폐기**

- **결정일**: 2026-05-XX
- **상태**: deprecated
- **폐기 사유**: 클라이언트 답변에 따라 자유전공학부·광역모집을 일반 학과처럼 처리하기로 결정. broadcast별 합격선 분기 로직 불필요.
- **후속 조치**: `Department.unitType="broadcast"` + `subDepartments[]` 구조는 데이터 보유용으로만 사용. 합격선 산출은 일반 학과 알고리즘 동일 적용.

---

### P-010: 영어/한국사 등급별 환산 polarity (gradeMap)

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: `ReflectionRatio.{english,history}.gradeMap` 의 값은 **양수=가산점, 음수=감점** 으로 polarity 통일.
  - 예 (감점 모델): `english.gradeMap = { 1: 0, 2: -0.5, 3: -2.0, 4: -4.0, ... }`
  - 예 (가산 모델): `english.gradeMap = { 1: 100, 2: 95, 3: 90, ... }`
- **이유**: 학교마다 환산점수(가산) vs 감점 모델이 혼재. 단일 polarity 미통일 시 매칭 알고리즘이 학교별 분기 폭증.
- **ETL 책임**: 모집요강 텍스트의 "감점" 표현 발견 시 음수로 변환해 저장.
- **관련 코드**: `types/admission.ts` (`ReflectionRatio` 주석)
- **관련 검증**: `docs/schema-validation-report.md` §1.1 (서울대 정시), §1.4 (고려대 정시)

---

### P-011: 정시 + 학생부 정성평가 처리

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 서울대 정시처럼 학생부평가가 정시(`jeongsi_*`)에 들어가는 학교는 `AdmissionStage.components.schoolRecord` 자유롭게 사용 허용.
  - 별도 트랙 종류(`jeongsi_with_record_eval`) 신설하지 않음.
  - 정시=수능만 가정을 깨고, 단계 components 유연성으로 표현.
- **이유**: 별도 kind 신설 시 ETL·매칭 알고리즘 분기 폭증. 단일 kind 안 components 유연성으로 충분.
- **관련 코드**: `types/admission.ts` (`AdmissionStage.components`)
- **관련 검증**: `docs/schema-validation-report.md` §1.1 — 서울대 정시 교과평가

---

### P-012: 변환점수 ETL 2단계 운영

- **결정일**: 2026-05-XX
- **상태**: dev-internal
- **결정사항**: 모집요강 ETL은 2단계 운영.
  - **1차 (7~9월)**: 모집요강 기본 파싱. `AdmissionTrack.conversionTable.status = "preliminary"`, `table` 미존재.
  - **2차 (12월)**: 수능 후 대학 발표 변환표 갱신만 수행. `status = "finalized"`, `table` 채움.
- **이유**: 한국 정시는 모집요강 발표 시점에 변환표가 미정. "수능 성적 발표 후 입학처 홈페이지 공지" 패턴이 일반.
- **사용자 영향**: `status="preliminary"` 상태에서 변환점수 기반 매칭은 수행하지 않거나 "예비치" 표시. P-002 정직성 원칙과 일관.
- **관련 코드**:
  - `types/admission.ts` (`ConversionTable`)
  - `scripts/etl/admissions-sync.ts` (`--phase initial` / `--phase conversion`)
- **관련 운영**: `docs/operations.md` §1 (시즌 캘린더 12월 항목)

---

### P-013: 재외국민·외국인 전형 별도 라우트

- **결정일**: 2026-05-XX
- **상태**: dev-internal (클라이언트 검수 후 격상 권장)
- **결정사항**: 재외국민·외국인·12년 외국교육이수자 전형은 일반 한국 학생 입시 플로우와 분리.
  - `AdmissionTrackKind` 에 `"jaeoegukmin"` 추가.
  - 자격 요건(`JaeoegukminEligibility`)이 일반 입시와 완전히 다름 — 해외 거주 기간·외국 국적·외국 학교 졸업 학년 등.
  - UI 라우트도 분리 (`/admissions/jaeoegukmin/*` 등) — 자격 미충족자가 일반 매칭에서 노출되지 않도록.
- **사용자 영향**: 외국 고교 출신 한국대 진학을 원하는 학생은 별도 흐름. 기존 분석 폼은 한국 일반 학생 가정.
- **관련 코드**:
  - `types/admission.ts` (`AdmissionTrackKind`, `JaeoegukminEligibility`)
- **관련 검증**: `docs/schema-validation-report.md` §1 (외대 재외국민 특별전형)

---

## 향후 정책 추가 자리

신규 정책은 본 줄 위에 P-009, P-010, ... 으로 추가.

각 항목에 다음을 반드시 포함:
- 결정일 (`YYYY-MM-DD`, 미정이면 `YYYY-MM-XX`)
- 상태 (`agreed-with-client` / `dev-internal` / `deprecated`)
- 합의자 (agreed-with-client 일 때)
- 결정사항 (구체적이고 검증 가능한 형태)
- 관련 코드·운영 문서 링크
- 변경 이력 (정책이 변경됐다면 날짜·사유·승인자)

---

## 부록: 정책-코드 역추적

긴급 상황에서 "이 코드는 어느 정책에 묶여 있는가?" 빠르게 찾기:

| 코드/문서 위치 | 묶인 정책 |
|---|---|
| `lib/admission/sample-gate.ts` | P-001, P-005, P-006 |
| `lib/prompts/counselor-guards.ts` | P-002 |
| `lib/admission/counselor-postprocess.ts` | P-002 |
| `lib/admission/counselor-metric.ts` | P-002 |
| `lib/admission/min-req-classifier.ts` | P-004, P-007 |
| `types/admission.ts` (`AdmissionIntent*`) | P-003 |
| `types/admission.ts` (`HakjongProbability`) | P-006 |
| `firestore.rules` (`validIntent()`) | P-003 |
| `scripts/update-track-vocab-fixtures.ts` | P-007 |
| `scripts/etl/admissions-sync.ts` | P-007 |
| `.github/workflows/track-vocab-check.yml` | P-007 |
| `docs/operations.md` §4 | P-001 |
| `docs/operations.md` §6 | P-002 |
| `docs/operations.md` §6.4 | P-004, P-007 |
| `docs/operations.md` §1 (12월 변환표) | P-012 |
| `docs/operations.md` §11 (PDF 인코딩) | P-012 (간접) |
| `docs/setup.md` §5 | P-008 |
| `types/admission.ts` (`ReflectionRatio` polarity) | P-010 |
| `types/admission.ts` (`AdmissionStage.components.schoolRecord` in jeongsi) | P-011 |
| `types/admission.ts` (`ConversionTable`) | P-012 |
| `types/admission.ts` (`AdmissionTrackKind: "jaeoegukmin"`, `JaeoegukminEligibility`) | P-013 |
| `scripts/etl/admissions-sync.ts` (--phase) | P-012 |
