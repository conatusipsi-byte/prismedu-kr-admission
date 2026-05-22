# Disabled / Coming-Soon UI 패턴 (2026-05-22)

## 배경

QA round 1 (2026-05-22) 의 BUG-005·BUG-006 모두 같은 안티패턴이 원인이었음:

| ID | 페이지 | 안티패턴 |
|---|---|---|
| BUG-005 | `/payment` | 결제 인프라(`NEXT_PUBLIC_TOSS_CLIENT_KEY`) 미설정인데 결제 버튼이 활성처럼 보임 → **클릭한 뒤에야** 에러 토스트로 "결제 설정이 아직 완료되지 않았어요" 표시. |
| BUG-006 | `/pricing` | 비교표에 "1:1 컨설팅" 컬럼은 있는데 상단 카드 영역에는 없음. consult_one 이 `enabled=false` placeholder 라 `listEnabledProductsKr()` 에서 제외 — 사용자에겐 "어디서 사지?" 의문만 남김. |

두 결함 모두 **의도된 비활성 상태를 사용자에게 미리 말해주지 않은 P-002 정직성 위반**.

## 결정 — 표준 형태

### 1. 비활성 상태는 **렌더 시점에** 명시한다

클릭 직전까지 활성처럼 보이게 두지 않는다. CTA 가 작동 안 할 거라는 사실이 환경/데이터/시간에 의해 미리 결정되면, **렌더 단계에서** 이를 표현한다.

### 2. 시각 / 의미 / 행동 — 3종 세트

| 측면 | 표준 |
|---|---|
| 시각 (CSS) | `opacity-60 ~ 70`, `cursor-not-allowed`, hover 효과 무효화 |
| 라벨 | 활성 라벨에 짧은 접미사 — `결제하기 (준비 중)` / `출시 예정` / `로그인 후 사용` |
| 의미 (a11y) | `disabled` (HTML attribute) + `aria-disabled="true"` 둘 다 |
| 사유 안내 | 카드 본문에 1-2줄 텍스트로 **왜** 비활성인지 명시 — 클릭 전에 보여줌 |
| 시간성 | 출시 예정 일자 알면 명시 — `5/28 출시 예정`. 모르면 `출시 예정` |
| 셀렉터 | `data-disabled="true"` 또는 `data-coming-soon="true"` 로 E2E 안정성 |

### 3. 코드 패턴

#### 결제 버튼 (BUG-005)

```tsx
<Button
  type="button"
  disabled={disabled}
  aria-disabled={disabled}
  className={cn(
    "w-full bg-brand-600 hover:bg-brand-700",
    disabledReason && !pending && "cursor-not-allowed opacity-60 hover:bg-brand-600",
  )}
>
  {pending ? "결제창 여는 중…" : disabledReason ? "결제하기 (준비 중)" : "결제하기"}
</Button>
{disabledReason && (
  <div className="rounded-md border ... text-2xs ...">{disabledReason}</div>
)}
```

#### 출시 예정 카드 (BUG-006)

```tsx
const comingSoon = !product.enabled;
const comingSoonLabel = COMING_SOON_DATES[product.kind] ?? "출시 예정";
// ...
<article data-component="pricing-card" data-coming-soon={comingSoon} ...>
  <header>
    <h2>{product.displayName}</h2>
    {comingSoon && <Badge variant="pill-amber">{comingSoonLabel}</Badge>}
  </header>
  <div>{comingSoon ? <span>준비 중</span> : <span>₩{price}</span>}</div>
  {comingSoon
    ? <Button disabled aria-disabled className="cursor-not-allowed opacity-70">출시 예정</Button>
    : <Button asChild><Link href="/payment">결제하러 가기</Link></Button>
  }
</article>
```

### 4. P-002 정직성과의 관계

- **₩0 같은 임의 숫자 노출 금지** — 정해지지 않은 가격은 `준비 중` 텍스트로 표현. `0` 은 "무료" 를 의미해버려서 사용자 오해 위험.
- **alert 토스트 사후 알림 금지** — 클릭 전 정직 표시. 클릭하면 안 되는 것은 클릭이 안 되어야 함.
- **언제 가능해지는지 명시** — "준비 중" 만 두지 말고 가능하면 출시 일자. 사용자 기대 형성.

### 5. 환경 의존 비활성 (Payment infra 케이스)

`NEXT_PUBLIC_*` 환경 변수는 빌드 타임에 클라 번들로 인라인 → 클라 컴포넌트 최상단에서 안전하게 평가 가능:

```ts
const PAYMENT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
const NOT_CONFIGURED_REASON = "사업자 등록 완료 후 활성화됩니다 (출시 준비 중)";
```

서버 비밀(예: `TOSS_SECRET_KEY`) 의존 비활성은 별도 API endpoint (`/api/payment/status`) 로 표현하거나 SSR prop 으로 내려보낼 것.

### 6. 회귀 테스트 표준

`components/.../__tests__/disabled-states.test.tsx` 패턴:

- 활성 상태 라벨/속성 (대조군)
- 비활성 상태 라벨/속성 (`disabled`, `aria-disabled`, 사유 텍스트)
- 클릭 핸들러 미호출 검증
- `data-` 셀렉터 stability 확인

E2E 통합 (Playwright) 은 prod 배포 후 curl 셀렉터 확인으로 보완.

## 현재 상태 (2026-05-22)

| 영역 | 패턴 적용 | 후속 |
|---|---|---|
| `/payment` ProductCard | ✅ BUG-005 | TOSS_SECRET_KEY 의존 별도 분기는 후속 |
| `/pricing` PricingCard (consult_one) | ✅ BUG-006 | 가격 확정 시 `enabled=true` 로 전환 — 본 패턴은 자동 비활성화됨 |
| `/admissions/...` ProbabilityTab anonymous CTA | ⚠️ 이미 적용 — Sparkles + "로그인하고 분석 시작" Link 형태 (disabled 가 아닌 다른 분기) |
| 다른 placeholder/coming-soon (예: 학과 비교, 즐겨찾기) | 후속 — 본 패턴으로 통일 |

## 적용 책임

새 CTA 가 환경/데이터/시간에 의해 비활성 가능성이 있으면 위 5 항목을 모두 만족해야 한다. 코드 리뷰는 (b) 사유 안내·(c) 데이터 속성을 제일 빠뜨리기 쉽다 — 정식 reject 사유로 사용.
