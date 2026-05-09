/**
 * GET /api/user/dashboard — 대시보드 단일 조회
 *
 * 응답: latest spec snapshot + intent 진행도(수시 6장 + 정시 가/나/다) + plan.
 * 대시보드 페이지가 한 번에 받아 슬롯/카드를 채움.
 *
 * Firestore 패턴:
 *   - users/{uid}/specs/{specId} (orderBy updatedAt desc, limit 1) — 최신 spec
 *   - spec.intent — AdmissionIntent
 *   - users/{uid}/entitlements/current — plan
 *
 * 정직성(P-002): spec 미작성·intent 미작성 모두 빈 배열로 응답 (가짜 진행도 X).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import type { AdmissionIntent, UserEntitlement } from "@/types/admission";

export const dynamic = "force-dynamic";

interface DashboardResponse {
  plan: "free" | "pro" | "elite";
  intent?: AdmissionIntent;
  specs: {
    /** 최신 spec 메타 (페이지에서 hasSpec 판정에 사용). 본문은 미포함 — 별도 endpoint로 fetch. */
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
    const db = getAdminDb();

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
    const db = getAdminDb();
    const entSnap = await db
      .collection("users")
      .doc(uid)
      .collection("entitlements")
      .doc("current")
      .get();
    if (!entSnap.exists) return "free";
    const ent = entSnap.data() as UserEntitlement;
    return ent.currentPlan ?? "free";
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
    const db = getAdminDb();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("specs")
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0].data() as {
      asOf?: { schoolYear: number; semester: number };
      updatedAt?: { toDate?: () => Date } | string;
      intent?: AdmissionIntent;
    };

    return {
      asOf: doc.asOf ?? { schoolYear: 3, semester: 1 },
      updatedAt: normalizeTimestamp(doc.updatedAt),
      intent: doc.intent,
    };
  } catch {
    return null;
  }
}

function normalizeTimestamp(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    const fn = (v as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") return fn.call(v).toISOString();
  }
  return new Date().toISOString();
}
