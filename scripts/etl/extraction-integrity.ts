/**
 * ETL 추출물 무결성 게이트 (진단 P1-3) — 순수 함수, 테스트 가능.
 *
 * load-admissions 가 적재 전 각 추출 JSON(meta+result)을 이 함수로 검사한다.
 * 과거 버그: build-*.py 가 체크섬 실패에도 JSON 을 생성하고 load 가 검증을 미참조 →
 * 검증 실패분(예: 충남대 PDF 가 실제 2026 학년도)이 사람 개입 없이 적재 가능했음.
 *
 * 거부(ok=false) 기준 — 정합성 하드 실패:
 *   - result.year ≠ 기대 학년도
 *   - meta.sourceDocYear ≠ 기대 학년도  (요강 본문 학년도 불일치 = 충남대 2026 케이스 자동 차단)
 *   - meta.checksumPassed === false      (빌더의 명시적 검증 실패 판정)
 *   - meta.rowSumValidation.failed > 0   (행합 파싱 붕괴 — 오탐 없는 하드 실패)
 *
 * 경고만(ok 유지) — false-positive 방지:
 *   - meta.colTotalValidation 의 match=false : 고려대 재직자 ◉(고정정원 아님) 처럼 의도된
 *     열합 불일치가 정상 존재 → 차단하지 않고 검수 경고만. 빌더가 진짜 실패면 checksumPassed=false 로 표기.
 */

export interface IntegrityResult {
  ok: boolean;
  reasons: string[]; // 거부 사유 (있으면 적재 차단)
  warnings: string[]; // 검수 권장 (적재는 허용)
}

export function checkExtractionIntegrity(
  meta: unknown,
  result: unknown,
  expectedYear: number,
): IntegrityResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const m = (meta ?? {}) as Record<string, unknown>;
  const r = (result ?? {}) as Record<string, unknown>;

  const year = r.year;
  if (typeof year === "number" && year !== expectedYear) {
    reasons.push(`result.year=${year} ≠ 기대 ${expectedYear}`);
  }

  const sdy = m.sourceDocYear;
  if (typeof sdy === "number" && sdy !== expectedYear) {
    reasons.push(`sourceDocYear=${sdy} ≠ 기대 ${expectedYear} (요강 본문 학년도 불일치)`);
  }

  if (m.checksumPassed === false) {
    reasons.push("meta.checksumPassed=false (빌더 검증 실패)");
  }

  const rowVal = m.rowSumValidation as { failed?: unknown } | undefined;
  if (rowVal && typeof rowVal.failed === "number" && rowVal.failed > 0) {
    reasons.push(`rowSum 실패 ${rowVal.failed}건`);
  }

  const col = m.colTotalValidation;
  if (Array.isArray(col)) {
    const mism = col.filter(
      (c): c is { track?: string; match: boolean } =>
        !!c && typeof c === "object" && (c as { match?: unknown }).match === false,
    );
    if (mism.length) {
      warnings.push(
        `colTotal 불일치 ${mism.length}건 (검수 권장; 의도된 불일치면 무시): ${mism
          .map((c) => c.track ?? "?")
          .join(", ")}`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons, warnings };
}
