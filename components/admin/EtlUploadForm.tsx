"use client";

/**
 * EtlUploadForm — PDF 업로드 + 메타데이터 입력 (Day 10)
 *
 * UI 흐름:
 *   1. PDF 파일 선택 (드래그앤드롭 + 클릭)
 *   2. universityId / year 입력
 *   3. 업로드 버튼 → POST /api/admin/etl-upload
 *   4. 진행 상태 메시지 (1차 UTF-8 → 2차 Adobe-Korea1 → 3차 OCR)
 *   5. 완료 시 EtlParseResultPreview 노출 + "검수 페이지로 이동" CTA
 *
 * 파일 한도: 10MB / .pdf 만.
 */

import * as React from "react";
import Link from "next/link";
import { CloudUpload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EtlParseResultPreview } from "./EtlParseResultPreview";
import type { ParsedAdmissionPartial, ParserTrustLevel } from "../../scripts/etl/parsers/types";
import type { CsatMinimum } from "@/types/admission";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface UploadResponse {
  success: boolean;
  stagingId: string;
  trustLevel: ParserTrustLevel;
  toolChain: string[];
  parsed: ParsedAdmissionPartial;
  csatMinimumFinalized: CsatMinimum | null;
}

type Phase = "idle" | "uploading" | "done" | "error";

export interface EtlUploadFormProps {
  /** 테스트 주입 — 실 fetch 차단 */
  fetchOverride?: typeof fetch;
}

export function EtlUploadForm({ fetchOverride }: EtlUploadFormProps): React.ReactElement {
  const [file, setFile] = React.useState<File | null>(null);
  const [universityId, setUniversityId] = React.useState("");
  const [year, setYear] = React.useState<string>(String(new Date().getFullYear() + 1));
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progressMessage, setProgressMessage] = React.useState<string>("");
  const [result, setResult] = React.useState<UploadResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 업로드 가능해요.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(`파일 크기가 한도(10MB)를 초과했어요. (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("PDF 파일을 선택해주세요.");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(universityId)) {
      setError("대학 ID는 영숫자 1~50자만 가능해요. (예: yonsei)");
      return;
    }
    const yearNum = Number.parseInt(year, 10);
    if (!Number.isFinite(yearNum) || yearNum < 2025 || yearNum > 2099) {
      setError("학년도는 2025~2099 범위로 입력해주세요.");
      return;
    }

    setPhase("uploading");
    setError(null);
    setResult(null);
    setProgressMessage("업로드 중…");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("universityId", universityId);
    fd.append("year", String(yearNum));
    fd.append("sourceFilename", file.name);

    // 사용자 가시성을 위한 단계별 메시지 — 실 처리는 서버에서 동기 진행
    const tick = setInterval(() => {
      setProgressMessage((prev) => {
        if (prev.includes("UTF-8")) return "2차 시도: Adobe-Korea1 폰트 매핑 중…";
        if (prev.includes("Adobe-Korea1")) return "3차 시도: OCR (Tesseract) 진행 중…";
        return "1차 시도: UTF-8 텍스트 추출 중…";
      });
    }, 1500);

    try {
      const fetchFn = fetchOverride ?? fetch;
      const res = await fetchFn("/api/admin/etl-upload", { method: "POST", body: fd });
      clearInterval(tick);

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; code?: string };
        const detail = data.detail ? ` (${data.detail.slice(0, 200)})` : "";
        setError(`${data.error ?? "업로드 실패"}${detail}`);
        setPhase("error");
        return;
      }

      const data = (await res.json()) as UploadResponse;
      setResult(data);
      setPhase("done");
      setProgressMessage("");
    } catch (e) {
      clearInterval(tick);
      setError((e as Error).message);
      setPhase("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-component="etl-upload-form"
      data-phase={phase}
      className="flex flex-col gap-4"
    >
      {/* 드래그앤드롭 영역 */}
      <div
        data-element="drop-zone"
        data-drag-over={dragOver ? "true" : "false"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition",
          dragOver
            ? "border-brand-500 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20"
            : "border-border hover:border-brand-300 hover:bg-muted/40",
        )}
      >
        <CloudUpload aria-hidden className="h-8 w-8 text-brand-600" />
        <p className="text-sm font-medium">
          {file ? file.name : "PDF 파일을 끌어다 놓거나 클릭"}
        </p>
        <p className="text-2xs text-muted-foreground">최대 10MB · .pdf 파일만</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          aria-label="PDF 파일 선택"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* 메타데이터 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="etl-univ-id" className="text-xs">대학 ID (e.g., yonsei)</Label>
          <Input
            id="etl-univ-id"
            type="text"
            value={universityId}
            onChange={(e) => setUniversityId(e.target.value.trim())}
            placeholder="yonsei"
            disabled={phase === "uploading"}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="etl-year" className="text-xs">학년도</Label>
          <Input
            id="etl-year"
            type="number"
            min={2025}
            max={2099}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            disabled={phase === "uploading"}
          />
        </div>
      </div>

      {/* 진행 상태 */}
      {phase === "uploading" && (
        <div
          data-element="upload-progress"
          className="flex items-center gap-2 rounded-md border border-brand-300 bg-brand-50/40 p-2 text-xs text-brand-800 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-300"
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          <span>{progressMessage}</span>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div
          role="alert"
          data-testid="etl-upload-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/* 제출 버튼 */}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={!file || phase === "uploading"}
          className="bg-brand-600 hover:bg-brand-700"
        >
          {phase === "uploading" ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              업로드·파싱 중…
            </>
          ) : (
            "업로드 + 파싱"
          )}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/etl-status">검수 페이지로 →</Link>
        </Button>
      </div>

      {/* 결과 미리보기 */}
      {result && (
        <section
          data-element="upload-result"
          className="mt-4 flex flex-col gap-3 rounded-lg border bg-background p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">파싱 결과</h3>
            <span className="text-2xs text-muted-foreground">
              stagingId: <code className="font-mono">{result.stagingId}</code>
            </span>
          </div>
          <EtlParseResultPreview
            parsed={result.parsed}
            toolChain={result.toolChain}
            csatMinimumFinalized={result.csatMinimumFinalized}
          />
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/etl-status`}>검수 후 승격하기 →</Link>
            </Button>
          </div>
        </section>
      )}
    </form>
  );
}
