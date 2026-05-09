/**
 * pdftotext 인코딩 fallback chain
 *
 * 흐름 (operations.md §10):
 *   1차  pdftotext -enc UTF-8                → trustLevel="trusted"
 *   2차  pdftotext -enc Adobe-Korea1          → trustLevel="trusted-fallback"
 *        (한국어 PDF에서 폰트 매핑 누락 시 cid 깨짐 → Adobe-Korea1로 복구)
 *   3차  callee가 ocr-fallback.ts로 전환     → trustLevel="suspicious"
 *
 * 본 모듈은 1·2차만 처리. 3차 OCR은 호출자가 별도 fallback 분기.
 *
 * 외부 의존성:
 *   - poppler-utils의 pdftotext 바이너리 (Linux: apt-get install poppler-utils,
 *     macOS: brew install poppler, Windows: poppler-windows)
 *   - 미설치 환경에선 throw — 호출자가 OCR fallback 또는 운영자 알림.
 *
 * 보안:
 *   - PDF 파일 경로는 호출자가 검증된 경로만 전달. shell 인젝션 차단을 위해
 *     execFile (배열 인자) 사용 — execSync(string)와 다름.
 *   - 텍스트 길이 5MB 초과 시 잘라냄 (메모리 보호).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ExtractionAttempt,
  PdfExtractionResult,
} from "./types";

const execFileAsync = promisify(execFile);

/** pdftotext 호출 시 30초 타임아웃 — 거대 PDF에서 행업 방지 */
const PDFTOTEXT_TIMEOUT_MS = 30_000;
/** 추출 텍스트 최대 5MB — 그 이상이면 잘라냄 */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    public readonly attempts: ExtractionAttempt[],
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

/**
 * pdftotext 인코딩 fallback chain.
 *
 * @param pdfPath 절대 경로 (호출자가 검증)
 * @returns 성공한 단계의 텍스트 + trustLevel + 시도 로그
 * @throws PdfExtractionError 두 단계 모두 실패 — 호출자가 OCR로 전환
 */
export async function extractTextFromPdf(pdfPath: string): Promise<PdfExtractionResult> {
  const attempts: ExtractionAttempt[] = [];

  // 1차 — UTF-8 (기본)
  const utf8 = await tryPdftotext(pdfPath, "UTF-8");
  attempts.push(utf8.attempt);
  if (utf8.text != null && hasReadableKorean(utf8.text)) {
    return {
      text: truncateText(utf8.text),
      trustLevel: "trusted",
      tool: "pdftotext-utf8",
      attempts,
    };
  }

  // 2차 — Adobe-Korea1 (한국어 폰트 매핑)
  const adobe = await tryPdftotext(pdfPath, "Adobe-Korea1");
  attempts.push(adobe.attempt);
  if (adobe.text != null && hasReadableKorean(adobe.text)) {
    return {
      text: truncateText(adobe.text),
      trustLevel: "trusted-fallback",
      tool: "pdftotext-adobe-korea1",
      attempts,
    };
  }

  throw new PdfExtractionError(
    "pdftotext UTF-8·Adobe-Korea1 모두 한국어 추출 실패. OCR fallback 필요.",
    attempts,
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   내부 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

interface PdftotextAttempt {
  text: string | null;
  attempt: ExtractionAttempt;
}

async function tryPdftotext(
  pdfPath: string,
  encoding: "UTF-8" | "Adobe-Korea1",
): Promise<PdftotextAttempt> {
  const tool = `pdftotext-${encoding.toLowerCase().replace("_", "-")}`;
  try {
    // -enc 인자 + - (stdout) 출력
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-enc", encoding, "-layout", pdfPath, "-"],
      { timeout: PDFTOTEXT_TIMEOUT_MS, maxBuffer: MAX_TEXT_BYTES * 2 },
    );
    return {
      text: stdout,
      attempt: { tool, success: true, textLength: stdout.length },
    };
  } catch (e) {
    const message = (e as Error).message;
    return {
      text: null,
      attempt: { tool, success: false, errorMessage: message.slice(0, 500) },
    };
  }
}

/**
 * 추출된 텍스트가 한국어를 의미 있게 포함하는지 검증.
 *
 * pdftotext는 폰트 매핑 누락 시 cid 깨짐(`...`) 또는 빈 문자열을
 * 반환할 수 있다. 한국어 글자 비율 ≥ 5% 또는 한국어 문자가 100자 이상이면
 * "의미 있는 추출"로 간주.
 */
export function hasReadableKorean(text: string): boolean {
  if (!text) return false;
  // 한글 음절 (가-힣) 카운트
  let koreanCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) koreanCount++;
  }
  if (koreanCount >= 100) return true;
  // 짧은 PDF는 절대량 부족 → 비율로 판정
  const ratio = koreanCount / Math.max(1, text.length);
  return ratio >= 0.05;
}

function truncateText(text: string): string {
  // UTF-8 byte 길이 기준 잘라냄 — JavaScript string은 UTF-16이라 byte 단위 변환 후 잘라야 정확.
  // 단순화 — 5MB는 거의 도달 불가능. 글자 수로 byte 약수 (한글 3 byte) 추정.
  const maxChars = MAX_TEXT_BYTES / 3;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[truncated by parser — exceeded 5MB]";
}
