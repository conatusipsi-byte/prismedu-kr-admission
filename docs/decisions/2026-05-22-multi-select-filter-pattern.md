# 다중 선택(Multi-Select) 필터 패턴 (2026-05-22)

## 배경

QA round 1 (2026-05-22) 에서 발견된 두 결함이 같은 구조적 갭을 공유:

| ID | 위치 | 증상 |
|---|---|---|
| BUG-001 | `RegionFilter` ↔ `/api/admissions/search` | 다중 선택 UI 인데 `params.set("region", regions[0])` — 첫 항목만 전달. 게다가 라우트는 `region` 이라는 키를 아예 읽지 않아 필터가 **무시**됨. |
| BUG-010 | `TrackFilter` ↔ `/api/admissions/search` | 다중 선택 UI 인데 `params.set("trackKind", tracks[0])` — 첫 항목만 전달. 두 번째부터는 사용자가 토글해도 결과에 반영되지 않음. |

회귀 테스트(`REGION_GROUP_TO_CATEGORIES` 매핑 검증) 는 통과했지만, **View → fetch URL 빌더 → API** 의 통합 경계에 단언이 없어서 dead-mapping / 부분 전달이 prod 까지 흘러갔다.

## 결정 — 다중 선택 필터의 표준 형태

### 1. View → API 직렬화

다중 선택 UI 가 들고 있는 배열은 **콤마 구분 문자열** 하나로 `URLSearchParams` 에 실어 보낸다.

```ts
// ✅ DO
if (regions.length > 0) {
  const cats = Array.from(new Set(regions.flatMap((r) => REGION_GROUP_TO_CATEGORIES[r])));
  params.set("category", cats.join(","));
}
if (tracks.length > 0) {
  params.set("trackKind", tracks.join(","));
}

// ❌ DON'T
params.set("region", regions[0]);            // 다중 → 단일 정보 손실
params.set("trackKind", tracks[0]);
regions.forEach((r) => params.append("region", r));  // 서버 스키마와 어긋남
```

UI 도메인 (예: `RegionGroup` "서울권") 과 API 도메인 (예: `UniversityCategory` "seoul") 이 다르면 **View 가 매핑 함수를 명시적으로 호출**해서 변환 후 보낸다. 매핑이 dead 가 되지 않게.

### 2. Zod 스키마 — `transform` 으로 배열화

```ts
const VALID_X = ["a", "b", "c", "d"] as const;

x: z
  .string()
  .max(200)
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    const valid = parts.filter((p) => (VALID_X as readonly string[]).includes(p));
    return valid.length > 0 ? valid : undefined;
  })
```

요점:
- 단일 enum 이 아니라 **CSV string → array** transform.
- 유효하지 않은 값은 transform 단계에서 **silent drop** (400 으로 막지 않음 — 일부 토큰만 잘못된 경우에도 나머지로 검색 가능).
- 전부 invalid 면 `undefined` 반환 → 필터 미적용 의미.

### 3. 라우트 — DB-level 우선, 안 되면 post-filter `.some()`

가능하면 PostgREST `q.in("column", arr)` 로 DB 에서 필터링한다 (한도 적용 전).

```ts
// universities.category 같은 임베드 테이블 컬럼 — embed 경로 명시
if (query.category && query.category.length > 0) {
  q = q.in("universities.category", query.category);
}
```

`available_track_kinds` 처럼 **임베드된 배열 컬럼** 은 DB 단계 overlap 이 까다로우니 post-filter `.some()` 로:

```ts
if (query.trackKind && query.trackKind.length > 0) {
  const anyMatch = query.trackKind.some((tk) => availableTracks.includes(tk));
  if (!anyMatch) continue;
}
```

post-filter 만 쓸 경우 **limit 이 필터 전에 적용**돼서 좁은 카테고리(예: 특수대학 5곳) 가 결과 0개로 도착할 수 있음. DB-level 가능하면 항상 DB-level.

### 4. 통합 테스트 — View ↔ fetch URL 경계는 **반드시** 회귀 단언

단위 매핑 테스트만으로는 부족하다. `components/admissions/__tests__/*-filter-integration.test.tsx` 패턴:

```ts
function mockFetchEmptyOk() { /* global.fetch 교체, 200 반환 */ }

it("X + Y 다중 토글 → 콤마 구분으로 전달", async () => {
  render(<View />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("checkbox", { name: "X" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Y" }));

  const tokens = (lastParam("filter") ?? "").split(",").sort();
  expect(tokens).toEqual(["x", "y"]);
});
```

jsdom 은 `IntersectionObserver` 를 제공하지 않으므로 무한 스크롤 sentinel 이 있는 View 컴포넌트는 테스트 상단에서 stub 한다:

```ts
class MockIntersectionObserver { observe(){} unobserve(){} disconnect(){} takeRecords(){return [];} }
(globalThis as any).IntersectionObserver = MockIntersectionObserver;
```

### 5. dead-key 금지

스키마에 받는 키와 라우트가 읽는 키가 어긋난 채 머무르면 안 됨. BUG-001 의 `region: z.string().optional()` 같은 받기만 하는 키는 즉시 제거.

## 현재 상태 (2026-05-22)

| 필터 | UI 다중 선택 | View→API CSV | 스키마 transform→array | 회귀 테스트 (통합) | 상태 |
|---|---|---|---|---|---|
| `RegionFilter` | ✅ | ✅ (`category=`) | ✅ | ✅ `region-filter-integration.test.tsx` | BUG-001 fixed |
| `TrackFilter` | ✅ | ✅ (`trackKind=`) | ✅ | ✅ `track-filter-integration.test.tsx` | BUG-010 fixed |
| `UniversityCategoryFilter` (계열) | ✅ | ✅ (`trackCategory=`) | ✅ (선재 패턴) | ⚠️ 단위만, 통합 없음 | 후속에 통합 추가 권장 |

## 적용 책임

새 다중 선택 필터를 추가하는 PR 은 위 5개 항목을 모두 만족해야 한다. 코드 리뷰 시 통합 테스트 부재를 정식 reject 사유로 사용한다.
