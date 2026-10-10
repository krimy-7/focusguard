import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { LatticeWindow } from '@/components/brand';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { clearSessionNotice, sessionNotice } from '@/lib/api';
import { authErrorText } from '@/lib/auth-errors';
import { MESSAGES } from '@/lib/http';
import { AUTH_CONFIGURED, supabase } from '@/lib/supabase';
import { RADIUS, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CODE_RE = /^\d{6}$/;
const WEB = Platform.OS === 'web';

/** The standard four-colour Google "G". */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  useDocumentTitle('Sign in');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Pure initializers (no clearing here: dev StrictMode may call them twice). The flags clear on the next action.
  const [notice, setNotice] = useState<string | null>(() =>
    sessionNotice.deleted ? MESSAGES.deleted : sessionNotice.ended ? MESSAGES.signedOut : null,
  );
  const [error, setError] = useState<string | null>(null);

  const addr = email.trim();
  const canSend = !busy && AUTH_CONFIGURED && EMAIL_RE.test(addr);
  const canVerify = !busy && CODE_RE.test(code);

  // supabase-js returns {error} for auth failures (bad code, rate limit, network) and throws only rarely.
  const run = async (fn: () => Promise<{ error: unknown }>, onOk?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    clearSessionNotice();
    try {
      const { error: err } = await fn();
      if (err) setError(authErrorText(err));
      else onOk?.();
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(() => supabase.auth.signInWithOtp({ email: addr }), () => setSent(true));
  // On success onAuthStateChange flips the root guard; nothing else to do here.
  const verify = () => run(() => supabase.auth.verifyOtp({ email: addr, token: code, type: 'email' }));
  const google = () => run(() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingBottom: 40 + insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 440, gap: 28 }} role="main">
        <View className="items-center gap-3">
          <LatticeWindow state="open" size="md" />
          <AppText variant="title" level={1} style={{ textAlign: 'center' }}>
            Welcome to FocusGuard AI
          </AppText>
          <AppText tone="ink2" style={{ textAlign: 'center', maxWidth: 380 }}>
            FocusGuard AI notices when you drift from your task, waits a while, then helps you get back to it. Use the same account as the Chrome extension so your goals and days line up.
          </AppText>
        </View>

        {!AUTH_CONFIGURED ? (
          <Notice tone="try">
            Sign-in isn’t set up yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env (or set EXPO_PUBLIC_DEMO_MODE=1) and restart.
          </Notice>
        ) : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <View style={{ gap: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: RADIUS.control, padding: 24 }}>
          {/* R40: Google is the primary, first option. The email code below is the secondary one. */}
          {WEB && !sent ? (
            <>
              <Button
                label="Continue with Google"
                disabled={busy || !AUTH_CONFIGURED}
                onPress={google}
                lead={
                  <View style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <GoogleMark size={18} />
                  </View>
                }
                style={{ alignSelf: 'stretch', minHeight: 50 }}
              />
              <AppText variant="small" tone="ink2" style={{ textAlign: 'center' }}>
                or use an email code
              </AppText>
            </>
          ) : null}

          {!sent ? (
            <>
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={() => canSend && sendCode()}
                accessibilityLabel="Email address"
              />
              <Button
                tone={WEB ? 'quiet' : 'primary'}
                label={busy ? 'Sending…' : 'Email me a code'}
                disabled={!canSend}
                onPress={sendCode}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : (
            <>
              <AppText>Enter the 6-digit code we sent to {addr}.</AppText>
              <Field
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={() => canVerify && verify()}
                accessibilityLabel="6-digit code"
              />
              <Button label={busy ? 'Checking…' : 'Sign in'} disabled={!canVerify} onPress={verify} style={{ alignSelf: 'stretch' }} />
              <View className="flex-row flex-wrap gap-3">
                <Button tone="quiet" label="Send a new code" disabled={busy} onPress={sendCode} />
                <Button
                  tone="quiet"
                  label="Use a different email"
                  disabled={busy}
                  onPress={() => {
                    setSent(false);
                    setCode('');
                    setError(null);
                  }}
                />
              </View>
            </>
          )}
          {error ? <Notice tone="try" urgent>{error}</Notice> : null}
        </View>

        <View style={{ gap: 8 }}>
          <Pressable
            role="button"
            aria-expanded={showPrivacy}
            onPress={() => setShowPrivacy((v) => !v)}
            style={[{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }, webStyle({ cursor: 'pointer' })]}>
            <AppText variant="label" style={{ textDecorationLine: 'underline' }}>
              {showPrivacy ? 'Hide how your privacy works' : 'How your privacy works'}
            </AppText>
          </Pressable>
          {showPrivacy ? (
            <AppText tone="ink2">
              Your browsing activity stays in your browser: page titles and full addresses never leave it. Our server keeps only your account email, your goals, task names with their site names, your settings and daily totals. No ads and no tracking. You can export or delete everything from Settings.
            </AppText>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
