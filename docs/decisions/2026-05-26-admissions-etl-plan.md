# 2026-05-26 — 모집요강 ETL 계획

**상태**: 계획 (착수 전, 별도 견적 가능성)
**관련 결함**: QA round 3 🟡 #2

---

## 1. 배경

`department_admissions` 테이블이 sparse 상태로 운영 진입 임박:

| 지표 | 값 |
|---|---|
| year=2027 admissions rows | **16** |
| active departments | 12,979 |
| 커버리지 | **0.12%** |

### 영향
- **검색 trackKind 필터** — DB pushdown 적용해도(QA round 3 🔴 #1 fix) admissions row 가 있는 학과만 매칭
- **학과 상세 페이지** — `admissions` undefined → "전형 정보 미등록" 문구
- **합격률 분석** — admissions 없으면 sample stats 도 없음 → "표본 부족" 폴백

시즌 진입(2026-07~) 전 보강 필수.

---

## 2. 수집 대상

### 출처
- 각 대학 입학처 모집요강 PDF (1차)
- KCUE 모집요강 통합 자료실 (대체)
- KICE 수능 시행 계획 (요건 정합성)
- 전년도 입결 (학교별 공식 발표 + 진학사·EBSi 등 검증 데이터)

### 데이터 모델 (현행 스키마 기준)
```ts
DepartmentAdmissions {
  universityId, departmentId, year,
  tracks: { [trackKind]: AdmissionTrack[] }, // 핵심
  availableTrackKinds: AdmissionTrackKind[],
  prevYearResult?: PrevYearResult,
  source: { url, publishedAt, parsedAt, parserVersion }
}
```

### 수집 항목 (전형당)
- 전형명·종류 (학생부교과/종합/논술/실기/정시 가/나/다/추가/재외국민)
- 모집 인원 (초기 + 이월 후)
- 단계별 평가 (1단계/2단계 + 반영 비율)
- 수능 최저 기준
- 응시 영역 기준 (탐구·수학 등)
- 일정 (원서접수·서류·면접·발표일)
- 전년도 입결 (경쟁률·합격선·등급컷)

---

## 3. 우선순위

### P1 — 시즌 진입 전 마감 (2026-07-15)
- SKY: 서울대·연세대·고려대 전 학과 (~100 학과)
- 의학계열: 의예·치의예·한의예·약학·수의예 (~80 학과)
- 인서울 명문: 서성한 + 중경외시 + 건동홍 (~250 학과)
- 거점국립 9곳 (~300 학과)
- 과학기술원 5곳 (KAIST/POSTECH/UNIST/GIST/DGIST) (~60 학과)

**총 ~790 학과** (= 사용자 검색 trafic 의 ~80% 추정)

### P2 — 시즌 중반 마감 (2026-08-31)
- 인서울 사립 전체 (~1,500 학과)
- 지방 거점국립 의대·약학
- 사관학교 4곳 + 경찰대

### P3 — 시즌 후반 마감 (2026-09-30)
- 지방 사립 top 50 추가 (~1,500 학과)
- 전문대학 일부 (사용자 수요 확인 후)

**P1+P2+P3 = ~3,800 학과** (active 12,979 의 30%) — 실제 입시 시장의 대부분

---

## 4. 작업 방식

### A. 자동 PDF 파싱 (권장)

```
모집요강 PDF (Public URL or 업로드)
  → Anthropic Claude API (extended thinking + structured output)
  → JSON schema validation (zod)
  → admissions_staging 테이블 (parser_trust_level='trusted')
  → admin/etl-status 페이지에서 시각 검수
  → department_admissions 로 promote
```

**기존 인프라 활용**:
- `app/api/admin/etl/promote/` — staging → admissions promote (이미 존재)
- `admin/etl-upload` — PDF 업로드 (이미 존재)
- `admin/etl-status` — 검수 (이미 존재)

**비용 추정**:
- PDF 평균 30 페이지, ~$0.10/PDF (Claude Sonnet 4.6)
- 321 대학 × 평균 4 PDF (모집·정시·수시·지정) = ~1,300 PDF × $0.10 = **$130** (~18만원)
- 추가 검수·재처리 여유: $50 = **합계 $180 (~25만원)**

**작업 시간**:
- 파서 스크립트 작성·테스트: 3일
- 1차 일괄 처리 (전체 학교): 1일 (Anthropic API rate limit 고려)
- 시각 검수 + 재처리: 5일
- **총 ~9일**

### B. 입시기관 데이터 API
- 진학사·메가스터디·EBSi 등 라이선스
- 비용: 월 50~200만원 (라이선스 협상 필요)
- 정확도: 95%+
- 한계: 계약·승인 시간 (2~4주)

### C. 수동 입력
- 학과당 평균 5분 × 3,800 = **316시간** = 비현실적 (운영자 1명 풀타임 8주)

🎯 **권장: 방식 A + admin 시각 검수**

---

## 5. 견적 분리

### 본 작업(컨설팅 + 사이트 구축, 200만원)이 ETL 을 포함하는지

**현 견적 해석**:
- "사이트 구축 + 컨설팅 모듈" — 인프라·코드·UI ✅ 완료
- 데이터 수집은 별도 작업 (출처·라이선스·검수 인력 필요)

### 클라이언트 선택지

| 선택 | 비용 | 시간 | 정확도 |
|---|---|---|---|
| **A**: 클라이언트 직접 ETL (Anthropic 키 제공) | $180 + 시간 | ~9일 | ~85% (검수 후 95%) |
| **B**: 별도 견적 (Claude Code 가 ETL 실행) | 추정 200~400만원 + API 비용 | ~9일 | 동일 |
| **C**: 1차 출시 sparse 유지 | 0 | 즉시 | 0.12% (현재) |
| **D**: 입시기관 API 라이선스 | 월 50~200만원 | 협상 2~4주 | 95%+ |

→ **클라이언트와 협의 후 결정 필요**

---

## 6. 폴백 UX (현재 적용 중)

ETL 완료 전까지 유지:

| 영역 | 폴백 |
|---|---|
| 학과 상세 | "전형 정보 미등록" 문구 (P-002) |
| 합격률 분석 | "표본 부족 — 미공개" 카드 (sample-gate) |
| 검색 trackKind 필터 | DB pushdown 적용됨 — admissions 있는 학과만 매칭 |
| PrevYearResultCard | 데이터 없을 때 "전년도 입결 데이터가 아직 수집되지 않았습니다" |

모두 정직성 원칙 적용 — placeholder 데이터·임의 추정 X.

---

## 7. 실행 시 체크리스트 (선택 A 또는 B 채택 시)

1. [ ] PDF 출처 명세서 작성 (대학별 URL 목록)
2. [ ] PDF 다운로드 스크립트 (`scripts/etl/download-admissions-pdfs.ts`)
3. [ ] 파서 스크립트 (`scripts/etl/parse-admissions-pdf.ts`) — Anthropic API
4. [ ] zod schema 정합성 검증
5. [ ] staging → promote pipeline 테스트 (P1 학교 1개로 dry-run)
6. [ ] 전체 P1 학교 처리
7. [ ] admin/etl-status 시각 검수
8. [ ] department_admissions 일괄 promote
9. [ ] 검색·상세 페이지 시각 검수
10. [ ] 회귀 테스트 — trackKind 필터가 매칭 학교 다수 surface 확인

---

## 8. 정직성 (P-002)

- 0.12% 커버리지 사실 명시 — 사용자에게 "전형 정보 준비 중" 솔직 안내
- 자동 파서 정확도 ~85% 명시 — 검수 단계 필수
- placeholder 데이터 절대 X — sparse 한 채로 출시하더라도 정직 우선
- 견적 분리 명확 — 사이트 구축과 데이터 수집은 다른 작업
