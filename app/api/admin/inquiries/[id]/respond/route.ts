/**
 * PATCH /api/admin/inquiries/[id]/respond — 운영자 답변 작성 + 이메일 발송 (2026-05-30).
 *
 * 흐름:
 *   1) 답변 본문 검증 (Zod) → DB 저장 (status=answered, admin_response, answered_at, answered_by).
 *   2) sendInquiryResponseEmail 비동기 호출 (회신 주소 = contact_email ?? user.email).
 *   3) 발송 결과를 DB 에 두 번째 UPDATE 로 기록 (response_email_sent_at / response_email_error).
 *
 * 정직성 (P-002):
 *   - 발송 실패해도 답변 저장 자체는 성공 — 사용자가 /inquiries 에서 답변 확인 가능.
 *   - 발송 결과는 DB 에 투명 기록 → 운영자가 재발송 판단 가능.
 *   - user.email + contact_email 모두 NULL → no_recipient 코드로 명시.
 *
 * idempotency: 같은 문의에 답변 중복 호출 시 409 (이미 answered 상태).
 *   운영자가 재발송이 필요하면 별도 엔드포인트(미구현) 또는 closed → pending 후 재시도.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminInquiryRespondSchema } from "@/lib/schemas/api/inquiries";
import { sendInquiryResponseEmail } from "@/lib/notify/inquiry-response";

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
  const parsed = AdminInquiryRespondSchema.safeParse(raw);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { adminResponse } = parsed.data;

  const sb = getAdminSupabase();

  // 1) 대상 조회 — 상태/회신 주소 확인 (UPDATE 후엔 회신 주소가 stale 가능).
  const { data: inquiry, error: fetchErr } = await sb
    .from("inquiries")
    .select(
      "id, user_id, category, title, body, contact_email, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[/api/admin/inquiries/respond] fetch error:", fetchErr.message);
    return NextResponse.json({ error: "문의 조회 중 오류" }, { status: 500 });
  }
  if (!inquiry) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  }
  if (inquiry.status === "answered") {
    return NextResponse.json(
      { error: "이미 답변된 문의입니다.", code: "already_answered" },
      { status: 409 },
    );
  }

  // 2) 답변 저장 — answered_at = NOW(), status=answered.
  const answeredAtIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await sb
    .from("inquiries")
    .update({
      admin_response: adminResponse,
      answered_at: answeredAtIso,
      answered_by: auth.uid,
      status: "answered",
    })
    .eq("id", id)
    .eq("status", "pending") // 동시 답변 차단 (race 안전)
    .select(
      "id, user_id, category, title, body, contact_email, admin_response, status, answered_at, created_at",
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[/api/admin/inquiries/respond] update error:", updateErr.message);
    return NextResponse.json({ error: "답변 저장 중 오류" }, { status: 500 });
  }
  if (!updated) {
    // pending → answered 가 race 로 이미 진행된 경우
    return NextResponse.json(
      { error: "다른 운영자가 이미 답변했거나 상태가 변경됐습니다.", code: "race_conflict" },
      { status: 409 },
    );
  }

  // 3) 회신 대상 조회 — user_id 가 있으면 auth.users.email 폴백.
  let userEmail: string | null = null;
  if (updated.user_id) {
    const { data: u } = await sb.auth.admin.getUserById(updated.user_id);
    userEmail = u?.user?.email ?? null;
  }

  // 4) 이메일 발송 (await — 결과를 DB 에 기록해야 함. 실패해도 답변 자체는 저장됨).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://conatusipsi.com";
  const notifyResult = await sendInquiryResponseEmail({
    inquiryId: updated.id,
    category: updated.category,
    title: updated.title,
    originalBody: updated.body,
    adminResponse: adminResponse,
    createdAt: updated.created_at,
    answeredAt: answeredAtIso,
    contactEmail: updated.contact_email,
    userEmail,
    siteUrl,
  });

  // 5) 발송 결과를 DB 에 두 번째 UPDATE 로 기록.
  const emailUpdate: { response_email_sent_at: string | null; response_email_error: string | null } =
    notifyResult.ok
      ? { response_email_sent_at: new Date().toISOString(), response_email_error: null }
      : {
          response_email_sent_at: null,
          response_email_error: `${notifyResult.reason}${notifyResult.detail ? `: ${notifyResult.detail}` : ""}`,
        };
  const { error: emailLogErr } = await sb
    .from("inquiries")
    .update(emailUpdate)
    .eq("id", id);
  if (emailLogErr) {
    // 발송 결과 기록 실패는 critical X — 로깅만.
    console.warn("[/api/admin/inquiries/respond] email log update failed:", emailLogErr.message);
  }

  if (!notifyResult.ok) {
    // 답변은 저장됐지만 이메일 발송 실패 — 200 + warning 으로 응답.
    return NextResponse.json({
      ok: true,
      inquiryId: id,
      emailSent: false,
      emailReason: notifyResult.reason,
      emailDetail: notifyResult.detail,
      warning:
        notifyResult.reason === "no_recipient"
          ? "회신 이메일이 없어 발송하지 못했습니다 (카카오 가입자 등). 사용자가 /inquiries 에서 답변을 확인할 수 있습니다."
          : notifyResult.reason === "no_api_key"
            ? "메일 서비스가 설정되지 않아 발송 skip. 답변은 저장됐습니다."
            : "메일 발송이 실패했지만 답변은 저장됐습니다.",
    });
  }

  return NextResponse.json({
    ok: true,
    inquiryId: id,
    emailSent: true,
    channel: notifyResult.channel,
    messageId: notifyResult.messageId,
    to: notifyResult.to,
  });
}
