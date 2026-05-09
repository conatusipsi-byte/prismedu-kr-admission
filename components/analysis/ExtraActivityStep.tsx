"use client";

/**
 * ExtraActivityStep — Step 3
 *
 * 생기부 비교과 정량 입력. 자소서 영역은 의도적으로 미포함 (24학번부터 폐지).
 * 본 Step에 자소서 입력 필드가 추가되면 회귀 테스트가 깨진다.
 */

import * as React from "react";
import {
  ExtraActivityInput,
  type ExtraActivityInputValue,
  EMPTY_EXTRA_ACTIVITY,
} from "./ExtraActivityInput";

export type ExtraActivityStepValue = ExtraActivityInputValue;
export const EMPTY_EXTRA_ACTIVITY_STEP: ExtraActivityStepValue = EMPTY_EXTRA_ACTIVITY;

export interface ExtraActivityStepProps {
  value: ExtraActivityStepValue;
  onChange: (next: ExtraActivityStepValue) => void;
}

export function isExtraActivityValid(_v: ExtraActivityStepValue): boolean {
  // 비교과는 모두 optional (정직성 원칙 P-002 — 빈 값에 페널티 없음).
  return true;
}

export function ExtraActivityStep({
  value,
  onChange,
}: ExtraActivityStepProps): React.ReactElement {
  return (
    <div data-step="extra-activity" className="flex flex-col gap-4">
      <ExtraActivityInput value={value} onChange={onChange} />
    </div>
  );
}
