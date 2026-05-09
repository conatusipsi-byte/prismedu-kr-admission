/**
 * Tesseract 한국어 OCR — pdftotext 두 단계 모두 실패 시 마지막 fallback
 *
 * 흐름:
 *   1. PDF → 페이지별 PNG 변환 (pdftoppm — poppler-utils 내장)
 *   2. 각 PNG → tesseract -l kor (한국어 모델)
 *   3. 페이지별 텍스트 join + trustLevel="suspicious" 강제
 *
 * 외부 의존성:
 *   - poppler-utils의 pdftoppm
 *   - tesseract (apt-get install tesseract-ocr tesseract-ocr-kor)
 *   - 미설치 환경 throw → 호출자가 운영자 알림 + admissionsStaging 미생성
 *
 * trustLevel 강제:
 *   OCR은 시각 인식이라 노이즈가 많다. 결과는 항상 "suspicious" — 운영자가
 *   admin 검수 후 승격해야 admissions(live)에 반영. 자동 승격 절대 X.
 *
 * 비용:
 *   PDF 100페이지 OCR ≈ 약 5분 + 디스크 임시 파일. 시즌 외엔 호출 빈도 낮음.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtractionAttempt, PdfExtractionResult } from "./types";

const execFileAsync = promisify(execFile);

const PDFTOPPM_TIMEOUT_MS = 60_000;
const TESSERACT_PER_PAGE_TIMEOUT_MS = 30_000;
/** 페이지 한도 — 모집요강은 보통 30~60페이지. 거대 PDF는 운영자 분할 권장. */
const MAX_PAGES = 100;

export class OcrFallbackError extends Error {
  constructor(
    message: string,
    public readonly attempts: ExtractionAttempt[],
  ) {
    super(message);
    this.name = "OcrFallbackError";
  }
}

export interface OcrOptions {
  /** 한국어 + 영어 혼용 PDF 대응. 기본 "kor". 영어 비중 크면 "kor+eng". */
  languages?: string;
  /** 1페이지당 OCR 타임아웃 — 손상된 페이지 무한 대기 차단 */
  perPageTimeoutMs?: number;
  /** 임시 파일 디렉토리 (테스트 주입용) */
  tempDir?: string;
}

/**
 * PDF → 페이지별 OCR → 텍스트 join.
 *
 * @param pdfPath 절대 경로
 * @returns trustLevel="suspicious" 강제. 운영자 검수 필수.
 */
export async function ocrPdfFallback(
  pdfPath: string,
  opts: OcrOptions = {},
): Promise<PdfExtractionResult> {
  const attempts: ExtractionAttempt[] = [];
  const tempDir = await fs.promises.mkdtemp(
    path.join(opts.tempDir ?? os.tmpdir(), "etl-ocr-"),
  );

  try {
    // 1. PDF → PNG (pdftoppm)
    const pngPrefix = path.join(tempDir, "page");
    const ppmAttempt = await tryPdftoppm(pdfPath, pngPrefix);
    attempts.push(ppmAttempt);
    if (!ppmAttempt.success) {
      throw new OcrFallbackError(
        "pdftoppm 변환 실패. PDF 손상 또는 도구 미설치 가능성.",
        attempts,
      );
    }

    // 2. 디렉토리에서 PNG 파일 목록 (정렬 — 페이지 순서)
    const files = (await fs.promises.readdir(tempDir))
      .filter((f) => f.startsWith("page") && f.endsWith(".png"))
      .sort()
      .slice(0, MAX_PAGES);

    if (files.length === 0) {
      throw new OcrFallbackError("pdftoppm 변환 결과 PNG 0건.", attempts);
    }

    // 3. 각 PNG → Tesseract OCR (직렬 — 메모리·CPU 보호)
    const pageTexts: string[] = [];
    const languages = opts.languages ?? "kor";
    const perPageTimeout = opts.perPageTimeoutMs ?? TESSERACT_PER_PAGE_TIMEOUT_MS;

    for (const f of files) {
      const pngPath = path.join(tempDir, f);
      const tsAttempt = await tryTesseract(pngPath, languages, perPageTimeout);
      attempts.push(tsAttempt);
      if (tsAttempt.success && tsAttempt.text) {
        pageTexts.push(tsAttempt.text);
      }
    }

    if (pageTexts.length === 0) {
      throw new OcrFallbackError("Tesseract OCR 페이지 0건 성공.", attempts);
    }

    return {
      text: pageTexts.join("\n\n"),
      trustLevel: "suspicious", // OCR은 항상 suspicious — 운영자 검수 강제
      tool: `tesseract-${languages}`,
      attempts,
    };
  } finally {
    // 임시 파일 정리 — 실패해도 tempDir 누적 방지
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   내부 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

async function tryPdftoppm(pdfPath: string, outPrefix: string): Promise<ExtractionAttempt> {
  try {
    await execFileAsync(
      "pdftoppm",
      ["-r", "200", "-png", pdfPath, outPrefix], // 200 DPI — OCR 품질·시간 균형
      { timeout: PDFTOPPM_TIMEOUT_MS },
    );
    return { tool: "pdftoppm", success: true };
  } catch (e) {
    return {
      tool: "pdftoppm",
      success: false,
      errorMessage: (e as Error).message.slice(0, 500),
    };
  }
}

interface TesseractAttempt extends ExtractionAttempt {
  text?: string;
}

async function tryTesseract(
  pngPath: string,
  languages: string,
  timeoutMs: number,
): Promise<TesseractAttempt> {
  const tool = `tesseract-${languages}`;
  try {
    const { stdout } = await execFileAsync(
      "tesseract",
      [pngPath, "stdout", "-l", languages],
      { timeout: timeoutMs },
    );
    return {
      tool,
      success: true,
      text: stdout,
      textLength: stdout.length,
    };
  } catch (e) {
    return {
      tool,
      success: false,
      errorMessage: (e as Error).message.slice(0, 500),
    };
  }
}
