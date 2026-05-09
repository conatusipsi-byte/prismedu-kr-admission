"use client";

/**
 * SanitizeLogTable — 발동 로그 테이블 (페이지네이션)
 *
 * P-002:
 *   - 사용자 ID 마스킹 (saltedUidHash 첫 4자만)
 *   - 원본 응답 80자 잘림 (전체는 모달에서)
 *   - 회귀 의심·미해결 행은 시각 강조 (rose 톤)
 */

import * as React from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type SanitizeEvent,
  type SanitizeTriggerType,
  maskUid,
  truncateExcerpt,
} from "@/lib/admission/sanitize-events";

export interface SanitizeLogTableProps {
  logs: SanitizeEvent[];
  pageSize?: number;
  onRowClick?: (log: SanitizeEvent) => void;
  className?: string;
}

const TYPE_BADGE: Record<SanitizeTriggerType, { label: string; className: string }> = {
  insufficient_sample: {
    label: "표본 부족",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  blocked_keyword: {
    label: "차단 키워드",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  regression_suspect: {
    label: "회귀 의심",
    className: "border-rose-300 bg-rose-50 text-rose-700",
  },
};

export function SanitizeLogTable({
  logs,
  pageSize = 20,
  onRowClick,
  className,
}: SanitizeLogTableProps) {
  const [page, setPage] = React.useState(0);

  const totalPages = Math.ceil(logs.length / pageSize);
  const start = page * pageSize;
  const visible = logs.slice(start, start + pageSize);

  return (
    <div data-component="sanitize-log-table" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">최근 발동 로그</h3>
        <span className="text-xs text-muted-foreground">
          {logs.length}건 · {page + 1} / {Math.max(1, totalPages)}페이지
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">시간</TableHead>
              <TableHead className="w-24">사용자</TableHead>
              <TableHead className="w-28">분류</TableHead>
              <TableHead className="w-28">상태</TableHead>
              <TableHead>원본 응답 (요약)</TableHead>
              <TableHead className="w-12 text-right">상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  로그가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {visible.map((log) => {
              const isUnresolvedRegression =
                log.triggerType === "regression_suspect" && !log.resolved;
              return (
                <TableRow
                  key={log.id}
                  data-element="log-row"
                  data-event-id={log.id}
                  data-trigger-type={log.triggerType}
                  data-resolved={log.resolved}
                  data-unresolved-regression={isUnresolvedRegression ? "true" : "false"}
                  className={cn(
                    "cursor-pointer hover:bg-muted/40",
                    isUnresolvedRegression && "bg-rose-50/40 hover:bg-rose-50/60 dark:bg-rose-950/10",
                  )}
                  onClick={() => onRowClick?.(log)}
                >
                  <TableCell className="text-xs tabular-nums">
                    {formatLocalTime(log.occurredAt)}
                  </TableCell>
                  <TableCell
                    data-element="masked-uid"
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {maskUid(log.saltedUidHash)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", TYPE_BADGE[log.triggerType].className)}>
                      {TYPE_BADGE[log.triggerType].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.resolved ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                        검수 완료
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-600 text-white text-xs">
                        미해결
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    data-element="excerpt"
                    className="max-w-md text-xs text-muted-foreground"
                  >
                    {truncateExcerpt(log.originalResponseExcerpt, 60)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick?.(log);
                      }}
                      aria-label="상세 보기"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            다음
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()
    .toString()
    .padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}
