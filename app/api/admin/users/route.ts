/**
 * GET /api/admin/users — 사용자 목록 (Day 12)
 *
 * 마스터 전용. users 컬렉션 + admins 컬렉션 join + Auth.getUsers (disabled 플래그).
 *
 * 응답: { items, summary, source: "firestore"|"mock", nextCursor? }
 *
 * 정직성 (P-002):
 *   - 본 라우트는 운영자가 사용자 데이터에 접근하는 강력한 권한이라 master만 허용.
 *   - 검색·필터 결과를 통한 일괄 조회만 — 개별 사용자 상세는 별도 라우트 (후속).
 *   - PII (email·name) 마스킹 안 함 — 운영자가 검수해야 하므로 raw 노출.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { AdminUsersListQuerySchema } from "@/lib/schemas/api/admin";
import {
  listMockUsers,
  summarizeUsers,
  type AdminUserItem,
  type AdminUsersSummary,
} from "@/lib/admission/admin-users-mock";

interface ApiResponse {
  items: AdminUserItem[];
  summary: AdminUsersSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminUsersListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { q, plan, status, masterOnly, limit, cursor } = parsed.data;

  try {
    const db = getAdminDb();
    let firestoreQ = db.collection("users").orderBy("name").limit(limit);
    if (plan !== "all") {
      firestoreQ = firestoreQ.where("plan", "==", plan);
    }
    if (cursor) {
      const cursorDoc = await db.doc(cursor).get();
      if (cursorDoc.exists) firestoreQ = firestoreQ.startAfter(cursorDoc);
    }

    const snap = await firestoreQ.get();

    if (snap.empty && !cursor) {
      const items = listMockUsers({ q, plan, status, masterOnly: masterOnly === "true" });
      return NextResponse.json({
        items: items.slice(0, limit),
        summary: summarizeUsers(items),
        source: "mock",
      } satisfies ApiResponse);
    }

    // Firestore 결과 → Auth 정보·admins join
    const adminAuth = getAdminAuth();
    const items: AdminUserItem[] = [];
    for (const d of snap.docs) {
      const data = d.data() as {
        name?: string;
        email?: string;
        plan?: "free" | "pro" | "elite";
        provider?: string;
        photoURL?: string;
        createdAt?: { toMillis?: () => number };
      };
      const uid = d.id;

      // 검색 필터 (Firestore에서 효율적 텍스트 검색 어려워 메모리 필터)
      if (q) {
        const matchTarget = `${data.name ?? ""} ${data.email ?? ""} ${uid}`.toLowerCase();
        if (!matchTarget.includes(q.toLowerCase())) continue;
      }

      let disabled = false;
      let email = data.email ?? "";
      try {
        const authUser = await adminAuth.getUser(uid);
        disabled = authUser.disabled;
        if (!email) email = authUser.email ?? "";
      } catch {
        /* Auth user 없음 — 데이터 정합성 이슈, 그대로 진행 */
      }

      // status 필터
      if (status === "active" && disabled) continue;
      if (status === "disabled" && !disabled) continue;

      const adminDoc = await db.collection("admins").doc(uid).get();
      const isMaster = adminDoc.exists && adminDoc.data()?.active === true;
      if (masterOnly === "true" && !isMaster) continue;

      items.push({
        uid,
        email,
        name: data.name ?? "(이름 없음)",
        plan: data.plan ?? "free",
        provider: data.provider ?? "unknown",
        disabled,
        isMaster,
        createdAtMs: data.createdAt?.toMillis?.() ?? 0,
        photoURL: data.photoURL,
      });
    }

    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit ? lastDoc?.ref.path : undefined;

    return NextResponse.json({
      items,
      summary: summarizeUsers(items),
      source: "firestore",
      nextCursor,
    } satisfies ApiResponse);
  } catch (e) {
    console.error("[/api/admin/users] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}
