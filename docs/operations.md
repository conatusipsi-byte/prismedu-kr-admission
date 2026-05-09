# 운영 매뉴얼 — 한국 대학 입시 서비스

본 문서는 시즌 운영자가 매년 반복 수행하는 작업, 결정사항이 구체적 워크플로에 반영되는 방식, 모니터링 체크리스트를 정리합니다. 코드·스키마 결정 근거는 `docs/schema.md` §6, §7 참조.

---

## 1. 시즌 캘린더 (학년도 N의 입시는 N-1년 7월부터 N년 2월까지)

| 시기 | 작업 | 책임 | 산출물 |
|---|---|---|---|
| **6월 말** | 모집요강 ETL 1차 (지난해 데이터 기준 검증) | 데이터팀 | `admissions/{N-1}` 파싱 회귀 테스트 통과 |
| **7~9월** | 모집요강 ETL 본 작업 (학년도 N) | 데이터팀 | `admissions/{N}` 활성화 |
| **9월 ~ 12월 초** | 수시 시즌 — 트래픽 1차 피크 | 운영 전체 | 캐시 적중률·에러율 모니터링 |
| **11월 셋째 목** | 수능 — D-Day 위젯, 합격사례 자가보고 폼 활성화 | 운영팀 | 자가보고 누적 시작 |
| **12월 초** (수능 후 1~2주) | **변환표 ETL 2차 갱신 (P-012)** | 데이터팀 | `--phase conversion` 실행 → `AdmissionTrack.conversionTable.status` 를 `preliminary` → `finalized` 로 |
| **12월 ~ 1월** | 정시 시즌 — 트래픽 2차 피크 | 운영 전체 | 정시 환산점수 산출 정확도 일일 체크. `status="preliminary"` 잔존 학과 0건 확인 |
| **1월 마지막 주** | **수시→정시 이월 검수 (결정 §6.2)** | 운영자 1명 | `admissionsStaging` → `admissions` 승격 |
| **2월** | 추가모집 ETL 보강, 합격사례 검증 일괄 | 데이터팀 | `admissionResults.verified=true` 일괄 승격 |
| **3~5월** | 다음 시즌 준비 (스키마 변경·ETL 개선) | 전체 | 회고 + 개선 사항 반영 |

---

## 2. 1월 이월 검수 워크플로 (결정 §6.2)

### 사전 조건
- 자동 ETL이 학년도 N 모집요강을 1월 셋째~넷째 주에 재파싱 → `admissionsStaging/{N}` 컬렉션에 적재.
- 운영자만 read 가능 (rules).

### 검수 단계
1. **diff 뷰** 접속 (`/admin/admissions-staging/diff?year={N}`)
2. 학과별 `quotaInitial` → `quotaFinal` 변경 사유 확인
3. 음수 증감(-) 또는 ±10% 이상 변동 학과는 **모집요강 PDF로 교차 검증**
4. 이상 학과는 별도 큐로 보류, 정상 학과 일괄 승격
5. 승격 후 `match-cache` 무효화 자동 트리거 — 정시 합격 추정 즉시 갱신

### 예상 작업 시간
- 평균 200개 학과 × 5분/학과 = **약 17시간**
- 직전 주말 + 평일 분산 권장. 단, 정시 원서접수는 1월 초~중순이라 운영자도 시즌 트래픽 응대와 병행됨에 유의.

### 실패 처리
- 승격 실패 학과는 staging에 잔류 → `admissions/{N}.tracks.jeongsi_*.quotaFinal` 미갱신 → UI에 "확정 모집인원 미반영" 배지 노출
- 24시간 내 미해결 시 운영 리드에 자동 슬랙 알림

---

## 3. 합격사례 검증 워크플로 (결정 §6.4 + 학종 분해 §6.5)

### 자가보고 수집 폼 항목
- 대학·학과·학년도·전형 종류 (필수)
- 합격 여부 (`accepted` / `waitlist` / `rejected`)
- **학종 한정 — 1단계 통과 여부 (`passedStage1`)** ← 결정 §6.5로 추가
- 익명 스펙 스냅샷 (내신·수능·비교과 점수)
- 출신학교 유형 (일반고/자사고/특목고/특성화고)

### 검증 흐름
1. 자가보고 도큐먼트는 `verified=false`, `confidence=0.5`로 생성 (rules 강제)
2. 운영자 검수 큐에 진입
3. **검증 항목**:
   - 학년·학기 입력 일관성 (예: 2학년 1학기에 수능 점수 있으면 의심)
   - 영역 등급/표준점수 분포가 비현실적이지 않은지
   - 학종 1단계 통과여부와 outcome 정합성 (`passedStage1=false` + `outcome=accepted`는 모순)
4. 통과 시 `verified=true`, `confidence=1.0` 또는 `0.7~0.9` (운영자 판단)
5. 승격 직후 `admissionResults` onWrite 트리거 → `admissionSampleStats` 갱신

### 표본 카운트 갱신 규칙
| 트리거 이벤트 | `verifiedCount` | `weightedCount` | `acceptedCount` | `stage1PassedCount` | `stage2AcceptedCount` |
|---|---|---|---|---|---|
| `verified: false → true` | +1 | +confidence | +1 (accepted일 때) | +1 (passedStage1=true) | +1 (passedStage1=true & accepted) |
| `verified: true → false` (자료 무효 판정) | -1 | -confidence | -1 ··· | -1 ··· | -1 ··· |
| `outcome` 변경 | 부분 갱신 | - | 변동 | - | 변동 |

### 시즌 중 누적 모니터링
- **임계 도달 알림**: 학과별 `acceptedCount` 5건 도달 시 운영 슬랙에 자동 알림. UI에 합격 확률이 새로 노출되는 시점이므로 사용자 안내(메일/푸시)도 검토.
- **편향 모니터링**: 자가보고 비율이 90% 이상인 학과는 가중 임계(`WEIGHTED_THRESHOLD=3.0`)에 걸려 비공개 유지 — 의도된 동작이므로 별도 액션 없음. 단, 시즌 끝까지 비공개면 다음 시즌에 표본 수집 캠페인 우선 학과로 분류.

---

## 4. 표본 부족 학과 락 정책 (결정: 락 적용 X)

### 정책
- **표본 부족** (`AdmissionProbability.category === "insufficient_sample"`) 학과는 무료 사용자에게도 락 적용 X.
- 모집요강·일정·전형방법 등 **정형 정보는 항상 무료 공개**.
- 분석 영역만 "표본 부족" 메시지로 폴백 — 어차피 확률 자체가 비공개라 락이 의미 없음.

### `lib/admission/sample-gate.ts` 의 `isLockable()`

| 사용자 | 표본 충족 | preview 안 | 결과 |
|---|---|---|---|
| 유료 (pro/elite) | - | - | `lockable: false` (`paid_plan`) |
| 무료 | ❌ 부족 | - | `lockable: false` (`insufficient_sample`) |
| 무료 | ✅ 충족 | ✅ 안 | `lockable: false` (`in_free_preview`) |
| 무료 | ✅ 충족 | ❌ 밖 | `lockable: true` (`free_plan_over_preview_quota`) |

### 운영자 시각의 함의
- 표본 부족 학과가 많을수록 **무료 사용자에게도 정형 정보 노출이 늘어남** → 마케팅 문구는 "분석은 유료, 정보는 무료" 식으로 정확히 표현.
- 시즌 진행될수록 표본 충족 학과가 늘어나므로 자동으로 무료 노출이 줄고 유료 전환 동인이 커짐 — 시즌 후반(11월~) 결제 컨버전 모니터링.

---

## 5. `/api/match` 라우트 흐름 (의사코드)

### 입력
- `userSpec: UserAcademicSpec` — 클라이언트 폼 데이터
- `request.auth` — Firebase ID 토큰
- 선택 사항: `filter` — 지역·계열·전형 종류 등

### 흐름 의사코드

```ts
POST /api/match {
  // 1. 인증·쿼터·rate-limit (prismedu.kr 패턴 그대로)
  const session = await requireAuth(req);
  const plan = await getUserPlan(session.uid);              // free | pro | elite
  await enforceRateLimit({ bucket: "match", uid, ... });

  // 2. zod 입력 검증
  const spec = MatchInputSchema.parse(body);

  // 3. 후보 학과 조회 — 광역모집·active=true·필터 적용
  const candidates = await loadDepartments({ filter });     // ~1,000 학과

  // 4. 학과별 매칭 — 표본 게이트 + 매칭 알고리즘
  const results = [];
  for (const dept of candidates) {
    const stats = await getSampleStats(dept.universityId, dept.id, dept.year, dept.trackKind);
    const sample = checkSampleSufficiency(stats);

    let probability: AdmissionProbability;
    if (!sample.sufficient) {
      // 결정 §6.4 — 표본 부족이면 매칭 알고리즘 호출 자체 생략, 폴백 출력
      probability = buildInsufficientSampleProbability(sample);
    } else {
      // 매칭 알고리즘 호출 (학종이면 1×2 분해 포함)
      probability = computeKrProbability(spec, dept, stats);
    }
    results.push({ dept, probability, sample });
  }

  // 5. Free preview 컷 산정 — 표본 충족 학과 중에서만 Reach/Target/Safety 5+4+6+5 = 20개
  //    표본 부족 학과는 preview 컷에서 제외 (어차피 락 안 걸리므로 카운트할 이유 없음)
  const previewIds = plan === "free"
    ? selectFreePreviewIds(results.filter(r => r.probability.sampleSufficient))
    : null;

  // 6. 락 결정 — isLockable() 적용
  const finalResults = results.map(r => {
    const lock = isLockable(
      { plan, isInFreePreview: previewIds?.has(r.dept.id) ?? true },
      r.sample,
    );
    return {
      universityId: r.dept.universityId,
      departmentId: r.dept.id,
      probability: lock.lockable ? maskProbability(r.probability) : r.probability,
      locked: lock.lockable,
      lockReason: lock.lockable ? lock.reason : undefined,
      // 정형 정보(모집요강·일정)는 락 여부와 무관하게 항상 동봉
      meta: {
        trackKind: r.dept.trackKind,
        quotaInitial: r.dept.quotaInitial,
        schedule: r.dept.schedule,
        // ...
      },
    };
  });

  return {
    results: finalResults,
    plan,
    totalAvailable: candidates.length,
    insufficientSampleCount: results.filter(r => !r.probability.sampleSufficient).length,
    lockedCount: finalResults.filter(r => r.locked).length,
  };
}
```

### 클라이언트 측 분기
- `locked === true` → "업그레이드" CTA + 마스킹된 카드
- `probability.category === "insufficient_sample"` → "표본 부족" 카드 (락 X, 정형 정보 노출)
- 그 외 → 정상 분석 카드 (학종이면 `hakjong` 분해 표시)

### 캐싱
- `match-cache.ts` 키에 `{specHash}_{plan}` 포함. 동일 spec이라도 plan 바뀌면 락 결과 다름.
- `admissionSampleStats`는 학과 단위 별도 캐시 (60초 TTL). 시즌 중 자주 갱신되므로 짧게.

---

## 6. AI 카운슬러 가드 모니터링

### 6.1 다층 방어
1. **시스템 프롬프트 가드** — `lib/prompts/counselor-guards.ts` 의 `buildCounselorSystemPrompt(ctx)`.
   `NUMERIC_ESTIMATION_GUARD` 항상 포함 + `INSUFFICIENT_SAMPLE_GUARD(schoolNames)` 해당 학과 언급 시.
2. **응답 후처리 sanitize** — `lib/admission/counselor-postprocess.ts` 의 `sanitizeCounselorResponse(text, ctx)`.
   가드가 우회된 경우 문자열 레벨에서 차단. `/api/chat` 라우트가 LLM 응답 직후 호출.
3. **메트릭 기록** — `lib/admission/counselor-metric.ts` 의 `recordSanitizeMetric(result, ctx)`.
   Firestore 일별 카운터 + 샘플 이벤트(20%) + Sentry warn 로그.

### 6.2 메트릭 데이터 구조

```
monitoring/counselorSanitize/daily/{YYYY-MM-DD}
  date: "2026-09-15"
  totalCalls: 1240
  triggeredCalls: 8
  totalReplacements: 11
  byPattern: {
    percent: 5,
    grade: 3,
    score: 1,
    percentile: 1,
    standard: 0,
    cutoff_phrase: 1,
  }
  updatedAt: serverTimestamp

monitoring/counselorSanitize/events/{eventId}      ← SAMPLE_RATE=20% 만 저장
  uid, conversationId, contextSchools[]
  replacedSentences[]: { original, matchedPattern }
  totalSentences, matchedSentences
  recordedAt
```

### 6.3 admin 대시보드 — 노출 항목

별도 백오피스 페이지(`/admin/counselor-sanitize`)에서 Admin SDK 로 조회. 클라이언트는 read 차단(`monitoring/**`은 운영자만 — `firestore.rules`).

| 위젯 | 데이터 출처 | 임계 알림 |
|---|---|---|
| **발동률 시계열** (일별, 30일) | `daily/*.triggeredCalls / totalCalls` | 발동률 > 1% 일이 3일 연속 → 슬랙 |
| **패턴별 분포 도넛** | `daily/*.byPattern` 합산 | 한 패턴이 70% 초과 → 가드 보강 |
| **최근 사례 테이블** (50건) | `events/*` 최신순 | 운영자 매일 1회 검토 |
| **Top 컨텍스트 학과** | `events/*.contextSchools` 빈도 집계 | 같은 학과 5회 이상 → 표본 수집 캠페인 우선순위 |

### 6.4 운영자 점검 체크리스트

#### 카운슬러 sanitize 모니터링 (시즌 중 매주)
- [ ] 시즌 시작 1주일 후, `monitoring/counselorSanitize/daily` 발동률 < 1% 확인
- [ ] 매주 월요일, `events` 컬렉션 최근 50건 운영자 검토 — false positive (정형 답변 잘못 sanitize) 비율 < 5%
- [ ] 패턴 분포에서 한 패턴(특히 `percent`)이 70% 초과 → 시스템 프롬프트 가드 그 패턴 강화
- [ ] 외부 사이트(진학사·대학어디가) 인용 사례 0건 확인 (별도 정규식 추가 검토)

#### ETL 분류기 어휘 자동 점검 (매년 7~9월)

`classifyMinReq()` 의 `TRACK_PATTERN_VOCAB` 가 그 해 모집요강에 등장하는 모든 ○○계열 표현을 커버하는지를 **GitHub Actions cron 으로 시스템이 강제 점검**한다. 수동 점검은 폐기 — 사람 기억에 의존하던 워크플로를 자동화로 대체했다.

##### 자동화 트리거

| 트리거 | 시점 | 동작 |
|---|---|---|
| GitHub Actions cron | 매년 7/1, 8/1, 9/1 18:00 KST | `update-track-vocab-fixtures.ts` 실행 → 변경 시 PR draft 자동 생성 |
| ETL 파이프라인 후크 | `admissions-sync.ts` 실행 직후 | 같은 스크립트 실행 → 변경 시 admin 대시보드 알림 (`monitoring/adminNotifications`) |
| 수동 (`workflow_dispatch`) | GitHub Actions UI 에서 임의 시점 | 위와 동일 — 시즌 외 검증용 |

##### 자동화 워크플로

```
[스캔] admissions collectionGroup 전체 순회
  ↓ extractMinReqTexts()
[추출] csatMinimum.{originalText, additionalRules}
  ↓ /([가-힣]{2,6})계열(?![가-힣])/g
[비교] TRACK_PATTERN_VOCAB ↔ 발견 어휘 set
  ↓ 신규 어휘 분리
[갱신] (신규 있을 때만)
  - lib/admission/min-req-classifier.ts → TRACK_PATTERN_VOCAB 배열 자동 추가
  - lib/admission/__tests__/fixtures/sample-min-reqs.ts → 어휘당 3 샘플 자동 추가
  ↓
[회귀 테스트] trackPattern-coverage + min-req-classifier
  ↓
[알림]
  - GitHub Actions: PR draft 생성 (label: etl-vocab-review, automated, needs-review)
  - ETL: monitoring/adminNotifications/items 에 unresolved=true 도큐먼트 추가
```

##### 결과 확인

| 결과 | 확인 위치 | 동작 |
|---|---|---|
| 변경 없음 | GitHub Actions 로그 (`✅ 어휘 변경 없음`) | 추가 작업 없음 |
| 변경 있음 (PR draft) | GitHub PR 목록 (label: `automated`) | **5분 검수 후 머지** (아래 절차) |
| 스크립트 실패 | GitHub Actions 실패 알림 | 운영 리드에 슬랙 알림, 24시간 내 수동 점검 fallback |

##### PR draft 검수 절차 (5분 작업)

자동 생성된 PR에는 본문에 검수 가이드가 자동 포함된다. 운영자는 다음만 확인:

- [ ] **1. 신규 어휘 의미 확인** — 단순 학과 분류 표시(`"본 학과는 X계열로 분류"`)가 아니라 실제 분기 기준(`"X계열은 Y, Z계열은 W"`)에 등장하는 어휘인지 PR 본문의 샘플로 검토
- [ ] **2. 자동 추가 fixture 검수** — `fixtures/sample-min-reqs.ts` 의 `// 자동 추가, 검수 필요` 주석 블록에서 샘플 텍스트가 모집요강 패턴에 부합하는지 확인 (대부분 패스)
- [ ] **3. 분류기 회귀 케이스 추가** — 신규 어휘 1~2개씩 `min-req-classifier.test.ts` 의 `conditional` describe 블록에 ad-hoc 케이스 추가 (PR 본문에 패턴 안내됨)
- [ ] **4. 회귀 통과 확인** — PR 체크 자동 실행. ❌면 fixture 텍스트 노이즈 정리 또는 어휘 의미 재검토
- [ ] **5. draft 해제 + review request** — Ready for review → 운영 리드 1명 approve → 머지

##### 자동화 게이트

- **자동 머지 X**: PR draft 만 자동 생성, 머지는 항상 사람 검수.
- **시즌 머지 게이트**: 7~9월 cron PR이 모두 머지되어야 ETL 본 시즌 가동 시작 조건 충족.
- **누락 방지**: 9월 1일 PR이 30일간 미머지 상태로 남으면 운영 리드 자동 에스컬레이션 (별도 알림 워크플로 — 추후 추가).

##### 시크릿·권한 요구

GitHub Repository Settings:
- `secrets.FIREBASE_SERVICE_ACCOUNT`: GCP 서비스 계정 JSON 전체. Firestore read 권한만 필요 (스크립트는 코드만 수정, Firestore write X).
- Workflow permissions: `contents: write` + `pull-requests: write` (PR 생성·브랜치 푸시).

### 6.5 회귀 발생 시 대응
1. **가드 텍스트 강화** — `counselor-guards.ts` 의 잘못된/올바른 답변 예시에 회귀 케이스 추가
2. **모델 변경 검토** — 가드 따르지 않는 모델은 비용 동일이라도 사용 X
3. **후처리 패턴 추가** — `counselor-postprocess.ts` 의 `NUMERIC_PATTERNS` 에 새 정규식 추가 + 회귀 테스트(`__tests__/counselor-postprocess.test.ts`)에 케이스 추가
4. **회귀 게이트** — 후처리 회귀 테스트 50건 통과해야 deploy

#### 단계 비중 합 ≠ 100 케이스 처리 가이드

서울대 학종 일반전형 등 일부 모집단위는 `AdmissionStage.components` 비율 합이 100이 아님 (예: 1단계 점수 100 + 면접 100 = 200점 만점). ETL/매칭에서 다음 가이드 적용:

- **ETL 입력**: 모집요강 표기 그대로 보유. 100으로 강제 정규화 X.
- **매칭 알고리즘**: 비율 합을 자체 정규화하여 가중평균 산출. 정규화 식: `weight_i = ratio_i / sum(ratios)`.
- **사용자 노출**: 모집요강 원문 그대로 노출 (예: "1단계 100 + 면접 100"). "총점 200" 표기 유지.
- **검증 룰**: ETL이 합 ≠ 100 인 케이스를 발견하면 admin 알림 (`monitoring/adminNotifications`) — 운영자가 모집요강 원본과 대조해 ETL 파싱 오류가 아닌지 확인.
- **자동판정 영향 없음**: 합격 추정은 정규화 후 산출이므로 사용자 점수 비교에는 일관.

본 가이드의 적용 대상은 **서울대 의대·학종 일반전형 등 극소수**. 신규 학교에 합 ≠ 100 패턴이 발견되면 본 가이드를 따른다.

### 6.6 비용 영향
- 시스템 프롬프트가 약 800~1200 토큰 길어짐. prompt caching 으로 cache 적중 시 cost 영향 미미.
- 표본 부족 학과 목록은 학생별로 다르므로 학생 프로필 단위 cache control.
- sanitize 후처리는 정규식 6개 × 평균 5문장 — 응답당 < 1ms. 메트릭 기록은 fire-and-forget.

---

## 7. 모니터링 대시보드 항목

시즌 중 실시간 모니터링. (구현은 별건이지만 무엇을 봐야 하는지 정리)

| 영역 | 지표 | 임계 |
|---|---|---|
| 시스템 | `match-cache` 적중률 | < 70% 시 알림 |
| 시스템 | Claude API 에러율 | > 1% 시 알림 |
| 시스템 | Firestore read QPS | 사전 한도의 70% |
| 도메인 | 표본 부족 학과 비율 | 10월 말까지 50% 미만으로 |
| 도메인 | 자가보고 누적 (일별) | 시즌 평균 대비 -30% 시 캠페인 |
| 도메인 | 합격 확률 노출 학과 수 | 시즌 진행 곡선과 비교 |
| 결제 | `orders.status=approved` 일별 | 전년 대비 |
| 결제 | 결제 실패율 (`failed/(approved+failed)`) | > 2% 시 알림 |
| AI | 카운슬러 응답 평균 토큰 | 비용 추적 |
| AI | "표본 부족" 안내 등장률 (대상 학과 응답에서) | < 80%면 가드 강화 |

---

## 8. 인시던트 런북

### 8.1 표본 카운트 불일치 (`admissionSampleStats` ≠ 실제 컬렉션 카운트)
- 원인: trigger 실패 또는 batch 갱신 누락
- 조치: 운영자 콘솔에서 `recomputeSampleStats(year, trackKind)` 일괄 재계산 함수 호출
- 빈도 목표: 시즌당 0건. 1건 발생 시 trigger 로그 분석

### 8.2 모집요강 ETL이 자동판정 불가 케이스를 자동판정으로 잘못 분류 (`autoEvaluable=true` 오류)
- 증상: 사용자가 수능최저 충족이라고 안내받았지만 실제 모집요강은 추가 조건 강제
- 조치:
  1. 해당 도큐먼트 `complexity` 수동 정정 → `with_required` 또는 `custom`
  2. ETL 분류기 회귀 테스트 케이스 추가
  3. 사용자 영향 범위 추정 후 안내 (필요 시)

### 8.3 1월 이월 검수 SLA 초과
- 1월 31일까지 미승격 학과 발생 시:
  1. 사용자에게 "확정 모집인원 미반영" 배지 노출 유지
  2. 합격 확률은 `quotaInitial` 기준으로 산출 (보수적)
  3. 승격 즉시 합격 추정 갱신·푸시 알림

### 8.4 AI 카운슬러가 임의 수치 응답
- 즉시: 해당 대화 로그를 가드 회귀 케이스로 등록
- 24시간 내: 가드 텍스트 보강 PR
- 1주 내: 정량 평가 (회귀 케이스 50건에서 0건 통과해야 deploy)

---

## 9. 다음 시즌 준비 체크리스트 (3~5월)

- [ ] 시즌 회고 — 인시던트, 사용자 피드백, 가드 우회 사례 정리
- [ ] 모집요강 ETL 분류기 정확도 측정 (전년 대비)
- [ ] 표본 부족 학과 캠페인 — 자가보고 폼 노출 확대
- [ ] 매칭 알고리즘 계수 재보정 (전년 합격사례로 회귀 학습)
- [ ] 의·치·약·수·교대 별도 모델 분기 운영 검토 (`Department.isProfessional` 활용)
- [ ] 결제 상품 카탈로그 갱신 (시즌권 가격·구성)
- [ ] 변환표 ETL 2차(12월) 갱신 SLA 회고 — 정시 시즌 진입 전 100% finalized 도달 여부

---

## 10. ETL PDF 인코딩 처리 가이드 (P-012 부속)

모집요강 PDF의 인코딩이 학교마다 달라 단일 도구로는 전수 처리 불가. **3단계 fallback 체인** 으로 처리하고, 마지막 단계인 OCR 결과는 `trustLevel="suspicious"` 마킹하여 trackPattern 자동화(P-007)와 동일한 검수 워크플로 적용.

### 10.1 fallback 체인

```
[1차]  pdftotext -enc UTF-8         (대부분 학교 PDF — 한컴·MS Word 출력)
        ↓ (실패 또는 한국어 손실)
[2차]  pdftotext -enc Adobe-Korea1  (Adobe Acrobat 한국어 인코딩 — 일부 학교)
        ↓ (실패)
[3차]  Tesseract OCR (한국어 모델 kor)  (스캔 PDF 또는 인코딩 깨진 PDF)
        ↓
       trustLevel = "suspicious" 마킹 → 운영자 검수 강제
```

### 10.2 단계별 동작

| 단계 | 명령 | 성공 판정 | 출력 trustLevel |
|---|---|---|---|
| 1차 UTF-8 | `pdftotext -enc UTF-8 in.pdf out.txt` | exit 0 + 한국어 추출 비율 ≥ 80% | `trusted` |
| 2차 Adobe-Korea1 | `pdftotext -enc Adobe-Korea1 in.pdf out.txt` | exit 0 + 한국어 추출 비율 ≥ 80% | `trusted` |
| 3차 OCR | `tesseract in.pdf out -l kor --psm 6` | 텍스트 산출됨 (품질 무관) | `suspicious` |

**한국어 추출 비율 측정**: `[가-힣]` 매칭 글자 수 / 전체 출력 문자 수. 80% 미만이면 인코딩 손실 의심 → 다음 단계로.

### 10.3 OCR 의심 데이터 처리

OCR 단계로 처리된 PDF의 추출 결과는 `trustLevel="suspicious"`. 후속 처리:

1. **데이터 보유**: 정상 ETL 파이프라인을 통과시키되, 모든 추출 필드(`csatMinimum.originalText` 등)에 `__source: "ocr"` 메타 표시
2. **admissionsStaging 저장 시 마킹**: 운영자 검수 콘솔에 ⚠️ 배지 노출
3. **검수 강제**: OCR 출력 학과는 자동 승격 X. 운영자 1명 이상 read-confirm 필수
4. **회귀 학습**: 어떤 학교 PDF가 OCR로 빠지는지 통계 누적 → 다음 시즌 preprocessing 개선

### 10.4 인코딩 통계 admin 대시보드

`monitoring/etlEncodingStats/{YYYY-MM}` 도큐먼트에 월별 집계:

```
{
  month: "2026-08",
  byEncoding: {
    utf8: 120,           // 1차 통과 학교 수
    adobe_korea1: 15,    // 2차 통과
    ocr: 5,              // 3차 (suspicious)
  },
  ocrSchools: ["서울대", "외대 글로벌"],   // OCR로 빠진 학교 목록
  retryRequired: ["X대학교"],              // 3차도 실패 — 수동 처리 큐
}
```

admin 대시보드(`/admin/etl-encoding`)에서 노출:
- **인코딩 분포 도넛**: utf8 / adobe_korea1 / ocr 비율
- **OCR 학교 시계열**: 어느 학교가 매년 OCR로 빠지는지 — 다음 시즌 preprocessing 우선순위
- **retryRequired 큐**: 3차도 실패한 PDF는 수동 추출 작업 (이미지 추출 + 사람이 입력)

### 10.5 운영자 점검 체크리스트 (시즌 중)

- [ ] 매주 월요일, `etlEncodingStats` 의 `ocr` 비율 < 5% 확인
- [ ] OCR 마킹 학과의 `csatMinimum.originalText` 직접 검독 (모집요강 PDF와 1:1 대조)
- [ ] `retryRequired` 큐에 학교 1건 이상 잔존 시 데이터팀 슬랙 알림
- [ ] 동일 학교가 2년 연속 OCR 단계로 빠지면 그 학교 전용 preprocessing 추가 (예: PDF→이미지→재OCR 파이프라인)

### 10.6 의존 도구 설치

#### 로컬 개발 환경

```bash
# pdftotext (poppler-utils 포함)
sudo apt-get install -y poppler-utils    # Ubuntu
brew install poppler                      # macOS

# Tesseract OCR + 한국어 모델
sudo apt-get install -y tesseract-ocr tesseract-ocr-kor
brew install tesseract tesseract-lang

# 한국어 모델 확인
tesseract --list-langs | grep kor
```

#### GitHub Actions 워크플로

`ubuntu-latest` runner 에 위 도구가 기본 미포함. 향후 ETL·OCR 워크플로(예: `admissions-sync.yml`) 작성 시 `actions/checkout` 다음 단계에 다음 step 삽입:

```yaml
- name: Install OCR dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y tesseract-ocr tesseract-ocr-kor poppler-utils
```

#### 적용 대상 워크플로

| 워크플로 | OCR 의존성 필요 | 비고 |
|---|---|---|
| `track-vocab-check.yml` | ❌ | Firestore collectionGroup 만 순회 — PDF 파싱 X |
| `admissions-sync.yml` (예정) | ✅ | initial 단계 PDF 파싱 시 fallback 체인 사용 |
| `conversion-fetch.yml` (예정) | ✅ | 12월 변환표 PDF 파싱 시 동일 |

**캐시 전략**: `actions/cache` 로 `/var/cache/apt` 캐싱 검토. 단, Tesseract 한국어 모델은 약 50MB 단발 다운로드라 캐싱 효과 크지 않음. 우선 캐시 없이 매 실행 설치.

#### 설치 검증 step (선택)

워크플로 안정성 위해 설치 직후 검증 step 추가:

```yaml
- name: Verify OCR tooling
  run: |
    pdftotext -v 2>&1 | head -1
    tesseract --version 2>&1 | head -1
    tesseract --list-langs | grep -q kor && echo "✅ Korean model OK" || (echo "❌ kor model missing"; exit 1)
```

---

## 11. 통합 검증 워크플로 (Firebase Emulator + e2e)

신규 개발자 온보딩 + 권한 이관 시점에 본 절차로 통합 동작을 일괄 검증.

### 11.1 사전 의존성

| 도구 | 버전 | 설치 |
|---|---|---|
| Java JRE | 11+ | https://adoptium.net/ — Firebase Emulator 필수 |
| Node.js | 20+ | (이미 빌드 환경 동일) |
| Playwright 브라우저 | latest | `npx playwright install --with-deps chromium` |

설치 검증:

```bash
java -version            # 출력에 "11.x" 또는 그 이상
npx firebase --version   # firebase-tools devDep
npx playwright --version
```

### 11.2 Emulator + dev 서버 동시 실행

스크립트가 모든 단계를 자동화:

```bash
# Windows pwsh
npm run dev:emu

# macOS/Linux
bash ./scripts/dev-with-emulator.sh
```

흐름:
1. Firebase Emulator 시작 (Firestore:8080, Auth:9099, Storage:9199, UI:4000)
2. 시드 데이터 로드 (`scripts/firestore/init-collections.ts` — 서울대 의예과 1건)
3. Next.js dev 서버 시작 (`NEXT_PUBLIC_USE_EMULATOR=true`)
4. Ctrl+C 시 모든 프로세스 cleanup

기대 출력:

```
🌐 dev 서버:        http://localhost:9002
🔥 Emulator UI:     http://localhost:4000
📦 Firestore:       localhost:8080
🔐 Auth:            localhost:9099
```

### 11.3 수동 통합 테스트 시나리오

`docs/integration-test-log.md` 의 9개 시나리오 + 에러 3개 + P-001 회귀 4개 를 손으로 검증. 결과를 같은 파일에 ✅/❌ 로 기록.

핵심 시나리오:
1. 빈 검색 → 시드 학과 노출
2. "서울" 검색 → 의예과 노출
3. **"ㅅㅇ" 초성 검색** → 의예과 노출 (P-001 무관, 도메인 동작 검증)
4. RegionFilter 서울권 → 의예과
5. TrackFilter 디폴트 → **jaeoegukmin 옵션 미노출** (P-013)
6. 카드 클릭 → /admissions/snu/med (현재 404, 상세 페이지 후속)

### 11.4 e2e 자동 실행

```bash
# 한 번에 (webServer 가 자동 dev:emu 실행)
npm run test:e2e

# UI 모드 (디버깅)
npm run test:e2e:ui
```

`playwright.config.ts` 의 `webServer` 옵션이 dev:emu 자동 실행 — 별도 터미널 X.

### 11.5 운영 환경 vs Emulator 차이점

| 항목 | Emulator (개발) | 운영 (Vercel + Firebase prod) |
|---|---|---|
| Firestore 인덱스 | 자동 생성 | `firestore.indexes.json` deploy 필수 |
| Auth 토큰 | 가짜 토큰 OK | 실 ID 토큰 verifyIdToken 검증 |
| 보안 규칙 | rules.json 적용 | 실 rules deploy 필수 |
| 데이터 영속 | 종료 시 휘발 (별도 export 안 하면) | 영속 |
| 카카오 OAuth | redirect URI 로컬호스트 | conatusipsi.com domain |
| 토스 결제 | **테스트 키만** 사용 | 라이브 키 |
| Anthropic API | 실 API 호출 (개발 키) | 운영 키 |

### 11.6 Emulator 데이터 영속화 (선택)

```bash
# 종료 시 자동 export
npx firebase emulators:start --export-on-exit ./tmp/emu-data --import ./tmp/emu-data
```

reproducible state 가 필요한 e2e 회귀에 유용. CI 에서는 `--import` 만 — 시드 일관성.

### 11.7 e2e 워크플로 분리 결정 (작업 3.4)

**옵션 A 채택**: e2e 는 4단계 smoke test 에서 분리.

- `npm run test`        — vitest 단위·통합 (smoke test 4단계 1번)
- `npm run test:e2e`    — Playwright (별도 명령)
- 향후 `.github/workflows/e2e.yml` PR 마다 자동 (별도 PR 신규)

**이유**:
- Emulator 시작 + 시드 + dev 서버 빌드 합산 약 3분 → 매 PR 머지마다 소요는 비효율
- e2e 는 회귀 보호의 마지막 망 — 시즌 직전 + Launch Blocker 머지 직전 수동 트리거로 충분

### 11.8 통합 검증 회귀 게이트

다음 시점에 본 절차 강제:
- [ ] **Launch Blocker #1** (`/admissions/[uid]/[did]`) 머지 직전
- [ ] **Launch Blocker #2** (`/admissions/jaeoegukmin`) 머지 직전
- [ ] **Launch Blocker #3** (`/admin/sanitize-monitor`) 머지 직전
- [ ] **시즌 진입 1주일 전** (2026.06 말)
- [ ] **권한 이관 검증** (setup.md §9.10)

각 게이트마다 `integration-test-log.md` 새 행 추가 + ✅ 100% 충족 확인.
