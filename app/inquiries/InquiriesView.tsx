"use client";

/**
 * InquiriesView — /inquiries 본체 (2026-05-30).
 *
 * 비로그인 → /login?returnUrl=/inquiries.
 * 탭 2개: "새 문의" / "이력".
 *   - 새 문의: 카테고리(개선/문의) + 제목 + 내용 + 회신 이메일(선택, 카카오 가입자 대응).
 *   - 이력: 본인 문의 목록 + 상태 배지 + 답변 펼치기.
 *
 * 정직성 (P-002):
 *   - user.email 없는 경우 (카카오 가입자) 회신 이메일 필수임을 명시.
 *   - 답변 발송 채널이 이메일임을 폼 하단에 명시 (알림톡 미지원).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Lightbulb,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Category = "improvement" | "question";
type Status = "pending" | "answered" | "closed";

interface InquiryDto {
  id: string;
  category: Category;
  title: string;
  body: string;
  contactEmail: string | null;
  status: Status;
  adminResponse: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: InquiryDto[];
  total: number;
  nextOffset: number | null;
}

const CATEGORY_LABEL: Record<Category, string> = {
  improvement: "시스템 개선 요청",
  question: "일반 문의",
};

const STATUS_META: Record<Status, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  pending:  { label: "대기 중",   variant: "pill-amber" },
  answered: { label: "답변 완료", variant: "pill-brand" },
  closed:   { label: "종료",      variant: "pill-ink" },
};

function formatDateKr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function InquiriesView(): React.ReactElement {
  const router = useRouter();
  const { user, loading } = useAuth();

  // 비로그인 → 로그인 페이지로 (returnUrl 보존)
  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?returnUrl=/inquiries");
    }
  }, [loading, user, router]);

  const [tab, setTab] = React.useState<"new" | "history">("new");
  const [items, setItems] = React.useState<InquiryDto[]>([]);
  const [listLoading, setListLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);

  const loadHistory = React.useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const r = await fetchWithAuth<ListResponse>("/api/inquiries?limit=50");
      setItems(r.items);
    } catch (e) {
      setListError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "이력 조회 실패",
      );
    } finally {
      setListLoading(false);
    }
  }, []);

  // history 탭 진입 시 1회 로드 + 새 문의 작성 후 자동 갱신
  React.useEffect(() => {
    if (tab === "history" && user) void loadHistory();
  }, [tab, user, loadHistory]);

  if (loading || !user) return <PageSkeleton />;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[30rem] w-[70rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15" />
      </div>

      <div className="mx-auto max-w-3xl px-4 md:px-6 py-12 lg:py-16">
        <header className="mb-8 flex flex-col gap-3">
          <Badge variant="pill-brand" size="md" className="self-start">
            <Sparkles className="h-3 w-3" />
            문의
          </Badge>
          <h1 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter break-keep-all">
            문의·개선 제안
          </h1>
          <p className="text-sm lg:text-base text-muted-foreground leading-relaxed break-keep-all max-w-xl">
            서비스 개선 아이디어나 궁금한 점을 보내주세요. 답변은 이메일로 발송되며 본 페이지 이력에서도 확인할 수 있어요.
          </p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "history")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="new" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              새 문의
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              이력
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-6">
            <NewInquiryForm
              userEmail={user.email ?? null}
              onCreated={() => {
                void loadHistory();
                setTab("history");
              }}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <HistoryList
              items={items}
              loading={listLoading}
              error={listError}
              onRefresh={loadHistory}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   NewInquiryForm
   ───────────────────────────────────────────────────────────────────── */

function NewInquiryForm({
  userEmail,
  onCreated,
}: {
  userEmail: string | null;
  onCreated: () => void;
}): React.ReactElement {
  const [category, setCategory] = React.useState<Category>("question");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const needsContactEmail = !userEmail;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (title.trim().length === 0) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (body.trim().length === 0) {
      setError("내용을 입력해주세요.");
      return;
    }
    if (needsContactEmail && contactEmail.trim().length === 0) {
      setError("회신 받을 이메일을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await fetchWithAuth("/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          category,
          title: title.trim(),
          body: body.trim(),
          contactEmail: contactEmail.trim() || undefined,
        }),
      });
      setSuccess(true);
      setTitle("");
      setBody("");
      setContactEmail("");
      setCategory("question");
      // 이력 탭으로 이동
      setTimeout(() => onCreated(), 500);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "전송 실패",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {/* 카테고리 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category" className="text-sm font-semibold">
              카테고리
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {CATEGORY_LABEL.question}
                  </span>
                </SelectItem>
                <SelectItem value="improvement">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5" />
                    {CATEGORY_LABEL.improvement}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 제목 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title" className="text-sm font-semibold">
              제목
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                category === "improvement"
                  ? "예: 학과 비교 페이지에 자유전공학부 필터를 넣어주세요"
                  : "예: 결제 영수증이 안 와요"
              }
              maxLength={200}
              required
              autoComplete="off"
            />
            <p className="text-2xs text-muted-foreground text-right tabular-nums">
              {title.length}/200
            </p>
          </div>

          {/* 본문 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body" className="text-sm font-semibold">
              내용
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="가능하면 어떤 화면에서, 어떤 동작이 있을 때 발생했는지 알려주시면 빠르게 도와드릴 수 있어요."
              maxLength={5000}
              rows={8}
              required
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-vertical min-h-32 break-keep-all"
            />
            <p className="text-2xs text-muted-foreground text-right tabular-nums">
              {body.length}/5000
            </p>
          </div>

          {/* 회신 이메일 (선택 또는 필수) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactEmail" className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              회신 이메일
              {needsContactEmail ? (
                <Badge variant="pill-amber" size="sm">필수</Badge>
              ) : (
                <Badge variant="pill-ink" size="sm">선택</Badge>
              )}
            </Label>
            <Input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={
                userEmail
                  ? `미입력 시 ${userEmail} 으로 발송돼요`
                  : "답변 받을 이메일을 입력해주세요"
              }
              maxLength={254}
              required={needsContactEmail}
              autoComplete="email"
            />
            {needsContactEmail && (
              <p className="text-2xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                가입 시 이메일이 등록되지 않은 계정(카카오 등) 입니다. 답변 받을 이메일이 꼭 필요해요.
              </p>
            )}
          </div>

          {/* 정직성 안내 */}
          <p className="text-2xs text-muted-foreground leading-relaxed">
            • 답변은 영업일 기준 3일 이내에 이메일로 발송돼요. <br />
            • 답변 발송 후에도 본 페이지 "이력" 탭에서 다시 확인할 수 있어요. <br />
            • 카카오톡 알림은 추후 지원 예정이에요.
          </p>

          {error && (
            <div role="alert" className="rounded-md border border-rose-300/60 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div role="status" className="rounded-md border border-brand-300/60 bg-brand-50/60 dark:border-brand-700/60 dark:bg-brand-950/30 px-3 py-2 text-sm text-brand-700 dark:text-brand-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <span>문의를 접수했어요. 이력 탭으로 이동합니다.</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="lg" disabled={submitting} isLoading={submitting}>
              <Send className="h-4 w-4" />
              {submitting ? "전송 중…" : "문의 보내기"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   HistoryList
   ───────────────────────────────────────────────────────────────────── */

function HistoryList({
  items,
  loading,
  error,
  onRefresh,
}: {
  items: InquiryDto[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
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
  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm flex flex-col items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
          <span className="text-rose-700 dark:text-rose-300">{error}</span>
          <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
          <Inbox className="h-8 w-8 text-muted-foreground/40" aria-hidden />
          <span>아직 보내신 문의가 없어요.</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.id}>
          <InquiryCard inquiry={it} />
        </li>
      ))}
    </ul>
  );
}

function InquiryCard({ inquiry }: { inquiry: InquiryDto }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(inquiry.status === "answered");
  const meta = STATUS_META[inquiry.status];

  return (
    <Card data-component="inquiry-card" data-inquiry-id={inquiry.id} data-status={inquiry.status}>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="pill-ink" size="sm">{CATEGORY_LABEL[inquiry.category]}</Badge>
              <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
            </div>
            <h3 className="text-base font-semibold break-keep-all">{inquiry.title}</h3>
            <p className="text-2xs text-muted-foreground tabular-nums">
              {formatDateKr(inquiry.createdAt)}
              {inquiry.answeredAt && ` · 답변 ${formatDateKr(inquiry.answeredAt)}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpanded((x) => !x)}>
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
            {expanded ? "접기" : "펼치기"}
          </Button>
        </div>

        {expanded && (
          <div className="flex flex-col gap-3 mt-1">
            <section>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                내가 보낸 문의
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-keep-all rounded-md bg-muted/40 px-3 py-2.5">
                {inquiry.body}
              </p>
            </section>

            {inquiry.adminResponse ? (
              <section>
                <p className="text-2xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-1.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  답변
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap break-keep-all rounded-md bg-brand-50/60 dark:bg-brand-950/30 border-l-2 border-brand-400 px-3 py-2.5">
                  {inquiry.adminResponse}
                </p>
              </section>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                답변이 작성되면 이메일로 알려드릴게요.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Skeleton (로딩)
   ───────────────────────────────────────────────────────────────────── */

function PageSkeleton(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-12 lg:py-16 flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
