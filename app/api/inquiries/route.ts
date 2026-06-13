/**
 * /api/inquiries — 사용자 문의 작성/이력 조회 (2026-05-30).
 *
 * GET  — 본인 문의 이력 (RLS 가 본인만 보장).
 * POST — 신규 문의 작성.
 *
 * 비로그인 인입은 본 라우트에선 미지원 (requireAuth). 추후 anon 흐름은
 * 별도 라우트 + rate-limit 으로 격리할 것 (스팸 방지).
 *
 * 정직성 (P-002):
 *   - contactEmail 미입력 시 user.email 폴백. 둘 다 NULL 이면 작성은 허용하되
 *     운영자 답변 단계에서 발송 skip + response_email_error 기록.
 *   - 본 라우트 자체는 contactEmail 강제 X — 카카오 가입자도 작성은 가능해야 함.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getRouteSupabase } from "@/lib/supabase-server";
import {
  InquiryCreateSchema,
  InquiryListQuerySchema,
} from "@/lib/schemas/api/inquiries";
import { sendInquiryAdminNotification } from "@/lib/notify/inquiry-admin-notify";

export const dynamic = "force-dynamic";

interface InquiryRow {
  id: string;
  category: "improvement" | "question";
  title: string;
  body: string;
  contact_email: string | null;
  status: "pending" | "answered" | "closed";
  admin_response: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDto(r: InquiryRow) {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    body: r.body,
    contactEmail: r.contact_email,
    status: r.status,
    adminResponse: r.admin_response,
    answeredAt: r.answered_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   GET — 본인 이력
   ═══════════════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = InquiryListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status, limit, offset } = parsed.data;

  // RLS-aware 클라이언트 — 본인 행만 반환됨 (이중 안전망).
  const sb = await getRouteSupabase();
  let query = sb
    .from("inquiries")
    .select(
      "id, category, title, body, contact_email, status, admin_response, answered_at, created_at, updated_at",
      { count: "exact" },
    )
    .eq("user_id", auth.uid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) {
    console.error("[/api/inquiries GET] error:", error.message);
    return NextResponse.json(
      { error: "문의 이력 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const items = ((data ?? []) as InquiryRow[]).map(rowToDto);
  const total = count ?? items.length;
  const nextOffset = offset + limit < total ? offset + limit : null;

  return NextResponse.json({ items, total, nextOffset });
}

/* ═══════════════════════════════════════════════════════════════════════
   POST — 문의 작성
   ═══════════════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) body = JSON.parse(txt);
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 유효한 JSON 이 아닙니다." },
      { status: 400 },
    );
  }

  const parsed = InquiryCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { category, title, body: messageBody, contactEmail } = parsed.data;

  // user.email 폴백 — 양쪽 다 NULL 이면 답변 단계에서 발송 skip (P-002).
  const fallbackEmail = contactEmail ?? auth.email ?? null;

  const sb = await getRouteSupabase();
  const { data, error } = await sb
    .from("inquiries")
    .insert({
      user_id: auth.uid,
      category,
      title,
      body: messageBody,
      contact_email: fallbackEmail,
      status: "pending",
    })
    .select(
      "id, category, title, body, contact_email, status, admin_response, answered_at, created_at, updated_at",
    )
    .single();

  if (error) {
    console.error("[/api/inquiries POST] error:", error.message);
    return NextResponse.json(
      { error: "문의 등록 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const row = data as InquiryRow;

  // 운영자 알림 — best-effort. 발송 실패/미설정이 문의 접수(201)를 막지 않음 (P-002).
  // MASTER_EMAILS·RESEND_API_KEY 미설정 시 notify 내부에서 graceful skip.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://conatusipsi.com";
    const notify = await sendInquiryAdminNotification({
      inquiryId: row.id,
      category: row.category,
      title: row.title,
      body: row.body,
      authorEmail: row.contact_email,
      createdAt: row.created_at,
      siteUrl,
    });
    if (!notify.ok) {
      console.warn(`[/api/inquiries POST] 운영자 알림 skip: ${notify.reason}${notify.detail ? ` (${notify.detail})` : ""}`);
    } else {
      console.info(`[/api/inquiries POST] 운영자 알림 발송: ${notify.recipientCount}명`);
    }
  } catch (e) {
    // notify 는 내부에서 throw 하지 않지만, 어떤 경우에도 201 을 보장.
    console.warn("[/api/inquiries POST] 운영자 알림 예외:", (e as Error).message);
  }

  return NextResponse.json(
    { ok: true, inquiry: rowToDto(row) },
    { status: 201 },
  );
}
