# Firestore 스키마 — 한국 대학 입시 서비스

본 문서는 `types/admission.ts` 의 TypeScript 타입과 `firestore.rules` 보안 규칙을 보완하는 운영 가이드입니다. 한국 입시 도메인 지식이 없는 개발자도 각 컬렉션의 의미를 이해할 수 있도록 작성합니다.

---

## 1. ER 관계 (텍스트 다이어그램)

```
┌──────────────────┐
│  universities    │  대학 (e.g., "서울대학교")
│  /{universityId} │  category, campuses[], rankOrder
└────────┬─────────┘
         │ 1:N
         ▼
┌──────────────────┐
│   departments    │  학과 = 모집단위 (e.g., "컴퓨터공학과")
│   /{departmentId}│  track, totalQuota, unitType
└────────┬─────────┘
         │ 1:N (연도별)
         ▼
┌──────────────────┐
│   admissions     │  연도별 모집요강 (학년도 단위)
│   /{year}        │  tracks: { susi_*, jeongsi_*, additional }
└──────────────────┘    └─→ AdmissionTrack[]
                              ├─ stages (단계별 평가)
                              ├─ csatMinimum (수능최저)
                              ├─ reflectionRatio (영역 반영비)
                              └─ schedule, notes

┌──────────────────┐
│      users       │  사용자
│      /{uid}      │  (Firebase Auth uid)
└────────┬─────────┘
         │
         ├─ specs/{specId}           ← 학년별 학업 스펙 스냅샷
         │   ├─ schoolRecord (내신)
         │   ├─ csat / mockExams (수능·모의)
         │   ├─ schoolActivity (생기부 비교과)
         │   └─ intent → AdmissionSlot[] → universityId+departmentId+trackKind
         │
         ├─ entitlements/{eid}       ← 결제 권한 (서버만 write)
         └─ usage/{usageId}          ← 사용량 카운터

┌─────────────────────┐
│ admissionResults    │  익명 합격 사례 (root collection)
│ /{resultId}         │  → universityId+departmentId+year+trackKind
└─────────────────────┘  코사인 유사도 매칭의 근거 데이터

┌──────────────────┐
│      orders      │  결제 주문 (root collection)
│   /{orderId}     │  uid 외래키, 토스 paymentKey 보유 (rules로 클라 read 차단)
└──────────────────┘
```

---

## 2. 컬렉션 상세

### 2.1 `universities/{universityId}`

대학 마스터 데이터. 인서울/지방 분류, 캠퍼스 정보, 정렬 우선순위 등을 보관.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `string` | = 도큐먼트 ID. 영문 슬러그 (e.g., `"snu"`) |
| `n` | `string` | 한글 정식명 (e.g., `"서울대학교"`). prismedu.kr `School.n` 슬롯 호환 |
| `category` | `UniversityCategory` | `seoul_top` / `seoul` / `national_flag` / `national_local` / `private_local` / `special` |
| `campuses` | `Campus[]` | 본교/분교. 같은 대학 다른 캠퍼스는 입결 다름 (e.g., 연세대 신촌·미래) |
| `rankOrder` | `number?` | 검색 정렬 우선순위. 실제 랭킹이 아닌 **큐레이션 값** |
| `active` | `boolean` | 폐교/통합 시 false. 데이터는 보존하되 매칭에서 제외 |

**핵심**: 한국에는 미국 대학 같은 합의된 종합 랭킹(US News·QS)이 없다. `rankOrder`는 정렬 편의용 큐레이션 값일 뿐, 사용자에게 "랭킹"으로 노출하면 안 된다.

---

### 2.2 `universities/{uid}/departments/{departmentId}`

**학과(=모집단위)**. 한국 입시는 학과 단위로 모집·평가하므로 1차 키. 같은 대학이라도 학과별로 합격선·일정·전형이 모두 다르다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `unitType` | `AdmissionUnitType` | `department` (학과) / `division` (학부) / `broadcast` (광역·계열모집) |
| `track` | `Track` | 인문/사회/자연/공학/의약/예체능/자유전공 — 수능 탐구 영역과 매칭 |
| `totalQuota` | `number` | 연간 총 모집인원 (모든 전형 합) |
| `subDepartments` | `string[]?` | 광역모집의 경우 1년 후 선택 가능한 세부 학과 슬러그 |
| `isProfessional` | `boolean?` | 의/치/한/약/수의/사범/약학 — 합격 추정 모델을 일반학과와 분리해야 함 |

**왜 학과 단위인가**: 같은 서울대라도 의예·경영·인문은 합격선이 100점 이상 차이난다. "서울대 합격 가능성"이라는 질문 자체가 무의미하고, 항상 학과 단위로 답해야 한다.

---

### 2.3 `universities/{uid}/departments/{did}/admissions/{year}`

연도별 모집요강. **`year` 는 학년도**(=입학연도) 기준이다. 즉 `2027` 도큐먼트 = 2026.11 수능 → 2027.3 입학.

```
admissions/2027 {
  tracks: {
    susi_subject:        [AdmissionTrack],   // 학생부교과 (수시)
    susi_comprehensive:  [AdmissionTrack],   // 학생부종합 (수시)
    susi_essay:          [AdmissionTrack?],  // 논술 (수시)
    susi_practical:      [AdmissionTrack?],  // 실기 (수시)
    jeongsi_ga:          [AdmissionTrack?],  // 정시 가군
    jeongsi_na:          [AdmissionTrack?],  // 정시 나군
    jeongsi_da:          [AdmissionTrack?],  // 정시 다군
    additional:          [AdmissionTrack?],  // 추가모집
  },
  availableTrackKinds: ["susi_subject", "susi_comprehensive", "jeongsi_na", ...]
  prevYearResult: { competitionRate, cutoff70, gradeCutoffAvg, ... }
  source: { url, parsedAt, parserVersion }
}
```

**한 kind에 배열인 이유**: 같은 학종 안에 일반전형·지역균형·기회균형 등 복수 트랙이 운영되기 때문. 각 트랙은 정원·수능최저·평가 비중이 모두 다름.

**`availableTrackKinds`**: Firestore는 동적 키 인덱스를 지원하지 않으므로 array-contains 검색용 보조 필드. (e.g., "논술 있는 학과만 보기")

#### AdmissionTrack 핵심 필드

- `quotaInitial` / `quotaFinal`: 모집요강 발표 시점 인원 vs 수시 미충원 이월 후 최종 인원. **수시→정시 이월**이 1월 하순 발생하므로, 정시 합격 산정 시 `quotaFinal`이 갱신되어야 정확.
- `csatMinimum`: 수능최저학력기준 (수시 only). 예: "국·수·영·탐 중 2개 합 5등급, 한국사 4등급". 정시는 수능 점수 자체로 산정하므로 없음.
- `reflectionRatio`: 영역별 반영비 (정시·논술·교과). 합 = 100. 영역마다 점수 종류(표준/백분위/변환표준)가 다른 대학이 있어 영역별 `scoreType` 보유.
- `stages`: 단계별 평가. 학종은 보통 2단계(서류 100% → 서류+면접). 학종 1단계 컷과 최종 컷은 다르므로 `prevYearResult.stage1Cutoff` 별도 보유.

---

### 2.4 `users/{uid}/specs/{specId}`

사용자가 입력한 학업 스펙의 **시점별 스냅샷**. 학년·학기마다 새 도큐먼트를 만들어 추이 추적. 매칭에는 최신 1개만 사용.

| 영역 | 필드 | 핵심 |
|---|---|---|
| 내신 | `schoolRecord` | 학년·학기별 등급 (1.00~9.00, 낮을수록 우수). 진로선택은 절대평가(A/B/C)이므로 분리 저장. 대학마다 환산식이 달라 raw 분포(`absoluteDistribution`)도 보관. |
| 수능 | `csat` | 영역별 표준점수·백분위·등급 모두 저장 (대학별 반영점수 다름). 영어·한국사는 절대평가 → 등급만. 탐구는 보통 2과목, 과목별 보관. |
| 모의 | `mockExams` | 학평(시도교육청)/모평(평가원)/사설 시계열 |
| 비교과 | `schoolActivity` | 자율·동아리·봉사·진로·세특·행특·수상·독서. 자소서 폐지(24학번~)로 정량 시그널 비중 ↑ |
| 의향 | `intent` | 수시 6장 + 정시 가/나/다 각 1장. 가/나/다군 중복지원 제한이 구조에 반영됨 |
| 출신학교 | `schoolType` | 일반고/자사고/특목고/특성화고 — 학종에서 의미 있음 |

**가/나/다군 중복지원 제한**:
- 한 대학이 가·나·다군에 학과를 분산 둘 수 있다 (e.g., 연세대 컴공=나군, 경영=가군).
- 사용자는 같은 군 내 두 대학 동시 지원 불가.
- 이를 강제하기 위해 `jeongsi.ga / na / da` 를 **단일 슬롯(optional)** 으로 모델링.
- 단, 클라이언트만으로 부족 — `intent` write 시 서버에서 군별 단일 슬롯 검증.

---

### 2.5 `admissionResults/{resultId}`

익명 합격 사례. 코사인 유사도로 비슷한 케이스를 찾아 합격선·합격 가능성 추정.

| 필드 | 설명 |
|---|---|
| `outcome` | `accepted` / `waitlist` / `rejected` |
| `specSnapshot` | 합격자 익명 스펙 (내신 평균·수능 표준점수·비교과 점수·출신학교 유형) |
| `featureVector` | 코사인 유사도용 정규화 벡터. **Firestore 인덱스 불가** → 메모리 캐싱 또는 Vertex Vector Search |
| `confidence` | 신뢰도 가중치. self_report=0.5, official=1.0, media=0.7 |
| `verified` | true 만 클라이언트 read 허용 (rules) |

**자가보고 데이터의 함정**: 한 명의 자가보고로 그 학과 합격선이 왜곡될 수 있음 → 매칭 알고리즘에서 표본 적은 학과는 분산 큰 prior(베이지안)로 보수적 추정 권장.

---

### 2.6 `orders/{orderId}` & `users/{uid}/entitlements/{eid}`

#### orders (결제 주문)
- `id` = 토스 호출 orderId.
- `productKind`: `report_one` / `season_pass` / `consult_one` / `subscription_pro` / `subscription_elite` (구독 호환).
- `period`: `once` / `monthly` / `yearly`.
- `payment.paymentKey`: **서버 전용**. rules로 클라 read 차단. (필요시 `orders_public/{orderId}` 뷰 컬렉션 분리 패턴 검토)
- `validFrom` / `validUntil`: 시즌권 효력 기간.

#### entitlements (사용자 권한 단일 뷰)
- `active[]`: 보유 중인 권한 목록 (단건/구독 통합).
- `currentPlan`: `free` / `pro` / `elite` — 구독 호환.
- `planSource`: `free` / `one_time` (단건 누적) / `subscription`.

**왜 분리하는가**: 단건결제 누적이라도 사용자 권한 조회는 한 곳에서 끝나야 한다(`getEntitlements(uid)`). 추후 구독으로 전환해도 같은 인터페이스가 유효.

---

## 3. 인덱싱 전략 (시즌 7~11월 트래픽 대응)

### 3.1 Firestore 복합 인덱스

```
universities:
  (category ASC, rankOrder ASC)        -- 분류별 정렬
  (region ASC, category ASC)           -- 지역+분류 필터

departments (collectionGroup):
  (universityId ASC, track ASC)        -- 대학 내 학과 검색
  (track ASC, isProfessional ASC)      -- 의약·사범 등 별도 모델 분기

admissions (collectionGroup):
  (year DESC, availableTrackKinds array-contains)
                                       -- "올해 학종 있는 학과"
  (universityId ASC, year DESC)        -- 특정 대학의 연도별 모집요강

admissionResults:
  (universityId ASC, departmentId ASC, year DESC)
                                       -- 학과별 최근 합격선
  (verified ASC, confidence DESC)      -- 검증된 고신뢰 데이터 우선

orders:
  (uid ASC, status ASC, createdAt DESC)
                                       -- 본인 주문 이력
```

### 3.2 캐싱

- 대학·학과 마스터는 **빌드 타임 prebuild** (Next.js ISR / 정적 JSON CDN).
  - `prismedu.kr`의 `data/schools.json` + `schools-index.json` 패턴 그대로 재사용.
  - 클라이언트는 인덱스 JSON만 로드, 단일 학과 상세는 `/api/universities/{uid}/{did}` 호출.
- **AI 매칭 캐시**: `lib/match-cache.ts` 그대로 활용. 같은 specs 해시 → 1시간 이내 결과 재사용.
- **AI 응답 캐시**: `lib/ai-cache.ts` 그대로. 시즌엔 채팅 RAG 컨텍스트 캐시 적중률 ↑.

### 3.3 핫 데이터 분리

- `prevYearResult`는 매년 1회 갱신 → 도큐먼트 사이즈 안정.
- `quotaFinal`은 1월 하순 일괄 업데이트 → ETL 배치.
- `competitionRate` 시계열은 별도 `admissions/{year}/competition/{date}` 서브컬렉션 검토 (시즌 일일 갱신).

### 3.4 Vector Search

`admissionResults.featureVector` 코사인 유사도 검색은 Firestore에서 불가. 다음 중 하나:
- 학과당 표본 수가 적으면(< 1만): 함수 메모리에 인덱스 로드 후 brute-force.
- 표본 많으면: Vertex Vector Search 또는 Algolia/Pinecone 외부 인덱스.

---

## 4. 보안 규칙 요약 (`firestore.rules`)

| 컬렉션 | read | write |
|---|---|---|
| `universities/**` | 누구나 | 운영자(`admins`) |
| `admissionResults` | `verified=true` | 자가보고만 create (verified=false 강제), 운영자만 update |
| `users/{uid}` | 본인+운영자 | 본인 (단, plan/entitlement 필드 변경 차단) |
| `users/{uid}/specs` | 본인 | 본인 |
| `users/{uid}/entitlements` | 본인 | **불가** (Admin SDK only) |
| `orders` | 본인 (`uid` 일치) | **불가** (Admin SDK only) |
| `admins` | 운영자 | 콘솔에서만 |

**핵심 원칙**:
- 결제 관련 모든 write는 Admin SDK 트랜잭션 경유.
- `paymentKey`는 클라이언트가 절대 못 읽도록 rules + 필요 시 분리 컬렉션.
- 사용자가 자기 도큐먼트의 `plan` 필드를 직접 바꿀 수 없도록 `affectedKeys`로 차단.

---

## 5. prismedu.kr 호환성

매칭 알고리즘(`src/lib/matching.ts`)을 재사용하기 위한 어댑터:

```ts
// src/lib/admissions/adapter.ts (신규)
import type { LegacySchoolShape, University, Department, AdmissionTrack, PrevYearResult } from "@/types/admission";

export function toLegacyShape(
  univ: University,
  dept: Department,
  track: AdmissionTrack,
  prev?: PrevYearResult,
): LegacySchoolShape {
  return {
    n: `${univ.n} ${dept.name}`,
    rk: univ.rankOrder ?? 9999,
    r: prev?.competitionRate ? Math.round(100 / prev.competitionRate) : 0,
    sat: [prev?.cutoff70 ?? 0, prev?.cutoff50 ?? 0],
    // 한국 등급(1=최우수)은 US gpa(4.0=최우수)와 polarity 반대 → 역수 매핑
    gpa: prev?.gradeCutoffAvg ? 5 - Math.min(prev.gradeCutoffAvg, 5) : 0,
    c: univ.shortName ?? univ.id,
    d: univ.d ?? "",
    loc: univ.campuses[0]?.region,
    setting: dept.track,
    closed: !univ.active,
  };
}
```

**계수 재보정 필요**: `lib/matching.ts` 의 `ACADEMIC` 상수(GPA_DIFF_WEIGHT=20 등)는 4.0 GPA·1600 SAT 기준이므로 한국 등급(1~9) 기준으로 재보정 필요. 마이그레이션 노트 참조.

---

## 6. 결정사항 반영 (2026-05)

검토 포인트 5가지에 대한 결정과 스키마/코드 위치.

### 6.1 가/나/다군 중복지원 검증 — API 트랜잭션 + 클라 폼 이중

| 레이어 | 책임 | 파일 |
|---|---|---|
| 클라이언트 폼 | 즉시 피드백 (UX) | `components/analysis/AnalysisFormWizard` |
| Firestore rules | 형태(structure) 검증만 — `intent.susi.size() <= 6`, jeongsi.{ga,na,da} map 형태 | `firestore.rules` `validIntent()` |
| API 라우트 | 의미 검증 — 같은 군 충돌, 학과 중복 등록, 트랜잭션 | `app/api/intent/validate/route.ts` (신규) |

**왜 rules에 의미 검증을 안 두는가**: Firestore rules는 다른 컬렉션 lookup이 비싸고 (모든 쿼리당 비용), 리스트 iteration이 제한적. API 라우트에서 zod 스키마 + 트랜잭션이 더 정확하고 테스트 가능.

에러 코드는 `AdmissionIntentError` 유니온 (5종): `susi_overflow`, `jeongsi_group_collision`, `duplicate_department`, `invalid_track_kind`, `cross_group_violation`.

### 6.2 수시→정시 이월 — 자동 ETL + 1월 수동 confirm

| 단계 | 시점 | 동작 |
|---|---|---|
| 자동 ETL | 1월 하순 (대학 발표 직후) | 모집요강 PDF 재파싱 → `quotaFinal` 계산 → **staging 컬렉션**에 저장 |
| 수동 confirm | 운영자 검수 | `admissionsStaging/{year}` → `admissions/{year}` 승격 |
| 자동 적용 | 승격 직후 | match-cache 무효화, 정시 합격 추정 즉시 갱신 |

**스키마 영향**: `admissionsStaging` 컬렉션 추가 (rules는 `admissions`와 동일하게 운영자만 write, read는 운영자만). 사용자 노출은 승격 후의 `admissions/{year}`만.

`PrevYearResult.notes` 또는 별도 `quotaChange` 필드에 이월 사유·증감 기록 검토.

### 6.3 수능최저 — 단순 케이스만 자동 판정

| Complexity | 자동 판정 | UI 동작 |
|---|---|---|
| `simple_sum` | ✅ | 충족/미충족 배지 + 사용된 영역 표시 |
| `simple_avg` | ✅ | 충족/미충족 배지 |
| `with_required` | ❌ | `originalText` 그대로 + "수동 확인 필요" 배지 |
| `conditional` | ❌ | `originalText` + 계열별 분기 안내 |
| `custom` | ❌ | `originalText` + 자유 메모 |

분류 함수 `classifyMinReq()` / `evaluateMinReq()` / `minReqDisplayText()`는 `lib/admission/min-req-classifier.ts`. ETL이 모집요강 파싱 직후 `finalizeMinReq()`로 `complexity`·`autoEvaluable` 채움. `CsatMinimum.originalText`는 항상 보관 (자동 판정되더라도 UI 검증용).

### 6.4 표본 부족 학과 비공개 — N < 5

| 임계치 | 값 | 적용 대상 |
|---|---|---|
| `SAMPLE_THRESHOLD` | 5 | `acceptedCount` 기준 (모든 전형) |
| `WEIGHTED_THRESHOLD` | 3.0 | `weightedCount` 기준 (자가보고만이면 차단) |
| `STAGE1_PASS_THRESHOLD` | 7 | 학종 1단계 통과 표본 |
| `STAGE2_ACCEPTED_THRESHOLD` | 5 | 학종 1단계 통과 후 합격 표본 |

판정 결과 `AdmissionProbability.category = "insufficient_sample"`, `probability = null`. UI는 `gateMessage()`로 사유 노출 (`no_data` / `below_threshold` / `weighted_below` / `no_accepted`).

집계는 별도 컬렉션 `admissionSampleStats/{universityId}_{departmentId}_{year}_{trackKind}` — `admissionResults` write trigger(Cloud Function)에서 갱신. 매번 컬렉션 카운트 회피.

### 6.5 학종 합격 확률 분해 — 1단계 × 2단계

| 필드 | 의미 |
|---|---|
| `stage1Pass` | 서류 통과 확률 (1단계 컷 기준) |
| `stage2Pass` | 1단계 통과 가정 시 최종 합격 확률 |
| `combined` | `stage1Pass × stage2Pass` (최종 합격) |
| `combinedLow/High` | 신뢰구간 (UI 폭) |
| `sampleSufficient` | 양쪽 표본 모두 충족 시 true |

**ETL 추가 추출 항목** (`PrevYearResult`):
- `stage1ApplicantCount`, `stage1PassCount`: 1단계 통과율 baseline
- `stage2PassRate`: 면접 통과율 baseline

**`AdmissionResult.passedStage1`**: outcome=rejected라도 1단계 통과한 표본은 분포 학습에 사용. ETL이 자가보고에서 1단계 합격여부 별도 입력 받아야 함 (폼 추가).

`HakjongProbability`는 학종(`susi_comprehensive`) 전형에서만 채워짐. 다른 전형은 `AdmissionProbability.hakjong` 미존재.

---

## 7. 결정으로 인한 부가 영향

### 7.1 신규 컬렉션 / 필드

| 항목 | 위치 | 사유 |
|---|---|---|
| `admissionSampleStats` | root collection | 표본 카운트 매번 집계 회피 (결정 6.4) |
| `admissionsStaging` | root collection | 이월 검수 워크플로 (결정 6.2) |
| `CsatMinimum.{complexity, autoEvaluable, originalText}` | `admissions.tracks[*].csatMinimum` | 분류 결과 + 원문 보존 (결정 6.3) |
| `PrevYearResult.{stage1ApplicantCount, stage1PassCount, stage2PassRate}` | 학종 분해용 (결정 6.5) |
| `AdmissionResult.passedStage1` | 학종 1단계 통과 표본 학습용 (결정 6.5) |
| `AdmissionSampleStats.{stage1PassedCount, stage2AcceptedCount}` | 학종 분해 임계치 판정 |

### 7.2 다른 모듈에 가는 영향

1. **매칭 알고리즘 (`lib/matching-kr.ts`)**: 결과 타입을 `AdmissionProbability`로 래핑. `category` 에 `"insufficient_sample"` 분기 추가. `prismedu.kr` `LegacySchoolShape` 어댑터의 `cat` 필드는 폐기 또는 호환 매핑 (`insufficient_sample` 시 `cat=undefined`).

2. **/api/match 라우트**: Free preview 20개 선정 시 `insufficient_sample` 학과는 어떻게 처리할지 결정 필요. **권장**: 별도 섹션("표본 부족" 카드)으로 노출하되 free preview 카운트에서 제외. 이미 결정됐다면 본 표 갱신.

3. **클라이언트 분석 페이지**: 결과 카드 3종 분기 — 정상 확률 / 학종 분해 / 표본 부족. 컴포넌트 `AnalysisResultCard`를 discriminated union으로.

4. **Cloud Function trigger**: `admissionResults` onWrite → `admissionSampleStats` 업데이트. Firestore 비용·콜드 스타트 고려해 batch 처리 (5분 누적 후 일괄 갱신) 옵션 검토.

5. **모집요강 ETL 파이프라인**: 출력 단계에 `finalizeMinReq()` 호출 강제. ETL 테스트 케이스에 `with_required`·`conditional` 샘플 포함하여 `autoEvaluable=false`가 정확히 분류되는지 회귀 검증.

6. **학종 자가보고 폼**: 합격여부뿐 아니라 1단계 통과여부(`passedStage1`) 입력 필드 추가. 미통과면 outcome=rejected와 함께 `passedStage1=false`. 1단계 통과 후 면접 미선택은 `passedStage1=true, outcome=rejected`.

7. **`AdmissionIntent` 검증 API**: `/api/intent/validate` 신규. zod 스키마 + 의미 검증 + Firestore 트랜잭션. 검증 실패 시 `AdmissionIntentError[]` 반환 → 클라 폼이 필드별로 매핑해 표시.

8. **사용자 권한 (`UserEntitlement`)**: 표본 부족 학과는 무료 사용자에게도 노출 (정형 정보만). free preview 컷 로직(`/api/match`)에서 `insufficient_sample` 카드는 락 대상 제외.

9. **SEO·sitemap**: 표본 부족 학과도 페이지 자체는 인덱싱 가능 (모집요강·일정 정형 데이터는 공개). `sitemap.ts` 생성 시 `acceptedCount` 조건 X, `active` 조건만.

10. **AI 카운슬러 채팅 컨텍스트**: 학과 컨텍스트를 시스템 프롬프트에 주입할 때 `insufficient_sample` 학과는 "합격 확률 표시 불가" 문구를 함께 주입해 LLM이 임의 추정하지 않도록 가드.

### 7.3 운영 워크플로 변화

- **이월 검수**: 1월 마지막 주 운영 인력 1명이 `admissionsStaging` → `admissions` 승격 작업. 평균 200개 학과 × 5분 = 약 17시간. ETL diff 뷰(추가/수정만 표시)로 단축 권장.
- **자가보고 검증**: `passedStage1` 필드 추가로 검증 항목 1개 늘어남. 학생부 첨부 등 증빙 정책 검토.
- **표본 누적 모니터링**: 시즌 중 학과별 `acceptedCount` 추이 대시보드 신규. 임계 도달 직후 합격 확률 노출이 시작되므로, 사용자에게 "최근 표본 충족" 알림 발송 검토.
