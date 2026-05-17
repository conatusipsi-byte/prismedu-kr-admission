# US 데이터 → 한국 데이터 마이그레이션 감사

**작성일**: 2026-05-14
**목적**: prismedu.kr(미국 입시 사이트)에서 포팅된 코드 중 미국 학교 데이터에 의존하는 파일을 식별하고, 한국 입시 사이트 전환 시 손볼 곳을 정리.
**스코프**: 이 사이트 코드베이스(`/workspaces/prismedu-kr-admission`) 전수 grep 분석.

---

## TL;DR

**결과는 예상보다 훨씬 깔끔합니다.**
US 데이터·스키마는 사실상 **dead code** — 외부 import 0건. 한국 도메인 코드(`lib/schemas/api/*`, `lib/matching-kr.ts`, `types/admission.ts`)가 이미 모든 운영 경로를 차지하고 있음.

**진짜로 손볼 곳은 단 1군데**: `lib/auth-context.tsx:17` 의 `Specs` 타입 import (type-only). 이걸 `KrSpecsInput`로 교체하면 US 흔적은 거의 사라짐.

---

## 1. Dead code — 외부 import 0건 (안전 삭제 가능)

| 경로 | 크기 | 역할 (포팅 당시) | 외부 import |
|---|---:|---|---:|
| `lib/school.ts` | 17줄 | SCHOOLS 상수 (1.3MB JSON 래핑) | **0** |
| `lib/schools-index.ts` | 68줄 | 클라이언트 학교 인덱스 (use client) | **0** |
| `lib/university-rubric.ts` | 62줄 | Top 20 대학 에세이 rubric | **0** |
| `lib/schemas.ts` | 126줄 | US 입력 zod 스키마 (ProfileSchema, EssayOutlineInputSchema 등) | **0** |
| `lib/match-cache.ts` | — | 미국 매칭 캐시 | **0** |
| `lib/school-search.ts` | — | schoolMatchesQuery (학교명 검색 유틸) | **0** |
| `data/schools.json` | 1,290 KB | US 1001개 대학 데이터 (Princeton/Harvard 등) | `lib/school.ts`만 |
| `data/schools-index.json` | 194 KB | 클라이언트 인덱스 사본 | `lib/schools-index.ts`만 |
| `data/admission-seed.json` | 49 KB | US 합격 사례 32건 | **0** |
| `data/university-rubrics.json` | 50 KB | US Top 20 rubric 데이터 | `lib/university-rubric.ts`만 |

**검증 명령** (재현):
```bash
grep -rln "from \"@/lib/school\"" app/ components/ lib/ | grep -v node_modules
grep -rln "from \"@/lib/schemas\"" app/ components/ lib/ | grep -v node_modules
# … 위 표의 각 lib/ 파일에 대해 동일 패턴
```

---

## 2. type-only 의존 — 한국 타입으로 교체 필요

| 경로 | 라인 | 의존 종류 | 교체 대상 |
|---|---:|---|---|
| `lib/auth-context.tsx` | 17 | `import type { Specs } from "./matching";` | `KrSpecsInput` (`lib/schemas/api/match.ts`) |
| `lib/auth-context.tsx` | 51 | `specs?: Specs` (인터페이스 필드) | `specs?: KrSpecsInput` |

**영향 범위**: `auth-context.tsx`는 6개 파일에서 import.
- `app/layout.tsx`
- `app/profile/ProfileView.tsx`
- `app/dashboard/DashboardView.tsx`
- `app/login/LoginView.tsx`
- `components/access/ProGate.tsx`
- `components/nav/PublicNav.tsx`

그러나 위 6개 중 실제로 `specs` 필드를 읽는 곳은 별도 grep 필요. 대부분은 `useAuthContext()` 의 `user`·`isAuthenticated` 같은 다른 필드만 사용할 가능성 높음.

---

## 3. lib/matching.ts (US 매칭 본체, 15KB)

`lib/matching.ts` 는 prismedu.kr 의 미국 입시 매칭 알고리즘 본체. 본 사이트에서는 **`Specs` 타입만 type-import** 로 살아있고, 실 함수(`matchSchools` 등)는 호출되지 않음.

`lib/matching-kr.ts` (597줄, 한국화 어댑터) 가 운영 경로를 차지함 — `/api/match/route.ts`에서 호출.

**처분 옵션**:
- (A) `lib/matching.ts` 전체 삭제 + `auth-context.tsx` 의 `Specs` → `KrSpecsInput` 교체
- (B) 보존 후 `// @deprecated` 주석 추가 (prismedu.kr 회귀 참고용)
- (C) 그대로 둠 (현재 상태 — 비용 0, 위험 0)

→ **클라이언트 응답 후 (A) 권장**. 지금 삭제하지 않는 이유: PDF 파싱 normalizer 보강 시 영문 식별자 매핑 등에서 일부 코드가 참고될 가능성 있음.

---

## 4. 안전한 삭제 순서 (실행 시점은 클라이언트 응답 후)

```
1단계 — 0 위험:
  rm lib/match-cache.ts            # importer 0
  rm lib/school-search.ts          # importer 0
  rm data/admission-seed.json      # importer 0
  rm data/university-rubrics.json  # lib/university-rubric.ts 만 의존
  rm lib/university-rubric.ts      # importer 0

2단계 — schools.json 의존성 끊기:
  rm lib/schools-index.ts          # importer 0
  rm data/schools-index.json       # importer 0
  rm lib/school.ts                 # importer 0
  rm data/schools.json             # 1.3MB 절약

3단계 — US 스키마:
  rm lib/schemas.ts                # importer 0

4단계 — type-only 의존 끊기 (코드 수정):
  lib/auth-context.tsx:
    -import type { Specs } from "./matching";
    +import type { KrSpecsInput as Specs } from "@/lib/schemas/api/match";
  # (또는 alias 없이 그대로 KrSpecsInput 사용)

5단계 — US 매칭 본체:
  rm lib/matching.ts
```

각 단계마다 `npm run typecheck && npm run build` 로 회귀 확인 권장.

---

## 5. 마이그레이션과 무관한 한국 도메인 코드 (참고)

확실히 한국 입시용으로 작성됨 — 손댈 필요 없음:

- `lib/matching-kr.ts` — 한국 등급 체계 매칭 알고리즘 (597줄)
- `lib/schemas/api/*.ts` — 한국 입시 API 스키마 (match, admissions, chat, payment 등)
- `lib/admission/*.ts` — 한국 입시 도메인 헬퍼 (sample-gate, jaeoegukmin-eligibility 등)
- `lib/anthropic.ts` — Plan 별 한국 카운슬러 호출
- `types/admission.ts` — 한국 Firestore 스키마 타입
- `scripts/etl/*` — 한국 모집요강 PDF 파싱 (parse-pdfs.ts + parsers/)

---

## 6. 작업 권장 시점

- **지금**: 본 문서 작성으로 마이그레이션 부담을 사전에 가시화. 코드 변경은 보류.
- **클라이언트 데이터 방안 확정 후**: 1~4단계 일괄 진행 (1 PR). 빌드·타입체크·테스트 그린 확인.
- **운영 가동 후**: 5단계 (lib/matching.ts) 검토.

소요 시간 예상: **순수 코드 작업 1시간 이내**. 회귀 검증·빌드 합쳐 반나절.
