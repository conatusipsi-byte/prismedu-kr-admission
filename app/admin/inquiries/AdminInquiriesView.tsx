"use client";

/**
 * AdminInquiriesView — /admin/inquiries 본체 (2026-05-30).
 *
 * 3 탭: 대기 / 답변완료 / 종료.
 * 각 카드 — 펼치기 → 본문 + 답변 textarea + "답변 전송" 버튼 (status=pending 일 때).
 * 답변 발송 시 회신 주소 미리보기 + 실패 시 사유 표시 (response_email_error).
 *
 * 정직성 (P-002):
 *   - effectiveRecipient 가 NULL 이면 발송 skip 안내 (카카오 가입자).
 *   - 발송 실패해도 답변 저장 자체는 성공.
 *   - 답변 후 closed 전환 또는 재오픈 별도 버튼 (이메일 발송 X).
 */

import * as React from "react";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Inbox,
  Lightbulb,
  Loader2,
  Mail,
  MailX,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  XCircle,
  RotateCcw,
} from "lucide-react";

import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type AdminTab = "pending" | "answered" | "closed";
type Category = "improvement" | "question";

interface AdminInquiryItem {
  id: string;
  category: Category;
  title: string;
  body: string;
  status: AdminTab;
  contactEmail: string | null;
  adminResponse: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  responseEmailSentAt: string | null;
  responseEmailError: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string | null } | null;
  effectiveRecipient: string | null;
}

interface ListResponse {
  items: AdminInquiryItem[];
  total: number;
  nextOffset: number | null;
}

interface RespondResponse {
  ok: true;
  inquiryId: string;
  emailSent: boolean;
  channel?: string;
  messageId?: string;
  to?: string;
  emailReason?: string;
  emailDetail?: string;
  warning?: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  improvement: "시스템 개선",
  question: "문의",
};

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "pending", label: "대기" },
  { id: "answered", label: "답변완료" },
  { id: "closed", label: "종료" },
];

function formatDateKr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AdminInquiriesView(): React.ReactElement {
  const [tab, setTab] = React.useState<AdminTab>("pending");
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<AdminInquiryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: tab, limit: "100" });
      if (search.trim().length > 0) qs.set("q", search.trim());
      const r = await fetchWithAuth<ListResponse>(`/api/admin/inquiries?${qs.toString()}`);
      setItems(r.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void load();
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">문의 관리</h1>
          <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
            운영자 전용 — 답변 전송 시 사용자 이메일로 자동 발송 (Resend).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3 w-3" aria-hidden />
          )}
          새로고침
        </Button>
      </header>

      {/* 탭 */}
      <div
        role="tablist"
        aria-label="문의 상태"
        className="inline-flex gap-1 rounded-lg bg-muted/40 p-1 self-start"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-tab={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder="제목·내용·이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={loading}>
          검색
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-rose-300/60 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          <AlertTriangle className="inline h-3 w-3 mr-1" aria-hidden />
          {error}
        </div>
      )}

      <InquiriesList items={items} loading={loading} onMutated={load} tab={tab} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   List
   ───────────────────────────────────────────────────────────────────── */

function InquiriesList({
  items,
  loading,
  onMutated,
  tab,
}: {
  items: AdminInquiryItem[];
  loading: boolean;
  onMutated: () => void | Promise<void>;
  tab: AdminTab;
}): React.ReactElement {
  if (loading && items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin mr-2" aria-hidden />
          불러오는 중…
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
          <Inbox className="h-8 w-8 text-muted-foreground/40" aria-hidden />
          <span>해당 상태의 문의가 없습니다.</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.id}>
          <InquiryCard inquiry={it} onMutated={onMutated} initiallyExpanded={tab === "pending"} />
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Card
   ───────────────────────────────────────────────────────────────────── */

function InquiryCard({
  inquiry,
  onMutated,
  initiallyExpanded,
}: {
  inquiry: AdminInquiryItem;
  onMutated: () => void | Promise<void>;
  initiallyExpanded: boolean;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(initiallyExpanded);
  const [response, setResponse] = React.useState(inquiry.adminResponse ?? "");
  const [busy, setBusy] = React.useState<null | "send" | "close" | "reopen">(null);
  const [resultNote, setResultNote] = React.useState<string | null>(null);

  const canSend = inquiry.status === "pending";
  const canClose = inquiry.status === "pending" || inquiry.status === "answered";
  const canReopen = inquiry.status === "closed";

  const onSend = async (): Promise<void> => {
    if (response.trim().length === 0) {
      window.alert("답변 내용을 입력해주세요.");
      return;
    }
    if (!inquiry.effectiveRecipient) {
      const ok = window.confirm(
        "회신 받을 이메일이 없습니다 (카카오 가입자 등). 답변은 저장되지만 이메일은 발송되지 않습니다. 계속하시겠습니까?",
      );
      if (!ok) return;
    }
    setBusy("send");
    setResultNote(null);
    try {
      const r = await fetchWithAuth<RespondResponse>(
        `/api/admin/inquiries/${inquiry.id}/respond`,
        {
          method: "PATCH",
          body: JSON.stringify({ adminResponse: response.trim() }),
        },
      );
      if (r.emailSent) {
        setResultNote(`✓ ${r.to} 으로 이메일 발송 완료 (id: ${r.messageId ?? "-"})`);
      } else {
        setResultNote(`⚠ 답변은 저장됐지만 이메일 발송 실패 (${r.emailReason ?? "unknown"}). ${r.warning ?? ""}`);
      }
      await onMutated();
    } catch (e) {
      window.alert(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "전송 실패",
      );
    } finally {
      setBusy(null);
    }
  };

  const onClose = async (): Promise<void> => {
    if (!window.confirm("이 문의를 종료 처리할까요? (이메일 발송 없음)")) return;
    setBusy("close");
    try {
      await fetchWithAuth(`/api/admin/inquiries/${inquiry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      await onMutated();
    } catch (e) {
      window.alert(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "상태 변경 실패",
      );
    } finally {
      setBusy(null);
    }
  };

  const onReopen = async (): Promise<void> => {
    setBusy("reopen");
    try {
      await fetchWithAuth(`/api/admin/inquiries/${inquiry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "pending" }),
      });
      await onMutated();
    } catch (e) {
      window.alert(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "재오픈 실패",
      );
    } finally {
      setBusy(null);
    }
  };

  const StatusBadge: React.ReactElement = (() => {
    if (inquiry.status === "pending")
      return <Badge variant="pill-amber" size="sm">대기</Badge>;
    if (inquiry.status === "answered")
      return <Badge variant="pill-brand" size="sm">답변완료</Badge>;
    return <Badge variant="pill-ink" size="sm">종료</Badge>;
  })();

  const CategoryIcon = inquiry.category === "improvement" ? Lightbulb : MessageSquare;

  return (
    <Card data-component="admin-inquiry-card" data-inquiry-id={inquiry.id} data-status={inquiry.status}>
      <CardContent className="p-5 flex flex-col gap-3">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="pill-ink" size="sm" className="gap-1">
                <CategoryIcon className="h-3 w-3" aria-hidden />
                {CATEGORY_LABEL[inquiry.category]}
              </Badge>
              {StatusBadge}
            </div>
            <h3 className="text-sm font-semibold break-keep-all">{inquiry.title}</h3>
            <div className="text-2xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" aria-hidden />
                {inquiry.effectiveRecipient ?? (
                  <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <MailX className="h-3 w-3" aria-hidden />
                    회신 주소 없음
                  </span>
                )}
              </span>
              <span>·</span>
              <span className="tabular-nums">{formatDateKr(inquiry.createdAt)}</span>
              {inquiry.answeredAt && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">답변 {formatDateKr(inquiry.answeredAt)}</span>
                </>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpanded((x) => !x)}>
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
            {expanded ? "접기" : "펼치기"}
          </Button>
        </div>

        {expanded && (
          <div className="flex flex-col gap-4 mt-1">
            {/* 사용자 본문 */}
            <section>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                사용자 본문
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-keep-all rounded-md bg-muted/40 px-3 py-2.5">
                {inquiry.body}
              </p>
            </section>

            {/* 답변 작성/조회 */}
            {canSend ? (
              <section className="flex flex-col gap-2">
                <label className="text-2xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  답변 작성
                </label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="사용자에게 보낼 답변을 작성하세요. 이메일로 자동 발송됩니다."
                  maxLength={10000}
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 resize-vertical min-h-32 break-keep-all"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {response.length}/10000
                  </span>
                  <div className="flex gap-2">
                    {canClose && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onClose()}
                        disabled={busy !== null}
                      >
                        {busy === "close" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                        <XCircle className="h-3 w-3" aria-hidden />
                        답변 없이 종료
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void onSend()}
                      disabled={busy !== null || response.trim().length === 0}
                      isLoading={busy === "send"}
                    >
                      <Send className="h-3 w-3" aria-hidden />
                      답변 전송
                    </Button>
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <p className="text-2xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-1.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  운영자 답변
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap break-keep-all rounded-md bg-brand-50/60 dark:bg-brand-950/30 border-l-2 border-brand-400 px-3 py-2.5">
                  {inquiry.adminResponse ?? "(답변 없음)"}
                </p>
                {/* 발송 결과 — 투명 노출 */}
                {inquiry.responseEmailSentAt ? (
                  <p className="text-2xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Mail className="h-3 w-3" aria-hidden />
                    이메일 발송 완료 — {formatDateKr(inquiry.responseEmailSentAt)}
                  </p>
                ) : inquiry.responseEmailError ? (
                  <p className="text-2xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <MailX className="h-3 w-3" aria-hidden />
                    이메일 발송 실패: {inquiry.responseEmailError}
                  </p>
                ) : null}
              </section>
            )}

            {/* 후행 액션 — answered/closed */}
            {!canSend && (
              <div className="flex justify-end gap-2">
                {canClose && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onClose()}
                    disabled={busy !== null}
                    isLoading={busy === "close"}
                  >
                    <XCircle className="h-3 w-3" aria-hidden />
                    종료
                  </Button>
                )}
                {canReopen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onReopen()}
                    disabled={busy !== null}
                    isLoading={busy === "reopen"}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    재오픈
                  </Button>
                )}
              </div>
            )}

            {/* 송신 직후 안내 */}
            {resultNote && (
              <p
                data-element="send-result"
                className={cn(
                  "text-2xs rounded-md px-3 py-2",
                  resultNote.startsWith("✓")
                    ? "bg-brand-50/60 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
                    : "bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
                )}
              >
                {resultNote}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
