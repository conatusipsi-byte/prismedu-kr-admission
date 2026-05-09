/**
 * GET /api/admin/kpi — 운영자 대시보드 KPI
 *
 * 4개 카운트:
 *   - 오늘 가입자 (users.createdAt >= 오늘 0시)
 *   - 오늘 분석 요청 (matches.createdAt >= 오늘 0시)
 *   - 오늘 결제 (orders.status='paid' AND createdAt >= 오늘 0시)
 *   - 표본 부족 학과 비율 (admissionSampleStats.verifiedCount < 5 비율)
 *
 * count() aggregation 사용 — 도큐먼트 fetch 없이 카운트만 받아 비용 절감.
 *
 * 인덱스 요구:
 *   - users.createdAt: 단일 필드 (자동)
 *   - matches.createdAt: 단일 필드 (자동)
 *   - orders.status + createdAt: composite (firestore.indexes.json 등록)
 *   - admissionSampleStats: 단일 필드 (자동, 또는 전체 카운트)
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireMasterAuth } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const db = getAdminDb();
    const todayStart = startOfTodayKst();
    const todayTs = Timestamp.fromDate(todayStart);

    const [signups, matches, paidOrders, sampleStats] = await Promise.all([
      countQuery(db, "users", todayTs).catch(() => null),
      countQuery(db, "matches", todayTs).catch(() => null),
      paidOrdersToday(db, todayTs).catch(() => null),
      sampleInsufficientRatio(db).catch(() => null),
    ]);

    return NextResponse.json({
      todoSignupCount: signups,
      todayMatchCount: matches,
      todayPaidOrderCount: paidOrders,
      sampleInsufficientPercent: sampleStats,
      generatedAt: new Date().toISOString(),
      window: { from: todayStart.toISOString(), to: new Date().toISOString() },
    });
  } catch (e) {
    console.error("[/api/admin/kpi] error:", e);
    return NextResponse.json(
      { error: "KPI 집계 실패" },
      { status: 500 },
    );
  }
}

/** 오늘(KST 자정 기준) 0시 Date 반환. KST=UTC+9. */
function startOfTodayKst(): Date {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCHours(0, 0, 0, 0);
  return new Date(kstNow.getTime() - 9 * 60 * 60 * 1000);
}

async function countQuery(
  db: FirebaseFirestore.Firestore,
  collection: string,
  since: Timestamp,
): Promise<number> {
  const snap = await db
    .collection(collection)
    .where("createdAt", ">=", since)
    .count()
    .get();
  return snap.data().count;
}

async function paidOrdersToday(
  db: FirebaseFirestore.Firestore,
  since: Timestamp,
): Promise<number> {
  const snap = await db
    .collection("orders")
    .where("status", "==", "paid")
    .where("createdAt", ">=", since)
    .count()
    .get();
  return snap.data().count;
}

/** 전체 sampleStats 중 verifiedCount<5 비율 (%). 학과 합격률 노출 가능 정도 지표. */
async function sampleInsufficientRatio(
  db: FirebaseFirestore.Firestore,
): Promise<number | null> {
  const totalSnap = await db
    .collection("admissionSampleStats")
    .count()
    .get();
  const total = totalSnap.data().count;
  if (total === 0) return null;

  const insufficientSnap = await db
    .collection("admissionSampleStats")
    .where("verifiedCount", "<", 5)
    .count()
    .get();
  const insufficient = insufficientSnap.data().count;
  return Math.round((insufficient / total) * 100);
}
