"use client";

/**
 * StagingAdmissionDetailModal — staging 상세 검수 + 승격 (Day 10)
 *
 * 흐름:
 *   1. 운영자가 SuspiciousAdmissionsList에서 행 클릭
 *   2. modal에 파싱 결과 + raw 텍스트(unparsedSections) 양쪽 표시
 *   3. 운영자가 departmentId / trackKind / trackName / quotaInitial / 메모 입력
 *   4. "승격" → POST /api/admin/etl-promote
 *   5. 성공 시 onPromoted(stagingId) → 부모가 목록 갱신
 *
 * 정직성 (P-002):
 *   - 자동 승격 절대 X — 운영자가 모든 필수 필드 채워야 활성화
 *   - 필수 필드 비어있으면 버튼 disabled + 누락 항목 안내
 *   - "확정 합격" 표현 0건 (회귀 테스트 강제)
 */

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EtlParseResultPreview } from "./EtlParseResultPreview";
import type { StagingEntry } from "@/lib/admission/mock-etl-staging";

const TRACK_KINDS = [
  "susi_subject",
  "susi_comprehensive",
  "susi_essay",
  "susi_practical",
  "jeongsi_ga",
  "jeongsi_na",
  "jeongsi_da",
  "additional",
  "jaeoegukmin",
] as const;

export interface StagingAdmissionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: StagingEntry | null;
  onPromoted: (stagingId: string) => void;
  /** 테스트 주입 — 실 fetch 차단 */
  fetchOverride?: typeof fetch;
}

export function StagingAdmissionDetailModal({
  open,
  onOpenChange,
  entry,
  onPromoted,
  fetchOverride,
}: StagingAdmissionDetailModalProps): React.ReactElement | null {
  const [departmentId, setDepartmentId] = React.useState("");
  const [trackKind, setTrackKind] = React.useState<typeof TRACK_KINDS[number] | "">("");
  const [trackName, setTrackName] = React.useState("");
  const [quotaInitial, setQuotaInitial] = React.useState("");
  const [reviewerNotes, setReviewerNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // entry 변경 시 폼 초기값 — 추출 후보로 자동 채움
  React.useEffect(() => {
    if (!entry) return;
    setDepartmentId("");
    setTrackKind(entry.parsed.trackKindCandidates[0]?.kind ?? "");
    setTrackName(""); // 운영자가 직접 입력
    setQuotaInitial("");
    setReviewerNotes("");
    setError(null);
  }, [entry]);

  if (!entry) return null;

  const missingFields: string[] = [];
  if (!departmentId.trim()) missingFields.push("학과 ID");
  if (!trackKind) missingFields.push("트랙 종류");
  if (!trackName.trim()) missingFields.push("트랙 정식명");
  const quotaNum = Number.parseInt(quotaInitial, 10);
  if (!Number.isFinite(quotaNum) || quotaNum < 1) missingFields.push("정원");
  const canPromote = missingFields.length === 0 && !pending;

  async function handlePromote() {
    if (!canPromote || !entry) return;
    setPending(true);
    setError(null);
    try {
      const fetchFn = fetchOverride ?? fetch;
      const res = await fetchFn("/api/admin/etl-promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stagingId: entry.id,
          departmentId: departmentId.trim(),
          trackKind,
          trackName: trackName.trim(),
          quotaInitial: quotaNum,
          reviewerNotes: reviewerNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `승격 실패 (${res.status})`);
      }
      onPromoted(entry.id);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-component="staging-admission-detail-modal"
        data-staging-id={entry.id}
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{entry.universityName} · {entry.year}학년도 검수</DialogTitle>
          <DialogDescription>
            파일: <code className="font-mono">{entry.sourceFilename}</code>
            {" · "}
            stagingId: <code className="font-mono text-2xs">{entry.id}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 좌측: 파싱 결과 미리보기 */}
          <section data-element="parsed-preview" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold">자동 추출 결과</h3>
            <EtlParseResultPreview
              parsed={entry.parsed}
              toolChain={entry.toolChain}
              csatMinimumFinalized={null}
            />
          </section>

          {/* 우측: 운영자 보강 입력 */}
          <section data-element="reviewer-inputs" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold">운영자 검수 입력</h3>

            <div className="flex flex-col gap-1">
              <Label htmlFor="dept-id" className="text-xs">학과 ID *</Label>
              <Input
                id="dept-id"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value.trim())}
                placeholder="business / med / ..."
              />
              {entry.parsed.departmentNameCandidates.length > 0 && (
                <p className="text-2xs text-muted-foreground">
                  추출 후보: {entry.parsed.departmentNameCandidates.slice(0, 3).join(", ")}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="track-kind" className="text-xs">트랙 종류 *</Label>
              <Select
                value={trackKind}
                onValueChange={(v) => setTrackKind(v as typeof TRACK_KINDS[number])}
              >
                <SelectTrigger id="track-kind"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {TRACK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="track-name" className="text-xs">트랙 정식명 *</Label>
              <Input
                id="track-name"
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                placeholder="활동우수형(학생부종합) / 일반전형 / ..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="quota" className="text-xs">정원 (모집인원) *</Label>
              <Input
                id="quota"
                type="number"
                min={1}
                value={quotaInitial}
                onChange={(e) => setQuotaInitial(e.target.value)}
                placeholder="64"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="reviewer-notes" className="text-xs">검수 메모 (선택)</Label>
              <Textarea
                id="reviewer-notes"
                rows={3}
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="OCR 인식 오류 보정 / unparsedSections에서 보강한 내용 등"
                className="text-2xs"
              />
            </div>

            {missingFields.length > 0 && (
              <p
                data-element="missing-fields-notice"
                className="rounded-md border border-amber-200 bg-amber-50/70 p-2 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200"
              >
                필수 입력 누락: {missingFields.join(", ")}
              </p>
            )}

            {error && (
              <p
                role="alert"
                data-testid="promote-error"
                className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-2xs text-destructive"
              >
                {error}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button
            type="button"
            onClick={handlePromote}
            disabled={!canPromote}
            data-testid="promote-button"
            className={cn(
              "bg-mint-600 hover:bg-mint-700",
              !canPromote && "opacity-50",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                승격 처리 중…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                admissions로 승격
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
