/**
 * /api/planner — 입시 자동 플래너 (Pro/Elite 전용)
 *
 * GET: 사용자 specs.intent + 표준 입시 일정 기반 task 자동 생성. 완료 상태는
 *      users/{uid}/plannerCompletions/{taskId} 와 머지.
 * PATCH: taskId 의 completed 토글 — Firestore 에 저장.
 *
 * 정직성:
 *   - intent 미작성 시 빈 배열 (가짜 task X)
 *   - 학과별 일정은 표준 일정 (모집요강 일정이 등록되면 그걸 우선 사용 — 후속 PR)
 *
 * 결정성:
 *   - task ID 는 (학년도 + slot.universityId + slot.departmentId + trackKind + category)
 *     해시. 같은 intent 면 매번 같은 ID 가 생성되어 completion 머지가 안정적.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
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
  UserEntitlement,
} from "@/types/admission";

export const dynamic = "force-dynamic";

/* ═══════════════════════════════════════════════════════════════════════
   GET — task 자동 생성
   ═══════════════════════════════════════════════════════════════════════ */

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

    // 마감 임박 우선 — dueDate ASC
    tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const response: PlannerGetResponse = {
      tasks,
      generatedAt: new Date().toISOString(),
      empty: false,
    };
    return NextResponse.json(response);
  } catch (e) {
    console.error("[/api/planner] GET error:", e);
    return NextResponse.json({ error: "플래너 조회 실패" }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   PATCH — task 완료 토글
   ═══════════════════════════════════════════════════════════════════════ */

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
    const db = getAdminDb();
    const ref = db
      .collection("users").doc(auth.uid)
      .collection("plannerCompletions").doc(taskId);

    if (completed) {
      await ref.set(
        {
          taskId,
          completed: true,
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      // 미완료로 되돌리기 — 도큐먼트 자체 삭제 (스토리지 절약)
      await ref.delete();
    }

    return NextResponse.json({ ok: true, taskId, completed });
  } catch (e) {
    console.error("[/api/planner] PATCH error:", e);
    return NextResponse.json({ error: "완료 상태 저장 실패" }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   생성 로직
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 표준 입시 일정 — targetYear 학년도 기준.
 * 실제 모집요강 일정이 admissions/{year} 에 등록되면 슬롯별로 override (후속 PR).
 *
 * 출처: 한국 입시 평년 일정. 정확한 날짜는 매년 한국대학교육협의회·평가원이 확정.
 */
function buildStandardCalendar(targetYear: number): {
  susiApplicationStart: string;
  susiApplicationEnd: string;
  documentDeadline: string;
  hakjongStage1Result: string;
  interviewWindow: { start: string; end: string };
  essayDate: string;
  practicalDate: string;
  csatDate: string;
  jeongsiApplicationStart: string;
  jeongsiApplicationEnd: string;
} {
  // targetYear 가 2027학년도면 입시 진행은 2026 가을 ~ 2027 봄
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

  // 공통 — 수능 (intent 가 1개라도 있을 때만 노출)
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

  // 수시 슬롯
  for (const slot of intent.susi) {
    out.push(...buildSusiTasks(slot, cal, targetYear));
  }

  // 정시 슬롯
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

  // 공통: 원서접수
  tasks.push({
    id: `${base}_application`,
    title: `${slot.universityId} ${slot.departmentId} (${labelTrack}) 원서접수`,
    description: `수시 원서접수 마감: ${cal.susiApplicationEnd}. 자기소개서 폐지 이후이므로 모집요강·제출서류 위주 점검.`,
    category: "application",
    dueDate: cal.susiApplicationEnd,
    sourceSlot: slotMeta,
  });

  // 공통: 자료준비 (수시 모든 트랙)
  tasks.push({
    id: `${base}_documents`,
    title: `${slot.universityId} 제출서류 준비 (${labelTrack})`,
    description: "학교 추천 필요 여부, 추가 제출서류(자격증·실적물 등) 확인.",
    category: "documents",
    dueDate: cal.documentDeadline,
    sourceSlot: slotMeta,
  });

  // 트랙별 분기
  if (slot.trackKind === "susi_comprehensive") {
    tasks.push({
      id: `${base}_interview`,
      title: `${slot.universityId} 학종 면접 준비`,
      description: `면접 시기: ${cal.interviewWindow.start} ~ ${cal.interviewWindow.end}. 1단계 통과 발표(${cal.hakjongStage1Result}) 후 본격 대비.`,
      category: "interview",
      dueDate: cal.interviewWindow.end,
      sourceSlot: slotMeta,
    });
  }
  if (slot.trackKind === "susi_essay") {
    tasks.push({
      id: `${base}_essay`,
      title: `${slot.universityId} 논술 시험`,
      description: `논술 시험일: ${cal.essayDate} (평년). 기출 + 학교별 출제 경향 파악.`,
      category: "essay",
      dueDate: cal.essayDate,
      sourceSlot: slotMeta,
    });
  }
  if (slot.trackKind === "susi_practical") {
    tasks.push({
      id: `${base}_practical`,
      title: `${slot.universityId} 실기 시험`,
      description: `실기 시험일: ${cal.practicalDate} (평년). 학과별 실기 종목 확인.`,
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
      description: "수능 후 발표되는 대학별 변환점수표 발표 즉시 확인 (P-012 preliminary 변환점수 주의).",
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
   Firestore I/O
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users").doc(uid)
      .collection("entitlements")
      .doc("current")
      .get();
    if (!snap.exists) return "free";
    return ((snap.data() as UserEntitlement).currentPlan ?? "free") as Plan;
  } catch {
    return "free";
  }
}

async function loadLatestIntent(uid: string): Promise<AdmissionIntent | null> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users").doc(uid)
      .collection("specs")
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get();
    if (snap.empty) return null;
    const spec = snap.docs[0].data() as { intent?: AdmissionIntent };
    return spec.intent ?? null;
  } catch {
    return null;
  }
}

async function loadCompletions(uid: string): Promise<Set<string>> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users").doc(uid)
      .collection("plannerCompletions")
      .get();
    return new Set(snap.docs.map((d) => d.id));
  } catch {
    return new Set();
  }
}
