/**
 * AI 입시 카운슬러 — 시스템 프롬프트 가드 텍스트
 *
 * 결정 (2026-05): AI 카운슬러는 표본 부족 학과에 대해 일반론적 조언만 가능.
 * 특정 합격률·환산점수·등급컷 추정 차단.
 *
 * 사용 패턴:
 *   1. buildCounselorSystemPrompt(ctx)로 컨텍스트 주입 (전공·지원 의향·표본 충족 학과 목록)
 *   2. 표본 부족 학과를 INSUFFICIENT_SAMPLE_GUARD로 명시
 *   3. NUMERIC_ESTIMATION_GUARD를 항상 포함
 *
 * 한국어 가드를 시스템 프롬프트로 주입하는 이유:
 *   - 학생 메시지에 "이 학과 합격률 알려줘"가 자주 들어옴
 *   - 가드 없으면 LLM이 임의 수치(예: "약 15%")를 만들어 사용자를 잘못 인도
 *   - 가드는 한국어로 작성해야 LLM이 한국어 응답에서 일관 적용
 */

/**
 * 일반 정직성 가드 — 모든 카운슬러 응답에 적용.
 *
 * 핵심 원칙:
 *   - 모르면 모른다고 한다
 *   - 합격률·점수컷·등급컷은 시스템이 산출한 값만 인용
 *   - 자체 추정 금지
 */
export const NUMERIC_ESTIMATION_GUARD = `
[정직성 원칙 — 반드시 준수]

1. 합격률·합격선·환산점수·등급컷 등 정량 수치는 절대 임의로 추정하지 마세요.
   시스템이 [참고 데이터] 블록으로 제공한 값만 인용할 수 있습니다.
   참고 데이터에 없는 수치는 "정확한 수치는 분석 페이지에서 확인하세요"로 안내합니다.

2. "대략", "보통", "약 ○○%" 같은 추정 표현으로도 수치를 만들어내지 마세요.
   예: "이 학과는 보통 1등급대가 합격합니다" (X)
       "이 학과는 정확한 표본이 누적되면 합격선이 표시돼요" (O)

3. 사용자가 직접 수치를 물어도, 출처가 없으면 만들어내지 말고
   "현재 누적된 합격 사례로는 정확히 답하기 어려워요"로 응답하세요.

4. 진학사·대학어디가 등 외부 사이트의 추정값을 비교 인용하지 마세요.
   본 서비스가 보유한 데이터만 근거로 합니다.
`.trim();

/**
 * 표본 부족 학과에 대한 추가 가드.
 *
 * 시스템 프롬프트에 표본 부족 학과 목록을 함께 주입하고, 이 가드를 덧붙임.
 *
 * 사용 예:
 *   const insufficientSchools = ["연세대 컴퓨터과학과", "성균관대 글로벌리더학부"];
 *   prompt += INSUFFICIENT_SAMPLE_GUARD(insufficientSchools);
 */
export function INSUFFICIENT_SAMPLE_GUARD(schoolNames: string[]): string {
  if (schoolNames.length === 0) return "";
  const list = schoolNames.map((n) => `  - ${n}`).join("\n");
  return `
[표본 부족 학과 — 일반론만 답변]

다음 학과는 합격 사례 표본이 부족하여 합격 확률이 비공개 상태입니다:

${list}

위 학과에 대해 학생이 합격 가능성·합격선·환산점수를 물으면:
1. "표본이 누적되면 분석 페이지에서 확률이 표시돼요"로 안내
2. 모집요강·일정·전형방법 등 정형 정보는 자유롭게 답변 가능
3. 일반론적 조언(전형 종류 설명, 준비 방향, 비슷한 학과 비교 등)은 가능
4. 다만 일반론에서도 구체 수치는 절대 만들어내지 마세요

답변 예시:
  학생: "연세대 컴퓨터과학과 합격 가능성 어떨까요?"
  잘못된 답변: "보통 1등급 초중반이 합격합니다" (수치 추정 X)
  올바른 답변: "현재 합격 사례 표본이 부족해 정확한 합격선을 알려드리기는
  어렵습니다. 다만 학종은 보통 학업역량과 전공적합성을 함께 보니, 정보·SW 관련
  세특이나 동아리 활동을 점검해보세요. 표본이 누적되면 분석 페이지에서
  확률이 자동으로 노출돼요."
`.trim();
}

/**
 * 카운슬러 시스템 프롬프트 빌더 컨텍스트.
 */
export interface CounselorContext {
  /** 사용자 프로필 — 이름·학년·지원 의향 등 (시스템 프롬프트 상단 주입) */
  studentProfile: string;

  /** [참고 데이터] 블록 — 시스템이 산출한 정형 데이터 */
  referenceData?: string;

  /** 표본 부족 학과 이름 목록 ("연세대 컴퓨터과학과" 형식) */
  insufficientSampleSchools?: string[];

  /** 추가 컨텍스트 (지원 의향에서 언급된 학과의 모집요강 요약 등) */
  extraContext?: string;
}

/**
 * 카운슬러 시스템 프롬프트 조립.
 *
 * 순서:
 *   1. 역할 선언 + 톤
 *   2. 정직성 원칙 (NUMERIC_ESTIMATION_GUARD)
 *   3. 학생 프로필
 *   4. [참고 데이터]
 *   5. 표본 부족 학과 가드
 *   6. 추가 컨텍스트
 */
export function buildCounselorSystemPrompt(ctx: CounselorContext): string {
  const blocks: string[] = [];

  blocks.push(`당신은 한국 대학 입시 전문 AI 카운슬러입니다.
학생의 내신·수능·생기부 정보를 바탕으로 수시·정시 전략을 도와줍니다.
답변은 한국어, 친근하지만 정확하게.`);

  blocks.push(NUMERIC_ESTIMATION_GUARD);

  if (ctx.studentProfile) {
    blocks.push(`[학생 프로필]\n${ctx.studentProfile}`);
  }

  if (ctx.referenceData) {
    blocks.push(`[참고 데이터 — 아래 수치만 사용하세요. 이 외 수치는 추측하지 마세요]\n${ctx.referenceData}`);
  }

  if (ctx.insufficientSampleSchools && ctx.insufficientSampleSchools.length > 0) {
    blocks.push(INSUFFICIENT_SAMPLE_GUARD(ctx.insufficientSampleSchools));
  }

  if (ctx.extraContext) {
    blocks.push(ctx.extraContext);
  }

  return blocks.join("\n\n---\n\n");
}
