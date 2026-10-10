// Plain-words sign-in errors. Pure. supabase-js returns {error} (it throws only in rare cases), and a
// network failure comes back as an AuthRetryableFetchError whose message is the browser's "Failed to fetch".

type AuthErrorLike = { message?: unknown; status?: unknown; code?: unknown; name?: unknown };

export const AUTH_MESSAGES = {
  offline: "Can't reach the sign-in service. Check your connection and try again.",
  rateLimit: 'Too many tries for now. Wait a minute, then try again.',
  badCode: "That code didn't work. Check it, or send a new code.",
  badEmail: "That email address doesn't look right.",
  server: 'Sign-in is having trouble on our side. Try again in a moment.',
  generic: "Sign-in didn't work. Try again in a moment.",
};

export function authErrorText(err: unknown): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as AuthErrorLike;
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name : '';

  if (/failed to fetch|networkerror|network request failed|load failed|timed out/.test(msg) || err instanceof TypeError || (name === 'AuthRetryableFetchError' && !status))
    return AUTH_MESSAGES.offline;
  if (status === 429 || code.includes('rate_limit') || /rate limit|too many/.test(msg)) return AUTH_MESSAGES.rateLimit;
  if (code === 'email_address_invalid' || (msg.includes('email') && msg.includes('invalid'))) return AUTH_MESSAGES.badEmail;
  if (code === 'otp_expired' || /expired|invalid|incorrect/.test(msg)) return AUTH_MESSAGES.badCode;
  if (status !== undefined && status >= 500) return AUTH_MESSAGES.server;
  return AUTH_MESSAGES.generic;
}
