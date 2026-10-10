// C1 transport. Pure: fetch, token and session hooks are injected so `node --test` can drive it.

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  status: number; // 0 = never reached the server (offline / timeout)
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const MESSAGES = {
  offline: "Can't reach FocusGuard AI right now. Check your connection and try again.",
  timeout: 'FocusGuard AI took too long to answer. Try again in a moment.',
  signedOut: 'Your session ended. Please sign in again.',
  notFound: 'That item is no longer there.',
  tooMany: 'Too many requests. Wait a minute and try again.',
};

export function messageFor(status: number, detail: string): string {
  if (status === 404) return MESSAGES.notFound;
  if (status === 429) return MESSAGES.tooMany;
  if (status === 400 || status === 422)
    return detail ? `That didn't look right: ${detail}` : "That didn't look right. Check the value and try again.";
  return `Something went wrong on our side (${status}). Try again in a moment.`;
}

/** FastAPI `detail` is a string, or a list of {msg} for 422. */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string') return detail[0].msg;
  return '';
}

export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again in a moment.';
}

export type CallerDeps = {
  baseUrl: string; // e.g. "http://localhost:8000/api"
  // getToken/refresh may reject with an ApiError (offline refresh): it reaches the caller as-is, no sign-out.
  getToken: () => Promise<string | null>;
  refresh: () => Promise<boolean>; // true when a fresh token is now available
  onSignedOut: () => Promise<void> | void;
  pendingDelete?: { get: () => Promise<boolean>; clear: () => Promise<void> };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function makeCaller(deps: CallerDeps) {
  const timeoutMs = deps.timeoutMs ?? 8000;

  // Index R9: a DELETE /me that ended in 502 leaves a server tombstone, so every other route now 401s for this
  // user while DELETE /me still accepts the token. Finish the deletion before the session is dropped.
  async function finishPendingDelete(): Promise<void> {
    try {
      if (!(await deps.pendingDelete?.get())) return;
      const token = await deps.getToken();
      if (token && (await request('DELETE', '/me', undefined, token)).status === 204) await deps.pendingDelete?.clear();
    } catch {
      // offline or no session: keep the flag for the next forced sign-out
    }
  }

  async function signedOut(): Promise<never> {
    await finishPendingDelete();
    await deps.onSignedOut();
    throw new ApiError(401, MESSAGES.signedOut);
  }

  async function send(method: Method, path: string, body: unknown): Promise<Response> {
    const token = await deps.getToken();
    if (!token) return signedOut();
    return request(method, path, body, token);
  }

  async function request(method: Method, path: string, body: unknown, token: string): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const f = deps.fetchImpl ?? fetch;
      return await f(`${deps.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, ctrl.signal.aborted ? MESSAGES.timeout : MESSAGES.offline);
    } finally {
      clearTimeout(timer);
    }
  }

  return async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res = await send(method, path, body);
    if (res.status === 401 && (await deps.refresh())) res = await send(method, path, body);
    if (res.status === 401) return signedOut();
    if (!res.ok) {
      let detail = '';
      try {
        detail = detailText((await res.json()).detail);
      } catch {
        // non-JSON error body: status-only message
      }
      throw new ApiError(res.status, messageFor(res.status, detail));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };
}
