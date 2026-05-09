"use client";

/**
 * SanitizeLogDetailModal — 로그 행 클릭 시 전체 응답 노출 모달 (master 전용)
 *
 * P-002 정책:
 *   - 원본 응답 전체 표시 — 운영자 검수 목적. firestore.rules 가 master 외 read 차단.
 *   - 사용자 ID는 마스킹된 형태만 (전체 hash 도 표시 X — 부주의 노출 방지)
 *   - 매칭된 키워드 강조 (bg-rose-100)
 */

import { X, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type SanitizeEvent,
  type SanitizeTriggerType,
  maskUid,
} from "@/lib/admission/sanitize-events";

export interface SanitizeLogDetailModalProps {
  log: SanitizeEvent | null;
  onClose: () => void;
}

const TYPE_LABEL: Record<SanitizeTriggerType, string> = {
  insufficient_sample: "표본 부족 트리거",
  blocked_keyword: "차단 키워드 발견",
  regression_suspect: "회귀 의심",
};

export function SanitizeLogDetailModal({
  log,
  onClose,
}: SanitizeLogDetailModalProps) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-component="sanitize-log-detail-modal"
        className="max-w-2xl"
      >
        {log && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {log.triggerType === "regression_suspect" ? (
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-mint-600" />
                )}
                <span>{TYPE_LABEL[log.triggerType]}</span>
                {!log.resolved && (
                  <Badge className="ml-2 bg-rose-600 text-white text-xs">미해결</Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4 text-sm">
              {/* 메타 — 마스킹된 uid + 시간 */}
              <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">발생 시각</dt>
                  <dd className="tabular-nums">
                    {new Date(log.occurredAt).toLocaleString("ko-KR")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">사용자 (마스킹)</dt>
                  <dd
                    data-element="masked-uid"
                    className="tabular-nums text-foreground"
                  >
                    {maskUid(log.saltedUidHash)}
                  </dd>
                </div>
                {log.userContext?.grade && (
                  <div>
                    <dt className="text-muted-foreground">학년</dt>
                    <dd>{log.userContext.grade}학년</dd>
                  </div>
                )}
                {log.userContext?.schoolType && (
                  <div>
                    <dt className="text-muted-foreground">출신 고교 유형</dt>
                    <dd>{log.userContext.schoolType}</dd>
                  </div>
                )}
              </dl>

              {/* 매칭된 키워드 */}
              <section>
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                  발동 키워드 ({log.matchedKeywords.length}개)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {log.matchedKeywords.map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="bg-rose-50 text-rose-700 border-rose-200"
                    >
                      {k}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* 원본 응답 (master 전용) */}
              <section>
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                  원본 LLM 응답 (master 전용)
                </p>
                <div
                  data-element="original-excerpt"
                  className="max-h-48 overflow-y-auto rounded-md border bg-background/60 p-3 text-xs leading-relaxed text-foreground"
                >
                  {log.originalResponseExcerpt}
                </div>
              </section>

              {/* sanitize 결과 */}
              <section>
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                  sanitize 결과 (사용자 노출본)
                </p>
                <div
                  data-element="sanitized-response"
                  className="max-h-48 overflow-y-auto rounded-md border bg-mint-50/40 p-3 text-xs leading-relaxed text-foreground dark:bg-mint-950/10"
                >
                  {log.sanitizedResponse}
                </div>
              </section>

              {/* 관련 학과 */}
              {log.relatedDepartments && log.relatedDepartments.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">
                    관련 학과
                  </p>
                  <ul className="text-xs text-muted-foreground">
                    {log.relatedDepartments.map((d) => (
                      <li key={`${d.universityId}/${d.departmentId}`}>
                        · {d.universityId} / {d.departmentId}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 검수 정보 */}
              {log.resolved ? (
                <section className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/10">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    ✓ 검수 완료
                  </p>
                  {log.resolvedBy && (
                    <p className="mt-0.5 text-emerald-700 dark:text-emerald-400">
                      처리자: {log.resolvedBy}
                    </p>
                  )}
                  {log.resolveNote && (
                    <p className="mt-0.5 text-emerald-700 dark:text-emerald-400">
                      메모: {log.resolveNote}
                    </p>
                  )}
                </section>
              ) : (
                <section className="rounded-md border border-rose-200 bg-rose-50/40 p-3 text-xs dark:border-rose-900 dark:bg-rose-950/10">
                  <p className="font-semibold text-rose-800 dark:text-rose-300">
                    ⚠️ 미해결 — 검수 후 처리 필요
                  </p>
                  <p className="mt-0.5 text-rose-700 dark:text-rose-400">
                    회귀 의심 패턴은 운영자가 직접 검토 후 가드 텍스트 보강 또는
                    sanitize 정규식 추가 (operations.md §6.5).
                  </p>
                </section>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="button" onClick={onClose}>
                <X className="mr-1 h-3.5 w-3.5" />
                닫기
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
