"use client";

/**
 * ChatContextDialog — 컨텍스트 학과 추가·제거 (Day 8)
 *
 * 흐름:
 *   1. 현재 컨텍스트 학과 목록 (X 버튼으로 제거)
 *   2. 학과 검색 입력 (DepartmentSearchBar 재사용) → /api/admissions/search 호출
 *   3. 검색 결과에서 + 버튼으로 추가 (최대 5개 한도)
 *   4. 확인 → onApply(newSchools) — 부모(ChatInterface)가 conversationId 갱신·메시지 초기화
 *
 * 정직성 (P-002):
 *   - 5개 한도 사유: "일관된 답변 품질을 위해" (제한이 사용자 보호임을 명시)
 *   - 표본 부족 학과 추가 시 자동 안내 (ChatContextBadge가 처리)
 *   - "분석 결과 기반"으로 전환 버튼 (matchId 있을 때만)
 */

import * as React from "react";
import { Building2, Loader2, Plus, Sparkles, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { DepartmentSearchBar } from "@/components/admissions/DepartmentSearchBar";
import type { ChatContextDept } from "./ChatContextBadge";

const MAX_CONTEXT_SCHOOLS = 5;

export interface ChatContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 현재 컨텍스트 학과 — dialog 진입 시 초기값 */
  currentSchools: ChatContextDept[];
  /** 분석 결과 기반 진입 시 matchId — "분석 결과로 복원" 버튼용 */
  matchId?: string;
  /** matchId의 원래 컨텍스트 — "복원" 버튼이 사용 */
  matchInitialSchools?: ChatContextDept[];
  /** 확인 클릭 시 호출 — 부모가 conversationId 갱신 + 메시지 초기화 */
  onApply: (next: ChatContextDept[]) => void;
  /** 테스트 주입 — 실 fetch 차단 */
  fetchOverride?: typeof fetch;
}

interface SearchHit {
  universityId: string;
  universityName: string;
  departmentId: string;
  departmentName: string;
  sampleSufficient: boolean;
}

export function ChatContextDialog({
  open,
  onOpenChange,
  currentSchools,
  matchId,
  matchInitialSchools,
  onApply,
  fetchOverride,
}: ChatContextDialogProps): React.ReactElement {
  const [draft, setDraft] = React.useState<ChatContextDept[]>(currentSchools);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // dialog 열릴 때마다 draft를 currentSchools로 초기화 (취소·재오픈 시 원복)
  React.useEffect(() => {
    if (open) {
      setDraft(currentSchools);
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open, currentSchools]);

  // 검색
  React.useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      return;
    }
    let aborted = false;
    setSearching(true);
    setError(null);
    const fetchFn = fetchOverride ?? fetch;
    const params = new URLSearchParams();
    params.set("q", query.trim());
    params.set("limit", "10");
    fetchFn(`/api/admissions/search?${params.toString()}`)
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          setResults([]);
          setError("학과 검색에 실패했어요.");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          results?: Array<{
            university: { id: string; n: string; shortName?: string };
            department: { id: string; name: string };
            sampleSufficient: boolean;
          }>;
          todo?: string;
        };
        if (data.todo) {
          setResults([]);
          return;
        }
        setResults(
          (data.results ?? []).map((it) => ({
            universityId: it.university.id,
            universityName: it.university.shortName ?? it.university.n,
            departmentId: it.department.id,
            departmentName: it.department.name,
            sampleSufficient: it.sampleSufficient,
          })),
        );
      })
      .catch(() => {
        if (!aborted) setError("학과 검색 중 오류가 발생했어요.");
      })
      .finally(() => {
        if (!aborted) setSearching(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, query, fetchOverride]);

  const isAlreadyInDraft = (uid: string, did: string) =>
    draft.some((s) => s.universityId === uid && s.departmentId === did);

  function addToDraft(hit: SearchHit) {
    if (draft.length >= MAX_CONTEXT_SCHOOLS) return;
    if (isAlreadyInDraft(hit.universityId, hit.departmentId)) return;
    setDraft((prev) => [
      ...prev,
      {
        universityId: hit.universityId,
        departmentId: hit.departmentId,
        displayName: `${hit.universityName} ${hit.departmentName}`,
        sampleSufficient: hit.sampleSufficient,
      },
    ]);
  }

  function removeFromDraft(uid: string, did: string) {
    setDraft((prev) => prev.filter((s) => !(s.universityId === uid && s.departmentId === did)));
  }

  function restoreFromMatch() {
    if (matchInitialSchools && matchInitialSchools.length > 0) {
      setDraft(matchInitialSchools.slice(0, MAX_CONTEXT_SCHOOLS));
    }
  }

  function handleApply() {
    onApply(draft);
    onOpenChange(false);
  }

  const reachedLimit = draft.length >= MAX_CONTEXT_SCHOOLS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-component="chat-context-dialog"
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>상담 컨텍스트 변경</DialogTitle>
          <DialogDescription>
            카운슬러가 어떤 학과를 기준으로 답변할지 선택하세요. 최대 5개까지 추가
            가능합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 현재 draft 학과 */}
          <section data-element="draft-schools" className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              현재 컨텍스트 학과 ({draft.length}/{MAX_CONTEXT_SCHOOLS})
            </h3>
            {draft.length === 0 ? (
              <p className="text-2xs text-muted-foreground">
                학과를 추가하지 않으면 일반 상담 모드로 진행됩니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {draft.map((s) => (
                  <li
                    key={`${s.universityId}/${s.departmentId}`}
                    data-element="draft-school-row"
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.displayName}</span>
                      {!s.sampleSufficient && (
                        <Badge
                          variant="outline"
                          className="ml-1 shrink-0 border-zinc-300 bg-zinc-50 text-2xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300"
                        >
                          표본 부족
                        </Badge>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`${s.displayName} 제거`}
                      onClick={() => removeFromDraft(s.universityId, s.departmentId)}
                      className="h-7 w-7 p-0"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5개 도달 안내 (P-002 정직성) */}
          {reachedLimit && (
            <p
              data-element="limit-notice"
              className="rounded-md border border-amber-200 bg-amber-50/70 p-2 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200"
            >
              일관된 답변 품질을 위해 학과는 최대 5개까지 추가할 수 있어요. 더 추가하려면
              기존 학과를 먼저 제거하세요.
            </p>
          )}

          {/* matchId 복원 */}
          {matchId && matchInitialSchools && matchInitialSchools.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restoreFromMatch}
              data-testid="restore-from-match"
            >
              <Sparkles aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              분석 결과 기반으로 복원
            </Button>
          )}

          {/* 학과 검색 + 결과 */}
          <section data-element="search-section" className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">학과 검색해서 추가</h3>
            <DepartmentSearchBar value={query} onChange={setQuery} placeholder="대학명·학과명 검색" />
            {error && (
              <p className="text-2xs text-destructive">{error}</p>
            )}
            {searching && (
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                검색 중…
              </div>
            )}
            {!searching && query.trim() && results.length === 0 && !error && (
              <p className="text-2xs text-muted-foreground">검색 결과가 없어요.</p>
            )}
            {results.length > 0 && (
              <ul
                data-element="search-results"
                className="flex max-h-48 flex-col gap-1 overflow-y-auto"
              >
                {results.map((hit) => {
                  const already = isAlreadyInDraft(hit.universityId, hit.departmentId);
                  return (
                    <li
                      key={`${hit.universityId}/${hit.departmentId}`}
                      data-element="search-hit"
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <span className="flex flex-col truncate">
                        <span className="truncate">
                          {hit.universityName} · {hit.departmentName}
                        </span>
                        {!hit.sampleSufficient && (
                          <span className="text-2xs text-zinc-500">표본 부족 학과</span>
                        )}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={already || reachedLimit}
                        onClick={() => addToDraft(hit)}
                        className={cn("h-7 px-2 text-2xs")}
                      >
                        <Plus aria-hidden className="mr-0.5 h-3 w-3" />
                        {already ? "추가됨" : "추가"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleApply} className="bg-brand-600 hover:bg-brand-700">
            확인하고 새 대화 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
