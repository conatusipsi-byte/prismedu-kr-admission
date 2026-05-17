/**
 * API 호출용 클라이언트 헬퍼 — Supabase Auth 기반.
 *
 * 모든 /api/* 호출은 fetchWithAuth 를 통해 Supabase access_token 을 Bearer 헤더로 첨부.
 * 비인증 호출 시 401, 쿼터 초과 시 429.
 */
import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let lastSessionExpiredDispatch = 0;
function dispatchSessionExpired() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSessionExpiredDispatch < 5000) return;
  lastSessionExpiredDispatch = now;
  try {
    window.dispatchEvent(new CustomEvent("prism:session-expired"));
  } catch { /* skip */ }
}

async function getAccessToken(force = false): Promise<string | null> {
  if (force) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

/**
 * Supabase access_token 자동 첨부 fetch.
 *
 * - 비로그인 → ApiError(401)
 * - 비-2xx → ApiError 던짐
 * - 401 응답 시 refreshSession 후 1회 재시도
 */
export async function fetchWithAuth<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, "NOT_AUTHENTICATED", "로그인이 필요해요.");
  }

  const buildHeaders = (t: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${t}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  };

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });

  if (res.status === 401) {
    const fresh = await getAccessToken(true);
    if (fresh) {
      token = fresh;
      res = await fetch(url, { ...init, headers: buildHeaders(fresh) });
    } else {
      dispatchSessionExpired();
      throw new ApiError(401, "TOKEN_FAILED", "세션이 만료되었어요. 다시 로그인해주세요.");
    }
  }

  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

  if (!res.ok) {
    const errBody = (data && typeof data === "object" ? data : {}) as { error?: string; code?: string };
    const message = errBody.error || `요청 실패 (${res.status})`;
    if (res.status === 401) dispatchSessionExpired();
    throw new ApiError(res.status, errBody.code, message, data);
  }
  return data as T;
}

/**
 * SSE 스트리밍 — 본문 raw stream 반환.
 */
export async function streamWithAuth(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, "NOT_AUTHENTICATED", "로그인이 필요해요.");
  }

  const buildHeaders = (t: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${t}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  };

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  if (res.status === 401) {
    const fresh = await getAccessToken(true);
    if (fresh) {
      token = fresh;
      res = await fetch(url, { ...init, headers: buildHeaders(fresh) });
    } else {
      dispatchSessionExpired();
      throw new ApiError(401, "TOKEN_FAILED", "세션이 만료되었어요. 다시 로그인해주세요.");
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    const errBody = (data && typeof data === "object" ? data : {}) as { error?: string; code?: string };
    if (res.status === 401) dispatchSessionExpired();
    throw new ApiError(res.status, errBody.code, errBody.error || `요청 실패 (${res.status})`, data);
  }
  return res;
}

/**
 * SSE 이벤트 파서.
 */
export async function consumeSSE(
  res: Response,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let eventName = "message";
      let dataLine = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      let parsed: unknown = null;
      try { parsed = JSON.parse(dataLine); } catch { /* skip */ }
      onEvent(eventName, parsed);
    }
  }
}
