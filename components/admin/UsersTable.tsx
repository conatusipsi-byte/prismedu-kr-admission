"use client";

/**
 * UsersTable — 사용자 목록 + 액션 버튼 (Day 12)
 *
 * 컬럼: 이메일·이름·plan·provider·가입일·상태·액션
 * 액션 메뉴:
 *   - master 토글 (promote/revoke)
 *   - 차단 토글 (disable/enable)
 *
 * 정직성:
 *   - disabled 사용자 행은 zinc 톤 + 차단 라벨
 *   - master 사용자 행은 ShieldAlert 아이콘
 *   - 본인 자신은 일부 액션 disabled (서버에서도 차단되지만 UI에서 미리 안내)
 */

import * as React from "react";
import { Loader2, ShieldAlert, ShieldOff, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUserItem } from "@/lib/admission/admin-users-mock";

const PLAN_TONE: Record<AdminUserItem["plan"], string> = {
  free: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
  pro: "border-mint-300 bg-mint-50 text-mint-800 dark:border-mint-800/40 dark:bg-mint-950/20 dark:text-mint-300",
  elite: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300",
};

export interface UsersTableProps {
  items: AdminUserItem[];
  /** 호출자 자기 자신의 uid — 일부 액션 disabled 처리 */
  currentUid?: string;
  /** mutation 호출 — 부모(UsersView)가 fetch + 목록 갱신 */
  onMutate: (uid: string, action: "promote" | "revoke" | "disable" | "enable") => Promise<void>;
  /** 진행 중인 mutation의 uid (스피너 표시) */
  pendingUid?: string;
  className?: string;
}

export function UsersTable({
  items,
  currentUid,
  onMutate,
  pendingUid,
  className,
}: UsersTableProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <div
        data-component="users-table"
        data-empty="true"
        className={cn(
          "rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        조회 결과가 없어요. 검색어 또는 필터를 변경해보세요.
      </div>
    );
  }

  return (
    <div data-component="users-table" className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-[1fr_5rem_5rem_5rem_5rem_10rem] items-center gap-2 px-3 py-2 text-2xs font-semibold text-muted-foreground">
        <span>이메일·이름</span>
        <span>plan</span>
        <span>provider</span>
        <span>상태</span>
        <span>가입일</span>
        <span></span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((u) => {
          const isSelf = u.uid === currentUid;
          const isPending = pendingUid === u.uid;
          return (
            <li
              key={u.uid}
              data-uid={u.uid}
              data-disabled={u.disabled ? "true" : "false"}
              data-master={u.isMaster ? "true" : "false"}
              className={cn(
                "grid grid-cols-[1fr_5rem_5rem_5rem_5rem_10rem] items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                u.disabled && "border-zinc-300 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/30",
                u.isMaster && !u.disabled && "border-rose-200 bg-rose-50/30 dark:border-rose-900/30 dark:bg-rose-950/10",
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="flex items-center gap-1 truncate font-medium">
                  {u.isMaster && (
                    <ShieldAlert aria-hidden className="h-3 w-3 shrink-0 text-rose-600" />
                  )}
                  {u.email || "(이메일 없음)"}
                  {isSelf && <Badge variant="outline" className="text-2xs">본인</Badge>}
                </span>
                <span className="truncate text-2xs text-muted-foreground">{u.name}</span>
              </div>
              <Badge variant="outline" className={cn("text-2xs", PLAN_TONE[u.plan])}>{u.plan}</Badge>
              <span className="truncate text-2xs text-muted-foreground">{u.provider}</span>
              <span>
                {u.disabled ? (
                  <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-2xs dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300">
                    차단
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-mint-300 bg-mint-50 text-mint-800 text-2xs dark:border-mint-800/40 dark:bg-mint-950/20 dark:text-mint-300">
                    정상
                  </Badge>
                )}
              </span>
              <span className="text-2xs text-muted-foreground">{formatDate(u.createdAtMs)}</span>
              <div className="flex items-center justify-end gap-1">
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSelf && u.isMaster}
                      onClick={() =>
                        void onMutate(u.uid, u.isMaster ? "revoke" : "promote")
                      }
                      data-action={u.isMaster ? "revoke" : "promote"}
                      className="h-7 px-2 text-2xs"
                      title={isSelf ? "본인 자신은 master 토글 불가 — 다른 운영자에게 요청" : ""}
                    >
                      {u.isMaster ? (
                        <>
                          <ShieldOff className="mr-0.5 h-3 w-3" /> 권한 해제
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="mr-0.5 h-3 w-3" /> master
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSelf}
                      onClick={() =>
                        void onMutate(u.uid, u.disabled ? "enable" : "disable")
                      }
                      data-action={u.disabled ? "enable" : "disable"}
                      className="h-7 px-2 text-2xs"
                      title={isSelf ? "본인 계정은 차단할 수 없어요" : ""}
                    >
                      {u.disabled ? (
                        <>
                          <UserCheck className="mr-0.5 h-3 w-3" /> 해제
                        </>
                      ) : (
                        <>
                          <UserX className="mr-0.5 h-3 w-3" /> 차단
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDate(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
