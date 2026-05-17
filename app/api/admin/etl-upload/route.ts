/**
 * POST /api/admin/etl-upload — PDF 업로드 + 파싱 + admissions_staging 적재 (Supabase).
 *
 * ⚠️ Phase 4 단계: processPdfToStaging(scripts/etl/admissions-sync.ts) 가 Firestore 강결합.
 *    본 라우트는 임시로 metadata 만 admissions_staging 에 적재.
 *    실 파싱은 운영자 로컬에서 `npx tsx scripts/etl/parse-pdfs.ts` 사용 (poppler-utils 필요).
 *    후속 PR 에서 scripts/etl/admissions-sync.ts 까지 Supabase 화하여 본 라우트 복구.
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireMasterAuth } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminSupabase } from "@/lib/supabase-server";
import { extractTextFromPdf } from "../../../../scripts/etl/parsers/pdf-text";
import { normalizeAdmissionText } from "../../../../scripts/etl/parsers/normalizer";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ID_RE = /^[a-zA-Z0-9_-]{1,50}$/;
const FILENAME_RE = /^[\w가-힣()\-. ]{1,200}\.pdf$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "admin_etl_upload",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 30,
  });
  if (rateErr) return rateErr;

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

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "etl-upload-"));
  const tempPdfPath = path.join(tempDir, sourceFilenameRaw);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(tempPdfPath, buf);

    // PDF 추출 + normalize (poppler-utils 필요)
    let extraction;
    try {
      extraction = await extractTextFromPdf(tempPdfPath);
    } catch (e) {
      const message = (e as Error).message;
      const missingBin = /ENOENT|not found|command not found/i.test(message);
      return NextResponse.json(
        {
          error: missingBin
            ? "ETL 외부 도구(pdftotext)가 설치되지 않은 환경입니다. 운영자 로컬에서 실행해주세요."
            : "PDF 파싱 실패",
          detail: message.slice(0, 300),
          code: missingBin ? "ETL_TOOLS_MISSING" : "ETL_PARSE_FAILED",
        },
        { status: 503 },
      );
    }

    const parsed = normalizeAdmissionText(extraction.text, {
      inputTrustLevel: extraction.trustLevel,
    });

    // staging 적재
    const stagingId = `${universityId}_${year}_${Date.now()}`;
    const sb = getAdminSupabase();
    const { error } = await sb.from("admissions_staging").insert({
      id: stagingId,
      university_id: universityId,
      department_id: "_pending",
      year,
      tracks: { parsed, raw: extraction.text.slice(0, 50_000) },
      available_track_kinds: parsed.trackKindCandidates.map((c) => c.kind),
      source: {
        filename: sourceFilenameRaw,
        uploadedBy: auth.uid,
        uploadedAt: new Date().toISOString(),
        textLength: extraction.text.length,
        tool: extraction.tool,
      },
      parser_trust_level: extraction.trustLevel,
      needs_review: true,
    });
    if (error) {
      console.error("[/api/admin/etl-upload] insert failed:", error.message);
      return NextResponse.json(
        { error: "ETL 적재 실패. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      stagingId,
      trustLevel: extraction.trustLevel,
      toolChain: [extraction.tool],
      parsed,
    });
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
