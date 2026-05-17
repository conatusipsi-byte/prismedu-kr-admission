/**
 * /api/planner — 입시 자동 플래너 (Pro/Elite 전용, Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
import { canUseFeature, type Plan } from "@/lib/plans";
import {
  PlannerPatchRequestSchema,
  type PlannerCategory,
  type PlannerGetResponse,
  type PlannerTask,
} from "@/lib/schemas/api/planner";
import type {
  AdmissionIntent,
  AdmissionSlot,
  AdmissionTrackKind,
} from "@/types/admission";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const plan = await loadPlan(auth.uid);
  if (!canUseFeature(plan, "autoPlannerEnabled")) {
    return NextResponse.json(
      { error: "자동 플래너는 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  try {
    const intent = await loadLatestIntent(auth.uid);
    const targetYear = new Date().getFullYear() + 1;
    const generated = generatePlannerTasks(intent, targetYear);

    if (generated.length === 0) {
      const empty: PlannerGetResponse = {
        tasks: [],
        generatedAt: new Date().toISOString(),
        empty: true,
      };
      return NextResponse.json(empty);
    }

    const completions = await loadCompletions(auth.uid);
    const tasks: PlannerTask[] = generated.map((t) => ({
      ...t,
      completed: completions.has(t.id),
    }));

    tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return NextResponse.json({
      tasks,
      generatedAt: new Date().toISOString(),
      empty: false,
    } as PlannerGetResponse);
  } catch (e) {
    reportRouteError("api.planner.GET", e, { uid: auth.uid });
    return NextResponse.json({ error: "플래너 조회 실패" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const plan = await loadPlan(auth.uid);
  if (!canUseFeature(plan, "autoPlannerEnabled")) {
    return NextResponse.json(
      { error: "자동 플래너는 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = PlannerPatchRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { taskId, completed } = parsed.data;

  try {
    const sb = getAdminSupabase();
    if (completed) {
      const { error } = await sb
        .from("planner_completions")
        .upsert({ user_id: auth.uid, task_id: taskId });
      if (error) throw error;
    } else {
      const { error } = await sb
        .from("planner_completions")
        .delete()
        .eq("user_id", auth.uid)
        .eq("task_id", taskId);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, taskId, completed });
  } catch (e) {
    reportRouteError("api.planner.PATCH", e, { uid: auth.uid, taskId });
    return NextResponse.json({ error: "완료 상태 저장 실패" }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   생성 로직 (Firestore 와 동일 — 순수 함수)
   ═══════════════════════════════════════════════════════════════════════ */

function buildStandardCalendar(targetYear: number) {
  const prev = targetYear - 1;
  return {
    susiApplicationStart: `${prev}-09-09`,
    susiApplicationEnd: `${prev}-09-13`,
    documentDeadline: `${prev}-09-15`,
    hakjongStage1Result: `${prev}-11-13`,
    interviewWindow: { start: `${prev}-11-22`, end: `${prev}-12-13` },
    essayDate: `${prev}-11-22`,
    practicalDate: `${prev}-11-29`,
    csatDate: `${prev}-11-19`,
    jeongsiApplicationStart: `${prev}-12-29`,
    jeongsiApplicationEnd: `${targetYear}-01-02`,
  };
}

interface GeneratedTask {
  id: string;
  title: string;
  description?: string;
  category: PlannerCategory;
  dueDate: string;
  sourceSlot?: { universityId: string; departmentId: string; trackKind: string };
}

function generatePlannerTasks(
  intent: AdmissionIntent | null,
  targetYear: number,
): GeneratedTask[] {
  if (!intent) return [];

  const cal = buildStandardCalendar(targetYear);
  const out: GeneratedTask[] = [];

  const hasAnySlot = intent.susi.length > 0 || hasAnyJeongsi(intent);
  if (hasAnySlot) {
    out.push({
      id: `common_${targetYear}_csat`,
      title: `${targetYear}학년도 수능`,
      description: "11월 셋째주 목요일 — 평년 일정 기준. 수능 시험 당일 준비물 점검.",
      category: "csat",
      dueDate: cal.csatDate,
    });
  }

  for (const slot of intent.susi) {
    out.push(...buildSusiTasks(slot, cal, targetYear));
  }
  if (intent.jeongsi.ga) out.push(...buildJeongsiTasks("ga", intent.jeongsi.ga, cal, targetYear));
  if (intent.jeongsi.na) out.push(...buildJeongsiTasks("na", intent.jeongsi.na, cal, targetYear));
  if (intent.jeongsi.da) out.push(...buildJeongsiTasks("da", intent.jeongsi.da, cal, targetYear));

  return out;
}

function hasAnyJeongsi(intent: AdmissionIntent): boolean {
  return Boolean(intent.jeongsi.ga || intent.jeongsi.na || intent.jeongsi.da);
}

function buildSusiTasks(
  slot: AdmissionSlot,
  cal: ReturnType<typeof buildStandardCalendar>,
  targetYear: number,
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const base = `susi_${targetYear}_${slot.universityId}_${slot.departmentId}_${slot.trackKind}`;
  const slotMeta = {
    universityId: slot.universityId,
    departmentId: slot.departmentId,
    trackKind: slot.trackKind,
  };
  const labelTrack = trackKindLabel(slot.trackKind);

  tasks.push({
    id: `${base}_application`,
    title: `${slot.universityId} ${slot.departmentId} (${labelTrack}) 원서접수`,
    description: `수시 원서접수 마감: ${cal.susiApplicationEnd}.`,
    category: "application",
    dueDate: cal.susiApplicationEnd,
    sourceSlot: slotMeta,
  });
  tasks.push({
    id: `${base}_documents`,
    title: `${slot.universityId} 제출서류 준비 (${labelTrack})`,
    description: "학교 추천 필요 여부, 추가 제출서류 확인.",
    category: "documents",
    dueDate: cal.documentDeadline,
    sourceSlot: slotMeta,
  });

  if (slot.trackKind === "susi_comprehensive") {
    tasks.push({
      id: `${base}_interview`,
      title: `${slot.universityId} 학종 면접 준비`,
      description: `면접 시기: ${cal.interviewWindow.start} ~ ${cal.interviewWindow.end}. 1단계 발표 (${cal.hakjongStage1Result}) 후 대비.`,
      category: "interview",
      dueDate: cal.interviewWindow.end,
      sourceSlot: slotMeta,
    });
  }
  if (slot.trackKind === "susi_essay") {
    tasks.push({
      id: `${base}_essay`,
      title: `${slot.universityId} 논술 시험`,
      description: `논술 시험일: ${cal.essayDate} (평년). 기출 + 출제 경향 파악.`,
      category: "essay",
      dueDate: cal.essayDate,
      sourceSlot: slotMeta,
    });
  }
  if (slot.trackKind === "susi_practical") {
    tasks.push({
      id: `${base}_practical`,
      title: `${slot.universityId} 실기 시험`,
      description: `실기 시험일: ${cal.practicalDate} (평년). 실기 종목 확인.`,
      category: "practical",
      dueDate: cal.practicalDate,
      sourceSlot: slotMeta,
    });
  }
  return tasks;
}

function buildJeongsiTasks(
  group: "ga" | "na" | "da",
  slot: AdmissionSlot,
  cal: ReturnType<typeof buildStandardCalendar>,
  targetYear: number,
): GeneratedTask[] {
  const base = `jeongsi_${targetYear}_${group}_${slot.universityId}_${slot.departmentId}`;
  const slotMeta = {
    universityId: slot.universityId,
    departmentId: slot.departmentId,
    trackKind: slot.trackKind,
  };
  return [
    {
      id: `${base}_application`,
      title: `정시 ${group.toUpperCase()}군 ${slot.universityId} ${slot.departmentId} 원서접수`,
      description: `정시 원서접수: ${cal.jeongsiApplicationStart} ~ ${cal.jeongsiApplicationEnd}. 변환점수표 발표 후 가/나/다군 최종 결정.`,
      category: "application",
      dueDate: cal.jeongsiApplicationEnd,
      sourceSlot: slotMeta,
    },
    {
      id: `${base}_documents`,
      title: `정시 ${group.toUpperCase()}군 ${slot.universityId} 변환점수 확인`,
      description: "수능 후 발표되는 대학별 변환점수표 발표 즉시 확인.",
      category: "documents",
      dueDate: `${targetYear - 1}-11-26`,
      sourceSlot: slotMeta,
    },
  ];
}

function trackKindLabel(k: AdmissionTrackKind): string {
  switch (k) {
    case "susi_subject": return "학생부교과";
    case "susi_comprehensive": return "학생부종합";
    case "susi_essay": return "논술";
    case "susi_practical": return "실기";
    case "jeongsi_ga": return "정시 가군";
    case "jeongsi_na": return "정시 나군";
    case "jeongsi_da": return "정시 다군";
    case "additional": return "추가모집";
    case "jaeoegukmin": return "재외국민·외국인";
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Supabase I/O
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_entitlements")
      .select("current_plan")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as Plan) ?? "free";
  } catch {
    return "free";
  }
}

async function loadLatestIntent(uid: string): Promise<AdmissionIntent | null> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_specs")
      .select("intent")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { intent: AdmissionIntent | null }).intent ?? null;
  } catch {
    return null;
  }
}

async function loadCompletions(uid: string): Promise<Set<string>> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("planner_completions")
      .select("task_id")
      .eq("user_id", uid);
    if (error || !data) return new Set();
    return new Set((data as Array<{ task_id: string }>).map((r) => r.task_id));
  } catch {
    return new Set();
  }
}
