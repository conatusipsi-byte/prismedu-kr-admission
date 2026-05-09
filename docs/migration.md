# 마이그레이션 노트 — prismedu.kr (US 입시) → 한국 입시

본 문서는 운영 중인 `prismedu.kr` (한국 국제학교 학생 대상 미국 대학 입시) 코드 자산을 한국 대학 입시 서비스로 이식할 때의 데이터 변환·코드 재사용 가이드입니다. 분류표는 별도(이전 답변), 본 문서는 **데이터 모델·함수 시그니처 매핑**에 집중합니다.

---

## 1. 인터페이스 매핑

### 1.1 `School` (US) → `University + Department` (KR)

prismedu.kr 의 `School` 인터페이스(`src/lib/matching.ts`)는 대학 1개 = 1 도큐먼트였지만, 한국 입시는 학과 단위 모집이므로 2단계로 분리.

| `School` (US) | KR 대응 | 비고 |
|---|---|---|
| `n` (이름) | `University.n + " " + Department.name` | 매칭 결과 표시는 합쳐서 |
| `rk` (US News rank) | `University.rankOrder` | **의미 변경**: 큐레이션 정렬값. UI에 "랭킹"으로 노출 금지 |
| `r` (admission rate %) | `1 / PrevYearResult.competitionRate * 100` | 경쟁률에서 역산 |
| `sat[]` ([25%, 75%] 컷) | `[PrevYearResult.cutoff70, cutoff50]` | 정시 환산점수컷 |
| `gpa` | `5 - PrevYearResult.gradeCutoffAvg` | **polarity 반대** (한국: 1=최우수, 미국: 4.0=최우수) |
| `c` (city) | `University.shortName` 또는 `University.id` | 도시 의미 X, ID로 |
| `d` (도메인) | `University.d` | 그대로 |
| `loc` | `University.campuses[0].region` | 시·도 |
| `closed` | `!University.active` | 의미 동일, polarity 반대 |
| `ea`, `rd` | `tracks.susi_*.schedule.applicationEnd` 등 | 일정 분리 |
| `tg` (tags) | `Department.track` | 단일 enum으로 축소 |
| `toefl`, `prompts`, `reqs` | (제거) | 한국 일반 입시 무관 |
| `mr` (지표 맵) | `PrevYearResult` 필드 | 정형화 |
| `scorecard`, `qs` | (제거) | College Scorecard·QS는 미국·세계 랭킹 |
| `ecPts` | `SchoolActivity` 합산 점수 | 정량화 방식 변경 |
| `prob`, `lo`, `hi`, `cat`, `academicIdx` | 동일 (computed) | 알고리즘이 채움 |

**호환 어댑터**: `src/lib/admissions/adapter.ts` 의 `toLegacyShape(univ, dept, track, prev): LegacySchoolShape` 로 매칭 알고리즘 입력 형태를 그대로 유지.

### 1.2 `Specs` (US) → `UserAcademicSpec` (KR)

| `Specs` (US) | KR 대응 | 비고 |
|---|---|---|
| `gpaUW`, `gpaW` | `SchoolRecord.gpaOverall` | 단위수 가중평균 등급 (1.00~9.00) |
| `sat`, `act` | `CsatScore` (영역별 표준점수·백분위·등급) | 통합 점수 X — 영역별로 |
| `toefl`, `ielts` | (제거) | 한국 일반 입시는 외국어 X (특정 전형 제외) |
| `apCount`, `apAvg`, `satSubj` | (제거) | AP 시스템 한국에 없음 |
| `classRank` | (제거) | 한국은 등급제로 흡수 |
| `ecTier` (1~5) | `SchoolActivity.*` 정량 지표 | 단일 tier → 항목별 분해 |
| `awardTier` | `SchoolActivity.awards[]` | 학기당 1개 제한 (24학번~) 반영 |
| `essayQ`, `recQ`, `interviewQ` | (제거 / `interview`는 단계별) | 자소서 폐지, 추천서 한국 입시 일부만 |
| `legacy`, `firstGen`, `intl`, `gender` | (제거) | 한국 입시는 holistic factor 없음 |
| `earlyApp` (EA/ED) | `intent.susi[0]` 슬롯 | 6장 시스템으로 흡수 |
| `needAid` | (제거) | 일부 장학 전형이 있으나 매칭과 무관 |
| `major` | `Department.track` | 학과를 직접 선택 |
| `highSchool`, `schoolType` | `UserAcademicSpec.schoolType` (한국식 enum) | general/autonomous/special_purpose/specialized |
| `clubs`, `leadership`, `volunteering`, `research`, `internship`, `athletics`, `specialTalent` | `SchoolActivity.club / autonomous / volunteering / career / detailedAbility` | 생기부 항목으로 재분류 |

### 1.3 `payment/{orderId}` (Firestore) → `orders/{orderId}` + `users/{uid}/entitlements`

prismedu.kr 의 결제 인프라는 거의 그대로 재사용 가능 (토스 단건결제 코드 + Firestore 트랜잭션 + idempotency + paymentKey 보호 + uid 검증). **변경점**:

| 기존 | 신규 | 이유 |
|---|---|---|
| `payments/{orderId}` | `orders/{orderId}` | 도메인 표준어 (구독 호환) |
| `users.{plan, planBilling, lastPayment}` | `users/{uid}/entitlements` | 단건 누적 + 구독 통합 뷰 |
| orderId 형식 `{plan}_{billing}_{uid}_{ts}` | `ord_{ulid}` 또는 기존 형식 유지 | 기존 형식 유지 시 `parseOrderId` 그대로 재사용 |
| `VALID_AMOUNTS[plan][billing]` | `VALID_PRODUCTS[productKind]` | 상품 카탈로그로 일반화 |
| 단건 + 구독 분리 처리 | `period: "once" \| "monthly" \| "yearly"` 단일 필드 | 코드 분기 단순화 |

**그대로 유지**: `enforceRateLimit`, `requireAuth`, `runTransaction` idempotency 패턴, paymentKey 클라 차단.

---

## 2. 매칭 알고리즘 재계수

`src/lib/matching.ts` 의 `ACADEMIC` 상수는 미국 GPA(4.0)·SAT(1600) 기반. 한국 등급(1~9, 낮을수록 우수) 기반으로 재보정 필요.

### 변환 원칙

- **GPA 1.0 차이 = 등급 1.0 차이의 가중치 동일** 가정.
  - US: `GPA_DIFF_WEIGHT: 20` (4.0 vs 3.0 = +20점)
  - KR: 등급 차이 가중치 `20`. 단 polarity 반대 → 등급 1.0 vs 2.0 일 때 `+20` (낮을수록 가산)
- **SAT 100점 = 표준점수 10점** 가정 (대략).
  - US: `SAT_DIFF_PER_100: 7`
  - KR: 표준점수 10점 차당 `7` (영역별 합산 후 적용)
- **AP/SAT Subject/Class Rank** 가중치 모두 제거 → 비교과 정량(`SchoolActivity.score`)으로 대체.

### 코드 변경 요약 (의사코드)

```ts
// src/lib/matching-kr.ts (신규, matching.ts 와 병행)
const KR_ACADEMIC = {
  GRADE_DIFF_WEIGHT: 20,         // 내신 등급 차당
  CSAT_STD_PER_10: 7,            // 수능 표준점수 10점 차당
  ACTIVITY_MAX: 15,              // 비교과 최대 가산
  CSAT_MIN_PENALTY: -50,         // 수능최저 미충족 시
};

function computeKrAcademicIdx(spec: UserAcademicSpec, track: AdmissionTrack): number {
  // 1. 내신
  const gradeIdx = (5 - Math.min(spec.schoolRecord.gpaOverall ?? 5, 5)) * KR_ACADEMIC.GRADE_DIFF_WEIGHT;
  // 2. 수능 환산 (track.reflectionRatio 적용)
  const csatScore = applyReflectionRatio(spec.csat, track.reflectionRatio);
  const csatIdx = (csatScore - 70) / 10 * KR_ACADEMIC.CSAT_STD_PER_10;
  // 3. 비교과 (학종일 때만)
  const actIdx = isJonghap(track.kind) ? scoreActivity(spec.schoolActivity) : 0;
  // 4. 수능최저 (수시일 때만 검증)
  const minPenalty = track.csatMinimum && !meetsCsatMin(spec.csat, track.csatMinimum)
    ? KR_ACADEMIC.CSAT_MIN_PENALTY : 0;
  return gradeIdx + csatIdx + actIdx + minPenalty;
}
```

기존 `matchSchools` 의 `Reach/Hard Target/Target/Safety` 분류 로직과 `clamp(PROB_FLOOR, PROB_CEILING)` 은 그대로 사용 가능. 차이는 **academicIdx 계산식만**.

---

## 3. 데이터 마이그레이션 (Firestore)

prismedu.kr 의 운영 Firestore에서 한국 입시 인스턴스로 옮겨갈 데이터:

| 옮길 것 | 옮기지 말 것 |
|---|---|
| 사용자 계정 (Firebase Auth uid) | `users.specs` 본문 (US 스펙) |
| 결제 인프라 코드 (rules·트랜잭션·rate-limit) | `payments/*` 데이터 (US 플랜) |
| 운영자(`admins`) 명단 | `essays/*`, `essayReviews/*` 컬렉션 |
| 사이트 설정(`siteConfig` 등) | 미국 대학 마스터(`schools.json`) |

신규 인스턴스에서 새로 채워야 할 데이터:
- `universities/*` (대학 약 200~300개)
- `universities/*/departments/*` (학과 1,000여)
- `universities/*/departments/*/admissions/{year}` (모집요강 — ETL 파이프라인 결과)
- `admissionResults/*` (초기엔 비어있음. 자가보고 + 운영자 검증으로 누적)

**ETL 파이프라인** (별도 작업분):
- 입력: 대학별 모집요강 PDF/HTML (공식 다운로드, **크롤링 금지**)
- 출력: `DepartmentAdmissions` 도큐먼트
- 매년 7~9월 시즌 직전 일괄 갱신
- `source.parserVersion` 으로 재파싱 가능성 확보

---

## 4. 재사용 / 수정 / 삭제 코드 요약

### 4.1 그대로 재사용
- `src/lib/firebase.ts`, `firebase-admin.ts`, `auth-context.tsx`
- `src/lib/api-auth.ts`, `rate-limit.ts`, `ai-cache.ts`, `match-cache.ts`, `anthropic.ts`
- `src/app/api/payment/{request,confirm}/route.ts` (parse-order 약간 수정)
- `src/app/api/auth/{kakao,session}/route.ts`
- `src/components/ui/*` (shadcn/Radix 35개 전부)
- `src/hooks/*` 전부
- `firestore.rules` 의 헬퍼·기본 deny 패턴

### 4.2 인터페이스 변경, 골격 유지
- `src/lib/matching.ts` → `matching-kr.ts` (또는 같은 파일에 dual-mode)
- `src/lib/school.ts`, `school-search.ts`, `schools-index.ts` → University+Department 모델로
- `src/lib/prompts/admission-analysis.ts`, `planner.ts` → 한국 입시 프롬프트로 재작성
- `src/components/analysis/*` → 입력 폼 항목 교체
- `src/lib/plans.ts` → 단건 상품 카탈로그 + 구독 호환

### 4.3 제거
- `src/app/essays/*`, `src/app/api/{essay-review,essay-outline}/*`
- `src/components/essays/*`
- `src/lib/essays/*`, `essay-utils.ts`, `essay-export.ts`
- `src/lib/prompts/essay-review.ts`
- `src/types/essay.ts`
- `data/schools.json`, `schools-index.json`, `university-rubrics.json` (재구축)

---

## 5. 단계별 마이그레이션 권장 순서

1. **인프라 복제** (1주): Firebase 프로젝트 신규 생성, Auth·Firestore·Hosting 설정. rules 적용.
2. **타입·어댑터 도입** (3일): `types/admission.ts` + `adapter.ts`. 매칭 알고리즘 재계수 (`matching-kr.ts`).
3. **마스터 데이터 ETL** (2주): 대학·학과·모집요강 수집 파이프라인. 50개 주요 대학 우선.
4. **에세이 영역 제거 + 분석 폼 교체** (1주): UI 라우트 그대로, 데이터 바인딩만 변경.
5. **결제 어댑터** (3일): `payments` → `orders` + `entitlements`. 상품 카탈로그 정의.
6. **합격사례 누적** (시즌 전 6월~): 자가보고 폼 활성화, 운영자 검증 워크플로.
7. **시즌 부하 테스트** (8월): 트래픽 시뮬레이션, 인덱스·캐시 점검.

---

## 6. 검토 포인트 5가지

다음 항목은 스키마 결정이 후속 알고리즘·UX 정합에 큰 영향을 주므로 코드 작성 전에 결론을 내야 합니다.

### ① 가/나/다군 중복지원 제한 — 검증 책임 위치
- 현 모델: `AdmissionIntent.jeongsi.{ga,na,da}` 를 단일 슬롯으로 강제 → 같은 군 두 대학 동시 불가는 **타입 레벨에서 차단**.
- 그러나 같은 대학이 한 군에 두 학과를 둘 수 있고(연세대 컴공·전기 둘 다 나군), 사용자는 그중 1개만 선택해야 함. 이 검증은 클라이언트 폼만으론 불완전.
- **결정 필요**: write 시 Cloud Function trigger 로 검증할지, API 라우트(`/api/intent`)에서 transactional 검증할지.

### ② 수시→정시 이월 — `quotaFinal` 갱신 SLA
- 1월 하순 발표 후 정시 합격선 산정에 즉시 반영되어야 함. 하루 지연도 사용자 합격 추정 정확도에 직격.
- 현 모델: `quotaInitial` / `quotaFinal` 분리 + ETL `parserVersion`.
- **결정 필요**: 수동 검수 후 게시(정확) vs 자동 ETL 즉시 반영(빠름). 시즌 운영 인력과의 trade-off.

### ③ 수능최저 자동 판정의 한계
- 현 모델 `CsatMinimum` 은 "후보 영역 중 N개 합산" 패턴만 정형화. 실제 모집요강은 "수학·탐구 포함 3개 합 6 이내" 같은 **포함 강제 조건**이 흔함 → `additionalRules` 자유 텍스트로 빠지면 자동 판정 불가.
- **결정 필요**: 룰 DSL을 도입해 모든 패턴을 정형화할지, 또는 자동 판정을 보수적으로 하고 자유 텍스트는 사용자에게 그대로 노출할지. DSL 도입은 ETL·테스트 비용 큼.

### ④ 자가보고 합격사례의 표본 편향
- 한 명의 자가보고로 그 학과 합격선이 왜곡 가능. 특히 신설 학과·소수 모집 학과.
- 현 모델: `confidence` 가중치만 보유.
- **결정 필요**: 매칭 알고리즘에 베이지안 prior를 도입할지(표본 적으면 분산 큰 사전분포로 보수 추정), 또는 표본 N개 미만 학과는 합격선 추정 자체를 비공개할지(UX 결정).

### ⑤ 단계별 학종 — 1단계 컷과 최종 컷 구분
- 학종 1단계는 서류 100%로 N배수 통과 → 2단계는 면접 추가. 1단계 컷과 최종 컷이 완전히 다른 분포를 가짐.
- 현 모델: `prevYearResult.stage1Cutoff` / `cutoffAvg` 분리 보유.
- **결정 필요**: 합격 가능성을 1단계 통과 확률 × 2단계 통과 확률로 분해해 표시할지(정확하지만 복잡), 단일 합격 확률로 합쳐 보여줄지(직관적이지만 면접 영향 가림).

---

### 추가 함정 (참고)

- **표준점수 vs 백분위 혼합 반영**: 같은 대학이 영역마다 다른 점수 종류를 쓰는 경우 있음 (e.g., 국·수=표준, 탐구=백분위). 현 모델 `ReflectionRatio`는 영역별 `scoreType`을 분리 보유해 처리 가능.
- **변환표준점수**: 탐구 영역은 표준점수 그대로가 아니라 대학별 변환표를 통해 변환됨. `ReflectionRatio.bonusByCourse` 와 함께 변환표 별도 보유 필요. 현 모델에서는 `notes` 또는 `additionalRules` 로 fallback.
- **의·치·약·수·교대의 특수성**: 합격선이 일반학과와 100점 단위로 다름. `Department.isProfessional=true` 로 식별만, 매칭 알고리즘은 `professionalType` 별 분기 모델 권장.
- **광역모집(자유전공·계열)**: 1년 후 학과 선택 시 입결 비교가 어렵다. 광역의 합격 확률을 `subDepartments` 평균으로 할지 최저로 할지 정책 필요.
- **기회균형/농어촌 등 정원외 모집**: `SpecialAdmissionType` 으로 식별만, 일반 매칭에서 노출할지 별도 페이지로 분리할지 UX 결정.
