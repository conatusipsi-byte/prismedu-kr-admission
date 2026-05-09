/**
 * API 호출용 클라이언트 헬퍼.
 *
 * 모든 /api/* 호출은 fetchWithAuth를 통해 Firebase ID 토큰 헤더를 자동 첨부.
 * 비인증 호출 시 401, 쿼터 초과 시 429를 받음.
 */
import { auth } from "./firebase";

/** 401/429 등 사용자에게 보여줄 메시지를 가진 에러 */
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

/** 세션 만료(refresh 후에도 401) 시 한 번만 dispatch — 여러 동시 요청에서 토스트 중복 방지.
 *
 * 페이지 리스너(SessionExpiryWatcher)가 토스트 + 부드러운 redirect를 담당.
 * window 단위 throttle: 최근 5초 내 dispatch 됐으면 skip. */
let lastSessionExpiredDispatch = 0;
function dispatchSessionExpired() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSessionExpiredDispatch < 5000) return;
  lastSessionExpiredDispatch = now;
  try {
    window.dispatchEvent(new CustomEvent("prism:session-expired"));
  } catch { /* IE polyfill 부재 등 — 무시 */ }
}

/** Firebase ID 토큰을 자동 첨부하는 fetch.
 *
 * - 로그인 상태가 아니면 ApiError(401)
 * - 응답이 비-2xx면 ApiError 던짐 (status, code, message 포함)
 * - 응답 본문은 JSON으로 가정. 호출자가 .json()을 또 호출할 필요 없음.
 */
export async function fetchWithAuth<T = unknown>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, "NOT_AUTHENTICATED", "로그인이 필요해요.");
  }

  // ID token은 1시간 만료. getIdToken()이 자동으로 만료 임박 시 갱신하지만,
  // 401 응답을 받으면 강제 갱신 후 1회 재시도해 토큰 만료 race를 차단.
  const buildHeaders = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  };

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new ApiError(401, "TOKEN_FAILED", "인증 토큰을 가져올 수 없어요. 다시 로그인해주세요.");
  }

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });

  // 401이면 토큰 강제 갱신 후 1회 재시도 (만료 race 대응)
  if (res.status === 401) {
    try {
      const fresh = await user.getIdToken(/* forceRefresh */ true);
      res = await fetch(url, { ...init, headers: buildHeaders(fresh) });
    } catch {
      dispatchSessionExpired();
      throw new ApiError(401, "TOKEN_FAILED", "세션이 만료되었어요. 다시 로그인해주세요.");
    }
  }

  // 응답 본문 한 번만 읽기 (JSON 우선, 실패 시 text로 fallback)
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

  if (!res.ok) {
    const errBody = (data && typeof data === "object" ? data : {}) as { error?: string; code?: string };
    const message = errBody.error || `요청 실패 (${res.status})`;
    // 재시도 후에도 401이면 진짜 만료 — 사용자에게 알림.
    if (res.status === 401) dispatchSessionExpired();
    throw new ApiError(res.status, errBody.code, message, data);
  }
  return data as T;
}

/**
 * SSE 스트리밍용 인증 fetch.
 *
 * - 본문은 raw stream이므로 fetchWithAuth(JSON parser)와 별도.
 * - 비-2xx 응답은 JSON으로 파싱해 ApiError로 throw — 호출자가 일반 에러처럼 처리 가능.
 * - 401 자동 재시도는 ID 토큰 만료 race 대응으로 동일하게 적용.
 */
export async function streamWithAuth(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, "NOT_AUTHENTICATED", "로그인이 필요해요.");
  }

  const buildHeaders = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  };

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new ApiError(401, "TOKEN_FAILED", "인증 토큰을 가져올 수 없어요. 다시 로그인해주세요.");
  }

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  if (res.status === 401) {
    try {
      const fresh = await user.getIdToken(true);
      res = await fetch(url, { ...init, headers: buildHeaders(fresh) });
    } catch {
      dispatchSessionExpired();
      throw new ApiError(401, "TOKEN_FAILED", "세션이 만료되었어요. 다시 로그인해주세요.");
    }
  }

  if (!res.ok) {
    // 에러 응답은 JSON일 가능성이 높음 — 본문 파싱 후 ApiError로 변환.
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
 * SSE 이벤트 파서 — `event: NAME\ndata: JSON\n\n` 형태를 callback으로 dispatch.
 *
 * 한 청크에 여러 이벤트, 또는 한 이벤트가 여러 청크에 걸쳐 도착할 수 있어
 * 마지막 미완성 라인은 buffer에 유지.
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
      try { parsed = JSON.parse(dataLine); } catch { /* ignore */ }
      onEvent(eventName, parsed);
    }
  }
}
