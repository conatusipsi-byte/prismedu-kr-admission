"use client";

import { useCallback } from "react";
import { useToast } from "./use-toast";
import { ApiError } from "@/lib/api-client";
import { logError } from "@/lib/log";

/**
 * API 호출 실패를 일관된 toast로 표시하는 훅.
 *
 * - ApiError(서버에서 보낸 message) → 그대로 표시
 * - QUOTA_EXCEEDED(429) → 한도 안내 + 업그레이드 유도 (별도 처리)
 * - 401 NOT_AUTHENTICATED → 재로그인 안내
 * - 그 외 (네트워크 등) → "잠시 후 다시 시도해주세요"
 *
 * 사용:
 *   const showError = useApiErrorToast();
 *   fetchWithAuth(...).catch(showError);
 *
 * 또는 옵션:
 *   showError(err, { title: "분석 실패" });
 *   showError(err, { silent: true }); // toast 표시 안 함 (로그만)
 */
export function useApiErrorToast() {
  const { toast } = useToast();

  return useCallback(
    (err: unknown, opts: { title?: string; silent?: boolean } = {}) => {
      // AbortError는 의도적 취소 (재요청·언마운트) — 사용자에게 표시 안 함
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        return;
      }

      // 호출자가 silent 옵션 주면 콘솔 로그만
      if (opts.silent) {
        console.warn("[api]", err);
        return;
      }

      logError("[api]", err);

      const isApiError = err instanceof ApiError;
      const status = isApiError ? err.status : undefined;
      const code = isApiError ? err.code : undefined;
      const serverMessage = isApiError ? err.message : null;

      // 인증 문제 — 명시적 안내
      if (status === 401 || code === "NOT_AUTHENTICATED" || code === "TOKEN_FAILED") {
        toast({
          variant: "destructive",
          title: "로그인이 필요해요",
          description: "세션이 만료되었어요. 다시 로그인해주세요.",
        });
        return;
      }

      // 쿼터 초과 — 별도 톤 (destructive 대신 normal — 정당한 한도 도달이지 에러는 아님)
      if (status === 429 || code === "QUOTA_EXCEEDED") {
        toast({
          title: "한도 도달",
          description: serverMessage || "오늘 사용 한도를 모두 사용했어요.",
        });
        return;
      }

      // 기본 — ApiError면 서버 메시지, 아니면 일반 fallback
      toast({
        variant: "destructive",
        title: opts.title || "요청 실패",
        description: serverMessage || "잠시 후 다시 시도해주세요.",
      });
    },
    [toast]
  );
}
