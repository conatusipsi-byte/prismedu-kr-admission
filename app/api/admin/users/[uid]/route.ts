/**
 * POST /api/admin/users/[uid] — 사용자 권한·차단 토글 (Supabase).
 *
 * 액션:
 *   promote → admins 테이블 upsert (active=true)
 *   revoke  → admins.active=false (도큐먼트 보존, 감사 추적)
 *   disable → Supabase Auth ban (banDuration=8760h ~= 1년)
 *   enable  → Supabase Auth unban (banDuration=0)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminUserMutationSchema } from "@/lib/schemas/api/admin";

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "admin_user_mutation",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 30,
  });
  if (rateErr) return rateErr;

  const { uid: targetUid } = await ctx.params;
  if (!UID_RE.test(targetUid)) {
    return NextResponse.json({ error: "유효하지 않은 사용자 ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = AdminUserMutationSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { action, reason } = parsed.data;

  if ((action === "revoke" || action === "disable") && targetUid === auth.uid) {
    return NextResponse.json(
      { error: "본인 계정에 대해서는 revoke/disable을 수행할 수 없어요. 다른 운영자에게 요청하세요." },
      { status: 400 },
    );
  }

  const sb = getAdminSupabase();

  try {
    if (action === "promote") {
      const { data: userData, error: getErr } = await sb.auth.admin.getUserById(targetUid);
      if (getErr || !userData.user) {
        return NextResponse.json({ error: "대상 사용자를 찾을 수 없어요." }, { status: 404 });
      }
      const { error } = await sb.from("admins").upsert({
        user_id: targetUid,
        email: userData.user.email ?? "",
        active: true,
        granted_by: auth.uid,
        notes: reason ?? null,
      });
      if (error) throw error;
    } else if (action === "revoke") {
      const { error } = await sb
        .from("admins")
        .update({ active: false, notes: reason ?? null })
        .eq("user_id", targetUid);
      if (error) throw error;
    } else if (action === "disable" || action === "enable") {
      // Supabase 의 disable: banDuration 8760h(1년) 설정. enable 은 0s.
      const { error } = await sb.auth.admin.updateUserById(targetUid, {
        ban_duration: action === "disable" ? "8760h" : "0",
      } as { ban_duration: string });
      if (error) throw error;
      // 감사 로그 — profiles 에 별도 필드 없으므로 향후 audit_log 테이블 추가 시 확장
    }

    return NextResponse.json({ success: true, uid: targetUid, action });
  } catch (e) {
    console.error(`[/api/admin/users/${targetUid}] ${action} 실패:`, e);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}
