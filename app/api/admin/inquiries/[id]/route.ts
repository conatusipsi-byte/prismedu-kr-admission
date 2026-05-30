/**
 * PATCH /api/admin/inquiries/[id] — 운영자 상태 변경 (closed/reopen) (2026-05-30).
 *
 * 본 엔드포인트는 답변 발송과 분리 — 이메일 발송 X. 답변 작성은 /respond.
 *
 * 허용 전이:
 *   - pending → closed   (답변 없이 종료, 운영자 판단)
 *   - answered → closed  (답변 후 종료)
 *   - closed → pending   (재오픈)
 *
 * 정직성 (P-002):
 *   - answered → pending 전이는 차단 (이미 발송된 답변을 미답변으로 되돌릴 수 없음).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminInquiryStatusSchema } from "@/lib/schemas/api/inquiries";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 문의 ID 형식입니다." }, { status: 400 });
  }

  let raw: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) raw = JSON.parse(txt);
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 유효한 JSON 이 아닙니다." },
      { status: 400 },
    );
  }
  const parsed = AdminInquiryStatusSchema.safeParse(raw);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const nextStatus = parsed.data.status;

  const sb = getAdminSupabase();

  const { data: current, error: fetchErr } = await sb
    .from("inquiries")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[/api/admin/inquiries PATCH] fetch error:", fetchErr.message);
    return NextResponse.json({ error: "문의 조회 중 오류" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  }

  // 허용 전이 매트릭스
  const allowed: Record<string, ReadonlyArray<"pending" | "closed">> = {
    pending: ["closed"],
    answered: ["closed"],
    closed: ["pending"],
  };
  if (!allowed[current.status]?.includes(nextStatus)) {
    return NextResponse.json(
      {
        error: `'${current.status}' 상태에서 '${nextStatus}' 로 전환할 수 없습니다.`,
        code: "invalid_transition",
      },
      { status: 409 },
    );
  }

  const { data: updated, error: updateErr } = await sb
    .from("inquiries")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("status", current.status) // race 안전망
    .select("id, status, updated_at")
    .maybeSingle();
  if (updateErr) {
    console.error("[/api/admin/inquiries PATCH] update error:", updateErr.message);
    return NextResponse.json({ error: "상태 변경 중 오류" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "다른 운영자가 상태를 변경한 것 같습니다. 새로고침 후 다시 시도해주세요." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, inquiry: updated });
}
