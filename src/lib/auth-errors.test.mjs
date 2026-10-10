import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_MESSAGES, authErrorText } from './auth-errors.ts';

test('network failure becomes a friendly offline line, never "Failed to fetch"', () => {
  assert.equal(authErrorText({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }), AUTH_MESSAGES.offline);
  assert.equal(authErrorText({ message: 'NetworkError when attempting to fetch resource.' }), AUTH_MESSAGES.offline);
  assert.equal(authErrorText(new TypeError('Load failed')), AUTH_MESSAGES.offline);
});

test('rate limits', () => {
  assert.equal(authErrorText({ status: 429, message: 'x' }), AUTH_MESSAGES.rateLimit);
  assert.equal(authErrorText({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), AUTH_MESSAGES.rateLimit);
});

test('wrong or expired code, bad email', () => {
  assert.equal(authErrorText({ code: 'otp_expired', message: 'Token has expired or is invalid' }), AUTH_MESSAGES.badCode);
  assert.equal(authErrorText({ message: 'Token has expired or is invalid' }), AUTH_MESSAGES.badCode);
  assert.equal(authErrorText({ code: 'email_address_invalid', message: 'Email address "a@b" is invalid' }), AUTH_MESSAGES.badEmail);
});

test('server errors and unknowns stay calm', () => {
  assert.equal(authErrorText({ status: 502, message: 'Bad gateway' }), AUTH_MESSAGES.server);
  assert.equal(authErrorText(undefined), AUTH_MESSAGES.generic);
  assert.equal(authErrorText({ message: 'weird' }), AUTH_MESSAGES.generic);
  for (const m of Object.values(AUTH_MESSAGES)) assert.doesNotMatch(m, /fetch|exception|undefined/i);
});
