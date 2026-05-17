/**
 * GET /api/admin/users — 사용자 목록 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
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
  source: "supabase" | "mock";
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
    const sb = getAdminSupabase();
    // profiles + admins + user_entitlements 임베드 + Auth Admin 의 disabled 정보는 별도 호출
    let query = sb
      .from("profiles")
      .select(`
        id, name, email, photo_url, created_at,
        user_entitlements ( current_plan ),
        admins ( active )
      `)
      .order("name", { ascending: true })
      .limit(limit);

    if (cursor) {
      query = query.gt("name", cursor);
    }

    const { data, error } = await query;

    if (error || !data || (data.length === 0 && !cursor)) {
      const items = listMockUsers({ q, plan, status, masterOnly: masterOnly === "true" });
      return NextResponse.json({
        items: items.slice(0, limit),
        summary: summarizeUsers(items),
        source: "mock",
      } satisfies ApiResponse);
    }

    type Row = {
      id: string;
      name: string;
      email: string | null;
      photo_url: string | null;
      created_at: string;
      user_entitlements: Array<{ current_plan: "free" | "pro" | "elite" }> | { current_plan: "free" | "pro" | "elite" } | null;
      admins: Array<{ active: boolean }> | { active: boolean } | null;
    };

    const rows = data as unknown as Row[];
    const items: AdminUserItem[] = [];

    for (const r of rows) {
      const ent = Array.isArray(r.user_entitlements) ? r.user_entitlements[0] : r.user_entitlements;
      const adminRow = Array.isArray(r.admins) ? r.admins[0] : r.admins;
      const userPlan: "free" | "pro" | "elite" = ent?.current_plan ?? "free";

      if (plan !== "all" && userPlan !== plan) continue;
      if (q) {
        const matchTarget = `${r.name} ${r.email ?? ""} ${r.id}`.toLowerCase();
        if (!matchTarget.includes(q.toLowerCase())) continue;
      }

      // Supabase Admin Auth — disabled 상태 조회 (선택적, 실패 시 false 가정)
      let disabled = false;
      try {
        const { data: authUser } = await sb.auth.admin.getUserById(r.id);
        disabled = !!authUser.user?.banned_until && new Date(authUser.user.banned_until).getTime() > Date.now();
      } catch {
        /* skip */
      }
      if (status === "active" && disabled) continue;
      if (status === "disabled" && !disabled) continue;

      const isMaster = !!adminRow?.active;
      if (masterOnly === "true" && !isMaster) continue;

      items.push({
        uid: r.id,
        email: r.email ?? "",
        name: r.name || "(이름 없음)",
        plan: userPlan,
        provider: "unknown",
        disabled,
        isMaster,
        createdAtMs: new Date(r.created_at).getTime(),
        photoURL: r.photo_url ?? undefined,
      });
    }

    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.name : undefined;

    return NextResponse.json({
      items,
      summary: summarizeUsers(items),
      source: "supabase",
      nextCursor,
    } satisfies ApiResponse);
  } catch (e) {
    console.error("[/api/admin/users] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}
