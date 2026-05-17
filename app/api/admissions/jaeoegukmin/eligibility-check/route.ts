/**
 * POST /api/admissions/jaeoegukmin/eligibility-check (P-013, 공개)
 *
 * 사용자가 category(재외국민/외국인/12년외국교육/북한이탈) + 보조 입력을 보내면
 * lib/admission/jaeoegukmin-eligibility.ts 의 classifyEligibility 호출.
 *
 * 입력 스키마(JaeoegukminEligibilitySchema) → helper 입력 형식(JaeoegukminInput) 어댑팅.
 */

import { NextRequest, NextResponse } from "next/server";
import { zodErrorResponse } from "@/lib/api-auth";
import {
  JaeoegukminEligibilitySchema,
  type JaeoegukminEligibilityInput,
} from "@/lib/schemas/api/admissions";
import {
  classifyEligibility,
  type JaeoegukminInput,
} from "@/lib/admission/jaeoegukmin-eligibility";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = JaeoegukminEligibilitySchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const helperInput = adaptToHelperInput(parsed.data);
  const result = classifyEligibility(helperInput);

  return NextResponse.json({
    category: parsed.data.category,
    ...result,
  });
}

/** API 스키마(category + 보조 필드) → helper 입력 형식 어댑팅. */
function adaptToHelperInput(api: JaeoegukminEligibilityInput): JaeoegukminInput {
  // category 자체가 사용자 자기진단 결과 — helper 는 raw 필드로 다시 분류.
  // 추정 매핑:
  //   - overseas_korean    → 한국 국적 + 부모 동반 거주 (parentResidence)
  //   - foreigner          → 외국 국적
  //   - foreign_education_12yr → 한국 국적이지만 외국 12년 교육
  //   - north_korean_defector  → 별도 처리 — helper 가 "not_eligible" 반환 후 caveats 로 안내
  const hasKoreanNationality =
    api.category === "foreigner" ? !!api.foreignNationality === false : true;
  return {
    graduatedAbroad: true, // 본 폼 접근 자체가 외국 학교 졸업자 전제
    studentMonthsAbroad: api.overseasMonths ?? 0,
    parentMonthsAbroad: api.parentResidence ? (api.overseasMonths ?? 0) : 0,
    hasKoreanNationality,
    foreignSchoolYears: api.foreignSchoolYears ?? 0,
  };
}
