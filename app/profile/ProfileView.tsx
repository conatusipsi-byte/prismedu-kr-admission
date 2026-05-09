"use client";

/**
 * ProfileView — /profile 본체 (Client)
 *
 * 섹션:
 *   1. 계정 — 이메일(read-only) + 이름(편집)
 *   2. 입시 프로필 — /onboarding 으로 진입점. 사이트맵의 "수정 모드"는
 *      GET /api/user/specs 본체 PR에서 OnboardingWizard에 initialValue 주입.
 *   3. 알림 설정 — D-Day 이메일 알림 토글 (notificationOptIn)
 *   4. 위험 영역 — 회원 탈퇴(임시 안내) + 로그아웃
 *
 * POST /api/user/profile 은 현재 stub. saveProfile()이 Firestore에 직접 쓰는
 * 패턴이 이미 auth-context에 있어 그대로 활용한다.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ProfileView(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, saveProfile, logout } = useAuth();

  // 비로그인 → /login?returnUrl=/profile (middleware는 /admin/*만 가드)
  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?returnUrl=/profile");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="flex flex-col gap-section-lg">
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-mint-50 via-background to-emerald-50/50 dark:from-mint-950/40 dark:via-background dark:to-emerald-950/30 p-6 lg:p-8">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-48 h-48 rounded-full bg-mint-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400 mb-1.5">
            나의 계정
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">프로필</h1>
          <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
            계정 정보, 입시 성적·생기부, 알림 설정을 관리해요.
          </p>
        </div>
      </header>

      <AccountSection
        user={user}
        currentName={profile?.name ?? user.displayName ?? ""}
        onSave={(name) => saveProfile({ name })}
      />

      <SpecSection hasSpec={!!profile?.specs || !!profile?.specLastUpdated} />

      <NotificationSection
        currentValue={profile?.notificationOptIn ?? false}
        onToggle={(notificationOptIn) => saveProfile({ notificationOptIn })}
      />

      <DangerSection onLogout={logout} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Sections
   ═══════════════════════════════════════════════════════════════════════ */

function AccountSection({
  user,
  currentName,
  onSave,
}: {
  user: { email: string | null; providerData: Array<{ providerId: string }> };
  currentName: string;
  onSave: (name: string) => Promise<void>;
}): React.ReactElement {
  const [name, setName] = React.useState(currentName);
  const [pending, setPending] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 외부 profile 갱신 시 동기화
  React.useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const dirty = name.trim() !== currentName.trim();
  const provider = user.providerData[0]?.providerId ?? "password";
  const providerLabel = formatProvider(provider);

  async function handleSave(): Promise<void> {
    if (!dirty) return;
    setPending(true);
    setError(null);
    try {
      await onSave(name.trim());
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard
      icon={<UserIcon className="h-4 w-4" />}
      title="계정"
      description="로그인 정보와 표시 이름"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">이메일</Label>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{user.email ?? "이메일 미연결"}</span>
            <span className="text-2xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {providerLabel}
            </span>
          </div>
          <p className="text-2xs text-muted-foreground">
            이메일·로그인 방식 변경은 출시 후 지원 예정입니다.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="profile-name" className="text-xs text-muted-foreground">
            표시 이름
          </Label>
          <div className="flex gap-2">
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="홍길동"
              className="flex-1"
            />
            <Button
              type="button"
              size="default"
              onClick={handleSave}
              disabled={!dirty || pending}
              className="bg-mint-600 hover:bg-mint-700"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "저장"}
            </Button>
          </div>
          {savedAt && !dirty && (
            <p className="text-2xs text-mint-600 dark:text-mint-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> 저장되었어요
            </p>
          )}
          {error && (
            <p className="text-2xs text-destructive">⚠️ {error}</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function SpecSection({ hasSpec }: { hasSpec: boolean }): React.ReactElement {
  return (
    <SectionCard
      icon={<Pencil className="h-4 w-4" />}
      title="입시 프로필"
      description="내신·수능·생기부 비교과 입력값"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
          {hasSpec
            ? "현재 저장된 프로필을 기반으로 분석·시뮬레이션이 동작합니다. 학기가 바뀌면 새로 입력해주세요."
            : "아직 저장된 입시 프로필이 없어요. 한 번 입력하면 분석·What-if·카운슬러가 같은 데이터로 동작합니다."}
        </p>
        <Button asChild size="default" variant={hasSpec ? "outline" : "default"} className={hasSpec ? "" : "bg-mint-600 hover:bg-mint-700"}>
          <Link href="/onboarding">
            {hasSpec ? "프로필 수정하기" : "프로필 만들기"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <p className="text-2xs text-muted-foreground">
          ⚠️ 현재 단계에선 수정 시 빈 폼에서 다시 입력합니다. 자동 미리채움은
          GET /api/user/specs 라우트 본체 PR 후 활성화됩니다.
        </p>
      </div>
    </SectionCard>
  );
}

function NotificationSection({
  currentValue,
  onToggle,
}: {
  currentValue: boolean;
  onToggle: (next: boolean) => Promise<void>;
}): React.ReactElement {
  const [value, setValue] = React.useState(currentValue);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  async function handleChange(next: boolean): Promise<void> {
    setValue(next); // optimistic
    setPending(true);
    try {
      await onToggle(next);
    } catch {
      setValue(!next); // rollback
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard
      icon={<Bell className="h-4 w-4" />}
      title="알림 설정"
      description="이메일로 받을 알림"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="notif-dday" className="text-sm font-medium text-foreground cursor-pointer">
            입시 D-Day 알림
          </Label>
          <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
            수시 원서접수·수능·정시 원서접수 D-30/D-7/D-1에 이메일로 알려드려요.
          </p>
        </div>
        <Switch
          id="notif-dday"
          checked={value}
          onCheckedChange={handleChange}
          disabled={pending}
        />
      </div>
      <p className="text-2xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
        마케팅·홍보 메일은 별도 발송하지 않습니다 (개인정보처리방침 §2).
      </p>
    </SectionCard>
  );
}

function DangerSection({ onLogout }: { onLogout: () => void }): React.ReactElement {
  return (
    <SectionCard
      icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
      title="위험 영역"
      description="로그아웃·회원 탈퇴"
      tone="destructive"
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">로그아웃</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
              현재 기기에서 로그아웃합니다. 다시 로그인하면 모든 데이터가 그대로 복구돼요.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={onLogout}
            className="shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">회원 탈퇴</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
              모든 입시 프로필·결제 이력이 영구 삭제됩니다 (법령 보관 항목 제외 — 환불 정책 §6).
            </p>
          </div>
          <DeleteAccountDialog />
        </div>
      </div>
    </SectionCard>
  );
}

function DeleteAccountDialog(): React.ReactElement {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="default" className="shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
          탈퇴하기
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>정말 탈퇴하시겠어요?</AlertDialogTitle>
          <AlertDialogDescription className="break-keep-all leading-relaxed">
            아래 데이터가 영구 삭제되며 복구할 수 없습니다:
            <br />· 입시 프로필 (내신·수능·생기부)
            <br />· 분석 결과 이력
            <br />· AI 카운슬러 대화
            <br />· 결제 이력 (전자상거래법상 5년 보관 항목 제외)
            <br />
            <br />
            ⚠️ 출시 직후 자동 탈퇴는 운영 안정화 단계에서 활성화됩니다. 지금은
            <strong> support@conatusipsi.com</strong>으로 주문번호와 함께 요청하시면
            영업일 기준 3일 이내 처리해드립니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction asChild>
            <a href="mailto:support@conatusipsi.com?subject=회원 탈퇴 요청">
              이메일 보내기
            </a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function ProfileSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card
      className={
        tone === "destructive"
          ? "p-card-lg border-destructive/30 bg-destructive/5"
          : "p-card-lg"
      }
    >
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-border/60">
        <div
          className={
            tone === "destructive"
              ? "w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0"
              : "w-9 h-9 rounded-lg bg-mint-50 dark:bg-mint-950/60 text-mint-600 dark:text-mint-400 flex items-center justify-center shrink-0"
          }
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function formatProvider(providerId: string): string {
  if (providerId === "google.com") return "구글";
  if (providerId === "apple.com") return "Apple";
  if (providerId.includes("kakao")) return "카카오";
  if (providerId === "password") return "이메일";
  return providerId;
}
