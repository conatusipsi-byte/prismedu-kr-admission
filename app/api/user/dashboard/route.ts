/**
 * GET /api/user/dashboard — 대시보드 단일 조회 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import type { AdmissionIntent } from "@/types/admission";

export const dynamic = "force-dynamic";

interface DashboardResponse {
  plan: "free" | "pro" | "elite";
  intent?: AdmissionIntent;
  specs: {
    latest?: {
      asOf: { schoolYear: number; semester: number };
      updatedAt: string;
    };
  };
  generatedAt: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const [plan, latestSpec] = await Promise.all([
      loadPlan(auth.uid),
      loadLatestSpec(auth.uid),
    ]);

    const response: DashboardResponse = {
      plan,
      intent: latestSpec?.intent,
      specs: {
        latest: latestSpec
          ? {
              asOf: latestSpec.asOf,
              updatedAt: latestSpec.updatedAt,
            }
          : undefined,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("[/api/user/dashboard] error:", e);
    return NextResponse.json(
      { error: "대시보드 데이터 조회 실패" },
      { status: 500 },
    );
  }
}

async function loadPlan(uid: string): Promise<"free" | "pro" | "elite"> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_entitlements")
      .select("current_plan")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as "free" | "pro" | "elite") ?? "free";
  } catch {
    return "free";
  }
}

async function loadLatestSpec(uid: string): Promise<
  | {
      asOf: { schoolYear: number; semester: number };
      updatedAt: string;
      intent?: AdmissionIntent;
    }
  | null
> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_specs")
      .select("as_of, intent, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      as_of: { schoolYear: number; semester: number } | null;
      intent: AdmissionIntent | null;
      updated_at: string;
    };
    return {
      asOf: row.as_of ?? { schoolYear: 3, semester: 1 },
      updatedAt: row.updated_at,
      intent: row.intent ?? undefined,
    };
  } catch {
    return null;
  }
}
