/**
 * GET /api/admin/inquiries — 운영자 전체 문의 조회 (2026-05-30).
 *
 * 운영자 전용 (requireMasterAuth). 탭(status) + 카테고리 + 검색어 필터.
 * 응답: { items, total, nextOffset }.
 * 각 item 에 user.email (auth.users) 매핑 — 답변 발송 대상 미리 확인용.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminInquiriesListQuerySchema } from "@/lib/schemas/api/inquiries";

export const dynamic = "force-dynamic";

interface InquiryAdminRow {
  id: string;
  user_id: string | null;
  category: "improvement" | "question";
  title: string;
  body: string;
  contact_email: string | null;
  status: "pending" | "answered" | "closed";
  admin_response: string | null;
  answered_by: string | null;
  answered_at: string | null;
  response_email_sent_at: string | null;
  response_email_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminInquiriesListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status, category, q, limit, offset } = parsed.data;

  const sb = getAdminSupabase();
  let query = sb
    .from("inquiries")
    .select(
      `id, user_id, category, title, body, contact_email, status,
       admin_response, answered_by, answered_at,
       response_email_sent_at, response_email_error,
       created_at, updated_at`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;
  if (error) {
    console.error("[/api/admin/inquiries GET] error:", error.message);
    return NextResponse.json(
      { error: "문의 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as InquiryAdminRow[];

  // user.email 매핑 — 답변 발송 시 누구에게 갈지 운영자가 미리 확인.
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((x): x is string => x !== null)),
  );
  const emailMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    await Promise.all(
      userIds.map(async (uid) => {
        const { data: u } = await sb.auth.admin.getUserById(uid);
        emailMap.set(uid, u?.user?.email ?? null);
      }),
    );
  }

  // 검색어 — 제목·본문·이메일 부분 매칭 (메모리, count 가 정확하지 않을 수 있음).
  let filtered = rows;
  if (q && q.trim().length > 0) {
    const lower = q.trim().toLowerCase();
    filtered = rows.filter((r) => {
      const userEmail = (r.user_id && emailMap.get(r.user_id)) || "";
      return (
        r.title.toLowerCase().includes(lower) ||
        r.body.toLowerCase().includes(lower) ||
        (r.contact_email ?? "").toLowerCase().includes(lower) ||
        userEmail.toLowerCase().includes(lower)
      );
    });
  }

  const items = filtered.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    body: r.body,
    status: r.status,
    contactEmail: r.contact_email,
    adminResponse: r.admin_response,
    answeredBy: r.answered_by,
    answeredAt: r.answered_at,
    responseEmailSentAt: r.response_email_sent_at,
    responseEmailError: r.response_email_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    user: r.user_id
      ? { id: r.user_id, email: emailMap.get(r.user_id) ?? null }
      : null,
    /** 답변 발송 시 실제 사용될 회신 주소 (UI 미리보기용) */
    effectiveRecipient:
      r.contact_email ?? (r.user_id ? emailMap.get(r.user_id) ?? null : null),
  }));

  const total = count ?? items.length;
  const nextOffset = offset + limit < total ? offset + limit : null;

  return NextResponse.json({ items, total, nextOffset });
}
