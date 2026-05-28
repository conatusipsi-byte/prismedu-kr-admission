/**
 * URL fragment(`#`) fallback — Supabase 가 OAuth provider 에러·implicit flow
 * 토큰을 `#` 에 박아 회신하는 경로를 클라이언트에서 처리.
 *
 * 흐름:
 *   1. `#error=...&error_description=...` → /login?error=<friendly>
 *   2. `#access_token=...` → SDK 가 자동 픽업(detectSessionInUrl=true). SIGNED_IN
 *      이벤트가 오면 nextPath 로 이동.
 *   3. fragment 자체가 비어있음 → 정상적으로 missing_code_or_token 폴백.
 *
 * 4초 타임아웃 — SDK 가 hash 를 처리 못하면 안내 페이지로 폴백.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function CallbackFragmentHandler({ nextPath }: { nextPath: string }): React.ReactElement {
  const router = useRouter();
  const [statusMsg, setStatusMsg] = React.useState("로그인 처리 중...");

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let resolved = false;
    const finish = (target: string) => {
      if (resolved) return;
      resolved = true;
      router.replace(target);
    };

    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = hash ? new URLSearchParams(hash) : null;
    const hashError = hashParams?.get("error_description") ?? hashParams?.get("error") ?? null;

    // fragment 에 명시적 에러가 박혀있으면 즉시 surface (가장 흔한 케이스).
    if (hashError) {
      finish(`/login?error=${encodeURIComponent(hashError)}`);
      return;
    }

    // implicit flow token 픽업 대기 — SDK 가 자동으로 hash 처리 후 SIGNED_IN 발화.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        finish(nextPath);
      }
    });

    // fallback timer — SDK 가 5초 안에 처리 못하면 missing 으로 결론.
    const timer = setTimeout(() => {
      setStatusMsg("로그인 정보를 찾지 못했어요. 잠시 후 로그인 페이지로 이동해요.");
      finish("/login?error=missing_code_or_token");
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router, nextPath]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      <p className="text-sm text-stone-600">{statusMsg}</p>
    </div>
  );
}
