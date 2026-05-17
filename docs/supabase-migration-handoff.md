# Supabase 마이그레이션 — 핸드오프 (Phase 4~6 남음)

**작성일**: 2026-05-14
**현 상태**: Phase 0~3 완료 (인증·스키마·wrapper 등 기반). Phase 4~6은 다음 세션에서 진행.
**예상 잔여 작업**: 1~2일 풀타임 (라우트 22개 + 테스트 회귀 + Firebase 정리)

---

## ✅ 완료된 작업

| Phase | 산출물 | 검증 |
|---|---|---|
| 0. CLI/프로젝트 | `supabase/` 폴더, link, PAT 동작 | `npx supabase projects list` 정상 |
| 1. 스키마 | 16 테이블 + RLS, 4개 마이그레이션 적용 | `npx tsx scripts/verify-supabase-schema.ts` 15/15 정상 |
| 2. Wrapper | `lib/supabase.ts`, `lib/supabase-server.ts` | typecheck 통과 |
| 3. Auth | `lib/api-auth.ts`, `lib/auth-context.tsx`, `middleware.ts`, `/api/auth/session`, `/auth/callback` | typecheck 통과, middleware 21/21 테스트 그린 |

**적용된 마이그레이션** (`supabase/migrations/`):
- `20260514094613_initial_schema.sql` — 15 핵심 테이블
- `20260514094836_rls_policies.sql` — RLS 정책
- `20260514095244_admins_table.sql` — 운영자
- `20260514095716_profiles_table.sql` — 사용자 프로필 + 자동 생성 트리거

---

## 🔄 남은 Phase 4 — API 라우트 22개 Firestore → Supabase

### 변환 우선순위

#### 🔴 Critical (출시 핵심)
| 라우트 | 줄수 | Firestore 호출 | 비고 |
|---|---:|---:|---|
| `app/api/match/route.ts` | 316 | 6 | 합격률 분석 핵심 |
| `app/api/chat/route.ts` | 363 | 9 | AI 카운슬러 |
| `app/api/payment/confirm/route.ts` | ~300 | 3 | 결제 승인 idempotency |
| `app/api/payment/request/route.ts` | — | 3 | 결제 요청 |
| `app/api/payment/cancel/route.ts` | — | 3 | 결제 취소 |
| `app/api/compare/route.ts` | 314 | 4 | 대학 비교 |

#### 🟡 High
| 라우트 | Firestore 호출 |
|---|---:|
| `app/api/planner/route.ts` | 6 |
| `app/api/orders/route.ts` | 2 |
| `app/api/user/dashboard/route.ts` | 4 |
| `app/api/match/simulate/route.ts` | 5 |
| `app/api/match/[id]/route.ts` | 2 |
| `app/api/spec-analysis/route.ts` | 2 |
| `app/api/admissions/search/route.ts` | 2 |

#### 🟢 Admin (운영용, 출시 후 보강 가능)
| 라우트 |
|---|
| `app/api/admin/kpi/route.ts` |
| `app/api/admin/orders/route.ts` |
| `app/api/admin/users/route.ts` |
| `app/api/admin/users/[uid]/route.ts` |
| `app/api/admin/sample-stats/route.ts` |
| `app/api/admin/etl-upload/route.ts` |
| `app/api/admin/etl-status/route.ts` |
| `app/api/admin/etl-promote/route.ts` |
| `app/api/admin/sanitize-monitor/route.ts` |

---

### 변환 패턴 치트시트

#### Imports
```ts
// Before
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// After
import { getAdminSupabase } from "@/lib/supabase-server";
```

#### 단일 도큐먼트 조회
```ts
// Before
const snap = await db.collection("orders").doc(orderId).get();
if (!snap.exists) return notFound();
const order = snap.data() as Order;

// After
const { data: order, error } = await sb
  .from("orders")
  .select("*")
  .eq("id", orderId)
  .maybeSingle();
if (error || !order) return notFound();
```

#### 도큐먼트 생성/갱신 (set with merge)
```ts
// Before
await db.collection("orders").doc(orderId).set({ status: "approved" }, { merge: true });

// After (upsert by primary key)
await sb.from("orders").upsert({ id: orderId, status: "approved" });

// Or update existing
await sb.from("orders").update({ status: "approved" }).eq("id", orderId);
```

#### 서버 타임스탬프
```ts
// Before
createdAt: FieldValue.serverTimestamp()

// After — Postgres default `now()` 가 처리. 명시적으로는:
createdAt: new Date().toISOString()
// 또는 컬럼 default 활용 — 아예 안 보내면 DB 가 채움
```

#### 증가 카운터
```ts
// Before
await db.collection("rate_limits").doc(key).update({ count: FieldValue.increment(1) });

// After
await sb.rpc("increment_counter", { row_key: key, delta: 1 });
// 또는 raw SQL — RLS bypass 위해 service_role:
await sb.from("rate_limits").update({ count: prev.count + 1 }).eq("rate_key", key);
```
※ `increment_counter` RPC 함수를 별도 마이그레이션으로 추가 필요 — Postgres atomic UPDATE.

#### collectionGroup → 단일 테이블
```ts
// Before
const snap = await db.collectionGroup("departments")
  .where("active", "==", true)
  .orderBy("updatedAt", "desc")
  .limit(60).get();

// After
const { data } = await sb.from("departments")
  .select("*")
  .eq("active", true)
  .order("updated_at", { ascending: false })
  .limit(60);
```

#### where + multi-key + 정렬
```ts
// Before
.where("uid", "==", auth.uid)
.where("status", "==", "approved")
.orderBy("createdAt", "desc")

// After
.eq("user_id", auth.uid)   // 컬럼명 snake_case 주의
.eq("status", "approved")
.order("created_at", { ascending: false })
```

#### Subcollection → 별도 컬럼 또는 별도 테이블
```ts
// Before — Firestore subcollection
await db.collection("users").doc(uid).collection("entitlements").doc("current").get();

// After — root table 로 평탄화 (스키마 이미 그렇게 설계됨)
await sb.from("user_entitlements").select("*").eq("user_id", uid).maybeSingle();
```

---

## 🔄 Phase 5 — Storage 마이그레이션 (소규모)

Firebase Storage 사용처:
- `firestore.rules` 가 아닌 `storage.rules` 정의
- 이미지 업로드 (로고 등) — 검색 필요

### 작업
1. Supabase Storage 에 버킷 생성 — 콘솔 또는 CLI:
   ```bash
   SUPABASE_ACCESS_TOKEN=$PAT npx supabase storage buckets create logos --public
   ```
2. 업로드 코드 — `supabase.storage.from("logos").upload(path, file)`
3. `storage.rules` → Supabase Storage 정책으로 이전

---

## 🔄 Phase 6 — Firebase 의존 제거 + 테스트 회귀

### 단계
1. **Firebase 패키지 제거**:
   ```bash
   npm uninstall firebase firebase-admin firebase-tools
   ```
2. **Firebase 설정 파일 삭제**:
   ```bash
   rm firebase.json firestore.rules firestore.indexes.json storage.rules
   ```
3. **`.env.local` Firebase 섹션 제거** (NEXT_PUBLIC_FIREBASE_*, FIREBASE_ADMIN_*)
4. **dead 파일 삭제** (`docs/us-data-migration-audit.md` 참조):
   ```bash
   rm lib/firebase.ts lib/firebase-admin.ts
   rm lib/matching.ts lib/match-cache.ts lib/school.ts lib/school-search.ts \
      lib/schools-index.ts lib/university-rubric.ts lib/schemas.ts
   rm data/schools.json data/schools-index.json data/admission-seed.json data/university-rubrics.json
   ```
5. **테스트 회귀**: `npm run test && npm run test:e2e`
   - 31개 단위 테스트 + 4개 e2e
   - mock 패턴이 Firestore 기반인 경우 Supabase mock 으로 갱신

---

## ⚠️ 클라이언트(또는 사용자) Supabase Console 작업

PAT 으로 일부는 자동화 가능하지만 OAuth provider 의 키는 별도로 받아야 함:

| 작업 | 위치 | 비고 |
|---|---|---|
| 카카오 OAuth Provider 활성화 | Supabase Console → Authentication → Providers → Kakao | Client ID + Secret 입력 — kakao.developers 에서 별도 발급 |
| 카카오 앱 redirect URI 설정 | kakao.developers → 내 애플리케이션 → 카카오 로그인 | `https://{ref}.supabase.co/auth/v1/callback` 추가 |
| Email auth 활성화 | Authentication → Providers → Email | 기본 활성, 이메일 인증 정책 검토 |
| Email SMTP 설정 (운영용) | Authentication → SMTP Settings | 기본은 Supabase 제공, 운영은 SendGrid 등 별도 권장 |

---

## 🔑 현재 .env.local 상태

```
ANTHROPIC_API_KEY            ✅ 등록·동작 확인
SUPABASE_ACCESS_TOKEN        ✅ 등록·CLI 동작
SUPABASE_PROJECT_REF         ✅ bqmccfeglxzzrmgdirxe
NEXT_PUBLIC_SUPABASE_URL     ✅
NEXT_PUBLIC_SUPABASE_ANON_KEY ✅
SUPABASE_SERVICE_ROLE_KEY    ✅
NEXT_PUBLIC_FIREBASE_*       ⛔ (Phase 6 에서 제거)
FIREBASE_ADMIN_*             ⛔ (Phase 6 에서 제거)
TOSS_SECRET_KEY              ❌ 미발급 (사업자 등록 후)
NEXT_PUBLIC_TOSS_CLIENT_KEY  ❌ 미발급
NEXT_PUBLIC_KAKAO_CLIENT_ID  ❌ 미발급 (선택)
KAKAO_CLIENT_SECRET          ❌ 미발급 (선택)
NEXT_PUBLIC_BIZ_*            ❌ 사업자 등록 후
```

---

## 📊 빌드 상태

- ✅ `npm run typecheck` 통과 (Phase 3 시점)
- ⚠️ `npm run build` 미실행 — Phase 4 라우트들이 아직 Firebase 호출하므로 빌드 시점에 실패 가능. Phase 4 진행 후 다시.
- ⚠️ `npm run test` 미실행 — Firestore mock 사용하는 테스트가 Firebase 패키지 제거 시 깨짐. Phase 4·6 진행 후 재실행.

---

## 다음 세션 시작 시 추천 순서

1. `git status` 로 현재 변경 파일 확인
2. `npm run typecheck` 그린 유지되는지 확인
3. **Phase 4 시작** — `/api/match/route.ts` 먼저 변환 (가장 critical + 패턴 학습)
4. `/api/chat/route.ts` 변환
5. payment 3개 변환
6. 나머지 admin 라우트 순차 변환
7. Phase 5 (Storage)
8. Phase 6 (cleanup + tests)

각 라우트 변환 후 `npm run typecheck` 로 회귀 확인. 데이터가 비어있으니 통합 테스트는 시드 데이터 추가 후.
