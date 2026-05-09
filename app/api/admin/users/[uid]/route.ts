/**
 * POST /api/admin/users/[uid] — 사용자 권한·차단 토글 (Day 12)
 *
 * 액션:
 *   promote → admins/{uid} { active: true } 생성
 *   revoke  → admins/{uid}.active = false (도큐먼트 보존, 감사 추적)
 *   disable → Firebase Auth disabled = true (로그인 차단)
 *   enable  → Firebase Auth disabled = false
 *
 * 보안:
 *   - master만 호출
 *   - 본인 자신을 revoke하는 케이스 차단 — 운영자 lockout 방지
 *   - reason 메모 필수 (운영 감사)
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
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

  // 본인 자신을 revoke / disable 차단 — 마지막 master lockout 방지
  if ((action === "revoke" || action === "disable") && targetUid === auth.uid) {
    return NextResponse.json(
      { error: "본인 계정에 대해서는 revoke/disable을 수행할 수 없어요. 다른 운영자에게 요청하세요." },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  try {
    if (action === "promote") {
      const target = await getAdminAuth().getUser(targetUid).catch(() => null);
      if (!target) {
        return NextResponse.json({ error: "대상 사용자를 찾을 수 없어요." }, { status: 404 });
      }
      await db.collection("admins").doc(targetUid).set(
        {
          uid: targetUid,
          email: target.email ?? null,
          active: true,
          addedAt: FieldValue.serverTimestamp(),
          addedBy: auth.uid,
          reason: reason ?? null,
        },
        { merge: true },
      );
    } else if (action === "revoke") {
      await db.collection("admins").doc(targetUid).set(
        {
          active: false,
          revokedAt: FieldValue.serverTimestamp(),
          revokedBy: auth.uid,
          revokeReason: reason ?? null,
        },
        { merge: true },
      );
    } else if (action === "disable" || action === "enable") {
      await getAdminAuth().updateUser(targetUid, { disabled: action === "disable" });
      // 감사 로그 — users/{uid}.adminMutationLog 누적
      await db.collection("users").doc(targetUid).set(
        {
          adminMutations: FieldValue.arrayUnion({
            action,
            by: auth.uid,
            at: new Date().toISOString(),
            reason: reason ?? null,
          }),
        },
        { merge: true },
      );
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
