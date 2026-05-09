/**
 * POST /api/admin/etl-upload — PDF 업로드 + 파싱 + admissionsStaging 적재
 *
 * 마스터 전용. multipart/form-data 처리.
 *
 * 흐름:
 *   1. requireMasterAuth + Rate limit
 *   2. multipart formData 파싱 (file, universityId, year, sourceFilename)
 *   3. 파일 검증 (PDF, 10MB 한도)
 *   4. 임시 디스크 저장
 *   5. processPdfToStaging 호출 (외부 도구 필요 — 미설치 시 503)
 *   6. 결과 응답
 *
 * 외부 도구 의존성 (Day 9):
 *   - pdftotext (poppler-utils)
 *   - pdftoppm + tesseract (OCR fallback)
 *   - Vercel serverless 환경에선 실행 어려움 — 운영자 로컬 또는 별도 ETL 서버 권장
 *
 * 외부 도구 미설치 시 503 + 친화적 안내.
 *
 * 정직성 (P-002):
 *   - 업로드 성공만으로 승격 X — 항상 admissionsStaging.promoted=false
 *   - 운영자가 별도 /api/admin/etl-promote 호출해야 admissions 반영
 *   - trustLevel은 processPdfToStaging이 결정 (UTF-8 trusted / OCR suspicious)
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireMasterAuth } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { processPdfToStaging } from "../../../../scripts/etl/admissions-sync";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ID_RE = /^[a-zA-Z0-9_-]{1,50}$/;
const FILENAME_RE = /^[\w가-힣()\-. ]{1,200}\.pdf$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  // 업로드는 가벼운 rate limit — 운영자가 한 시즌 200~300건 처리
  const rateErr = await enforceRateLimit({
    bucket: "admin_etl_upload",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 30,
  });
  if (rateErr) return rateErr;

  // 1. multipart/form-data 파싱
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 multipart 본문" }, { status: 400 });
  }

  const file = form.get("file");
  const universityId = String(form.get("universityId") ?? "").trim();
  const yearRaw = String(form.get("year") ?? "").trim();
  const sourceFilenameRaw = String(form.get("sourceFilename") ?? "").trim();

  // 2. 메타데이터 검증
  if (!ID_RE.test(universityId)) {
    return NextResponse.json({ error: "universityId 형식이 올바르지 않아요." }, { status: 400 });
  }
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year) || year < 2025 || year > 2099) {
    return NextResponse.json({ error: "year 범위가 올바르지 않아요. (2025~2099)" }, { status: 400 });
  }
  if (!FILENAME_RE.test(sourceFilenameRaw)) {
    return NextResponse.json({ error: "sourceFilename 형식이 올바르지 않아요. (.pdf 필수)" }, { status: 400 });
  }

  // 3. 파일 검증
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 누락됐어요." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기가 한도(${MAX_FILE_BYTES / 1024 / 1024}MB)를 초과했어요.` },
      { status: 413 },
    );
  }
  const contentType = file.type || "";
  if (!contentType.includes("pdf") && !sourceFilenameRaw.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF 파일만 업로드 가능해요." }, { status: 400 });
  }

  // 4. 임시 디스크 저장
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "etl-upload-"));
  const tempPdfPath = path.join(tempDir, sourceFilenameRaw);
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(tempPdfPath, buf);

    // 5. processPdfToStaging — 외부 도구 의존
    let result: Awaited<ReturnType<typeof processPdfToStaging>>;
    try {
      result = await processPdfToStaging(getAdminDb(), {
        pdfPath: tempPdfPath,
        universityId,
        year,
        uploadedBy: auth.uid,
        sourceFilename: sourceFilenameRaw,
      });
    } catch (e) {
      const message = (e as Error).message;
      // pdftotext / tesseract 미설치 환경 친화 안내
      const missingBin = /ENOENT|not found|command not found/i.test(message);
      console.error("[/api/admin/etl-upload] processPdfToStaging 실패:", message);
      return NextResponse.json(
        {
          error: missingBin
            ? "ETL 외부 도구(pdftotext / tesseract)가 설치되지 않은 환경입니다. 운영자 로컬 또는 별도 ETL 서버에서 실행해주세요."
            : "ETL 파싱 실패. 다른 PDF로 재시도하거나 운영팀에 문의해주세요.",
          detail: message.slice(0, 300),
          code: missingBin ? "ETL_TOOLS_MISSING" : "ETL_PARSE_FAILED",
        },
        { status: 503 },
      );
    }

    // 6. 응답
    return NextResponse.json({
      success: true,
      stagingId: result.stagingId,
      trustLevel: result.trustLevel,
      toolChain: result.toolChain,
      parsed: result.parsed,
      csatMinimumFinalized: result.csatMinimumFinalized ?? null,
    });
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
