/**
 * POST /api/intent/validate — 가/나/다군 중복지원 검증 (P-003).
 *
 * 룰셋:
 *   - susi.length <= 6
 *   - jeongsi.ga/na/da 각 슬롯의 trackKind 가 그룹과 일치
 *   - 같은 학과 + 같은 trackKind 슬롯 중복 금지
 *   - 같은 군 내 같은 대학 중복 금지 (정시는 슬롯 자체가 1개라 자연 차단)
 *
 * 순수 검증 — DB 접근 없음. requireAuth 만.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import {
  IntentValidateSchema,
  type IntentValidateInput,
} from "@/lib/schemas/api/match";
import type {
  AdmissionIntent,
  AdmissionIntentError,
  AdmissionIntentValidation,
  AdmissionSlot,
} from "@/types/admission";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = IntentValidateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const result = validateIntent(parsed.data.intent);
  return NextResponse.json(result);
}

function validateIntent(intent: IntentValidateInput["intent"]): AdmissionIntentValidation {
  const errors: AdmissionIntentError[] = [];

  // 1. 수시 6장 초과
  if (intent.susi.length > 6) {
    errors.push({ code: "susi_overflow", current: intent.susi.length, max: 6 });
  }

  // 2. 정시 슬롯 trackKind 가 그룹과 일치
  for (const [group, slot] of [["ga", intent.jeongsi.ga], ["na", intent.jeongsi.na], ["da", intent.jeongsi.da]] as const) {
    if (!slot) continue;
    const expected = `jeongsi_${group}` as const;
    if (slot.trackKind !== expected) {
      errors.push({
        code: "invalid_track_kind",
        slot: slot as AdmissionSlot,
        expected,
      });
    }
  }

  // 3. 수시 슬롯 trackKind 가 수시 계열인지
  for (const slot of intent.susi) {
    if (!slot.trackKind.startsWith("susi_")) {
      errors.push({
        code: "invalid_track_kind",
        slot: slot as AdmissionSlot,
        expected: "susi",
      });
    }
  }

  // 4. 같은 학과 + 같은 trackKind 중복 (수시·정시 어디서든)
  const allSlots: AdmissionSlot[] = [
    ...(intent.susi as unknown as AdmissionSlot[]),
    ...([intent.jeongsi.ga, intent.jeongsi.na, intent.jeongsi.da].filter(Boolean) as unknown as AdmissionSlot[]),
  ];
  const seen = new Map<string, AdmissionSlot[]>();
  for (const s of allSlots) {
    const key = `${s.universityId}/${s.departmentId}/${s.trackKind}`;
    const list = seen.get(key) ?? [];
    list.push(s);
    seen.set(key, list);
  }
  for (const [, list] of seen) {
    if (list.length >= 2) {
      errors.push({
        code: "duplicate_department",
        universityId: list[0].universityId,
        departmentId: list[0].departmentId,
        trackKinds: list.map((s) => s.trackKind),
      });
    }
  }

  // 5. 가/나/다군 내 같은 대학 슬롯 중복 (구조상 차단되지만 마이그레이션 안전망)
  const jeongsiByGroup = { ga: intent.jeongsi.ga, na: intent.jeongsi.na, da: intent.jeongsi.da } as const;
  const univCountByGroup: Record<"ga" | "na" | "da", string[]> = { ga: [], na: [], da: [] };
  for (const g of ["ga", "na", "da"] as const) {
    if (jeongsiByGroup[g]) univCountByGroup[g].push(jeongsiByGroup[g]!.universityId);
  }
  // (단일 슬롯 구조라 collision 가능성 없음 — 향후 multi-slot 도입 시 검출에 사용)

  return { valid: errors.length === 0, errors };
}
