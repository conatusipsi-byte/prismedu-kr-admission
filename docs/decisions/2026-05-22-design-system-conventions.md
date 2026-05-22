# Design System Conventions (2026-05-22)

## 배경

QA round 1 의 🟢 사소 3건 (BUG-007 / BUG-008 / BUG-009) 모두 **디자인 시스템 일관성** 영역.
한 결함이 다 다른 컴포넌트라 모아 보면 패턴이 보이는데, 개별 컴포넌트만 보면 잡기 어려운 종류.
이번에 박제해 두지 않으면 같은 결함이 반복될 가능성이 높음.

## 결정 — 4가지 컨벤션

### 1. 카드 강조 패턴 (BUG-007)

`/` 의 "왜 Conatus" 섹션에서 카드 3개가 카드별로 다른 hover 톤 (brand/iris/amber) 을 갖고 있었음
→ QA 가 첫 카드만 "그린 ring 강조" 처럼 인식. 의도된 강조였는지 의문 발생.

**룰**:
- 같은 row/grid 안의 카드들은 **rest + hover 스타일이 동일**해야 한다. 시각적 정체성은 카드 안의 아이콘·decoration 색으로 자연스럽게 표현.
- 첫 카드를 진짜로 강조하려면 **명시 라벨** 사용 (`<Badge>코어</Badge>` 같은 텍스트 시그널). 색 차이만으로는 의도 전달 X.
- 권장 hover: `hover:-translate-y-1 hover:border-foreground/15 hover:shadow-lg dark:hover:border-foreground/25` (중성).
- 브랜드 톤 hover (`hover:border-brand-300 hover:shadow-glow-brand`) 는 **단일 브랜드 카드** 또는 **CTA 카드** 에만 사용.

### 2. focus-visible 표준 (BUG-008, WCAG 2.1 SC 2.4.7)

기존 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500` 패턴은:
- 알파 없음 → 선택 상태(brand-600 bg) 와 시각 구분 약함
- offset 없음 → ring 이 chip 외곽과 붙어 인식 약함
- 다크모드 variant 없음

**신 표준** (모든 interactive element 에 적용):

```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-brand-500/60
focus-visible:ring-offset-2
focus-visible:ring-offset-background
dark:focus-visible:ring-brand-400/70
```

요점:
- `60-70% alpha` — chip 의 selected 상태(brand-600 solid) 와 시각 분리
- `ring-offset-2` + `ring-offset-background` — 깔끔한 외곽 분리, 부모 컨테이너 배경에 자동 매치
- 라이트는 `brand-500/60`, 다크는 `brand-400/70` — 양쪽 배경에서 콘트라스트 보장
- **`focus:` 가 아니라 `focus-visible:`** — 마우스 클릭 시 ring 표시 X, 키보드 탭 시에만 표시

적용 책임: 새로운 클릭 가능 요소 (button/Link/role=checkbox 등) 추가 시 반드시 이 패턴 사용. 코드 리뷰에서 `focus:` 없거나 `outline-none` 단독 사용은 reject.

### 3. 다크모드 그라디언트 variant (BUG-009)

`/` Hero 의 `최적의 지원 전략` 그라디언트가 다크 모드에서 한 어절이 흰색에 가깝게 보임.

**원인**: 라이트 그라디언트 stop 사이 hue interpolation 이 채도 낮은 zone 을 통과하며 wash 효과.
다크 배경 + extrabold 폰트 두께가 합쳐져 사용자에게 "거의 흰색" 으로 인식됨.

**룰**:
- `bg-clip-text + linear-gradient` 텍스트는 **반드시 `dark:` variant 별도 정의**.
- 다크 variant 는 단순 stop lightness 만 올리지 말고 **중간 stop 1-2개 추가** (cyan 권장) 로 hue 흐름을 saturated 하게 유지.
- 라이트는 보통 3-stop, 다크는 5-stop seamless loop 가 안전.

**참고 패턴** (Final CTA P0-06 + Hero BUG-009 동일):

```tsx
// 정적 (애니메이션 없음) — 단일 클래스 + dark variant
<span className="
  bg-clip-text text-transparent
  [background-image:linear-gradient(135deg,hsl(160_84%_39%)_0%,hsl(243_91%_73%)_50%,hsl(265_84%_65%)_100%)]
  dark:[background-image:linear-gradient(135deg,hsl(156_72%_70%)_0%,hsl(180_80%_72%)_45%,hsl(243_91%_78%)_75%,hsl(265_84%_72%)_100%)]
" />

// shimmer 애니메이션 — bg-[length:200%_auto] 필수, 다크는 5-stop seamless loop
<span className="
  bg-clip-text text-transparent animate-text-shimmer bg-[length:200%_auto]
  [background-image:linear-gradient(90deg,hsl(160_84%_39%),hsl(243_91%_73%),hsl(160_84%_39%))]
  dark:[background-image:linear-gradient(90deg,hsl(156_72%_70%),hsl(180_80%_72%),hsl(243_91%_78%),hsl(180_80%_72%),hsl(156_72%_70%))]
" />
```

Tailwind 임의 값에서 공백은 `_` 로 치환. `style={{ backgroundImage: ... }}` inline 으로 쓰면 `dark:` 분기가 불가능하니 **className arbitrary 로 강제**.

### 4. WCAG 2.1 준수 기준

| SC | 기준 | 컨벤션 |
|---|---|---|
| 1.4.3 (Contrast) | 본문 텍스트 4.5:1, 큰 텍스트 3:1 이상 | 그라디언트 텍스트도 최소 stop 의 lightness 가 라이트 39%/다크 70% 이상 |
| 2.4.7 (Focus Visible) | 모든 인터랙티브 요소에 focus indicator | 위 #2 표준 적용 |
| 1.4.11 (Non-text Contrast) | UI 컴포넌트 외곽 3:1 | `border-border` 충분, ring 은 알파 60% 로 콘트라스트 확보 |

## 적용 범위 (2026-05-22 현재)

| 영역 | 상태 |
|---|---|
| `/` Hero gradient | ✅ BUG-009 적용 |
| `/` Final CTA gradient | ✅ 이전부터 P0-06 으로 적용 |
| `/not-found` 404 텍스트 | ✅ BUG-009 같이 적용 |
| `/admissions` 3종 필터 chip | ✅ BUG-008 적용 |
| `/admissions` DepartmentCard | ✅ BUG-008 같이 적용 |
| `/` 카드 hover (왜 Conatus) | ✅ BUG-007 적용 (중성 hover) |
| 다른 그라디언트 텍스트·focus indicator | 후속 — 본 컨벤션 적용 권장 |

## 적용 책임

- 새 텍스트 그라디언트 추가 시 `dark:` variant 의무.
- 새 인터랙티브 요소에 위 focus-visible 표준 의무.
- 같은 grid 안 카드 hover 톤 분기 시 라벨로 의도 명시.

코드 리뷰에서 위 3개 모두 reject 사유. 본 문서 링크해서 코멘트.
