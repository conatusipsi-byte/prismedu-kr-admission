# 통합 검증 로그 (수동) — /admissions 검색

본 문서는 **사용자 환경에서** Firebase Emulator + dev 서버를 띄우고 수동으로 검증한 결과를 기록하는 템플릿. PR 머지 직전 갱신 권장.

> ⚠️ **본 PR 환경에서는 실행되지 않았습니다** (Java JRE 미설치). 사용자 환경에서 실행 후 결과를 본 문서에 채워 머지 게이트로 활용.

---

## 사전 조건

- Java JRE 11+ 설치 (Emulator 의존)
- `npm install` 완료
- `.env.local` 에 `NEXT_PUBLIC_USE_EMULATOR=true`

```bash
# 한 번에 시작
npm run dev:emu      # Windows pwsh
# 또는
bash ./scripts/dev-with-emulator.sh   # macOS/Linux
```

기대 결과: Emulator UI(http://localhost:4000) + dev 서버(http://localhost:9002) 동시 동작.

---

## 검증 대상 — /admissions 검색 9개 시나리오

각 시나리오 결과를 `결과` 컬럼에 ✅/❌ 로 기록. 실패 시 `메모` 에 사유.

| # | 시나리오 | 기대 결과 | 결과 | 메모 |
|---|---|---|---|---|
| 1 | 빈 검색바 + 빈 필터 → /admissions 접속 | 서울대 의예과 카드 1건 노출 (시드 데이터) | ⏸ 미실행 | |
| 2 | 검색바 "서울" 입력 (디바운스 300ms 후) | 의예과 카드 노출 | ⏸ 미실행 | |
| 3 | 검색바 "ㅅㅇ" 입력 (초성 검색) | 의예과 카드 노출 (`extractChoseong` 동작) | ⏸ 미실행 | |
| 4 | 검색바 "고려" 입력 | 결과 0건 EmptyState | ⏸ 미실행 | |
| 5 | RegionFilter "서울권" 선택 | 의예과 카드 노출 (서울대=`seoul_top`) | ⏸ 미실행 | |
| 6 | RegionFilter "지방거점" 선택 | 결과 0건 | ⏸ 미실행 | |
| 7 | TrackFilter 비선택 (디폴트) | 일반 트랙만 노출. **재외국민 옵션 자체 미노출** (P-013) | ⏸ 미실행 | |
| 8 | UniversityCategoryFilter "의약" 선택 | 의예과 노출 (Department.track=medical) | ⏸ 미실행 | |
| 9 | 의예과 카드 클릭 | `/admissions/snu/med` 이동 (404 — 상세 페이지 후속 PR) | ⏸ 미실행 | |

---

## 에러 케이스 시나리오

| # | 시나리오 | 기대 결과 | 결과 | 메모 |
|---|---|---|---|---|
| E1 | Emulator 종료 상태에서 /admissions 접속 | ErrorBoundary fallback (`error.tsx`) 또는 빈 결과 | ⏸ | |
| E2 | `?limit=999` 쿼리 | 400 (Zod max 50 초과) | ⏸ | |
| E3 | `?category=invalid` 쿼리 | 400 (Zod enum 위반) | ⏸ | |

---

## P-001 정책 회귀 (수동)

본 PR 의 자동 회귀 테스트(`p-001-policy.test.tsx`)는 컴포넌트 단위만. 페이지 레벨 회귀 수동 검수:

| # | 항목 | 결과 | 메모 |
|---|---|---|---|
| P1 | 카드에 결제 키워드 0개 (브라우저 DevTools > Console: `document.body.textContent.match(/업그레이드|결제|구독|구매|유료/g)`) | ⏸ | |
| P2 | 카드에 % 수치 0개 | ⏸ | |
| P3 | 비로그인 상태로 카드 클릭 → 학과 상세 정형 정보 무료 노출 | ⏸ | |
| P4 | 표본 부족 카드(시드 데이터 추가 후): 자물쇠 아이콘 X, Clock 아이콘 ✅ | ⏸ | |

---

## 갱신 이력

- YYYY-MM-DD: 본 템플릿 작성 (PR #N) — 모든 시나리오 ⏸ 미실행
- YYYY-MM-DD: 사용자 환경 1차 검증 — 결과 채움
