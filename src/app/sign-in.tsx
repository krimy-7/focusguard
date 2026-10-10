import { useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MascotAvatar } from '@/components/mascot';
import { clearSessionNotice, sessionNotice } from '@/lib/api';
import { MESSAGES } from '@/lib/http';
import { AUTH_CONFIGURED, supabase } from '@/lib/supabase';
import { Palette } from '@/theme';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CODE_RE = /^\d{6}$/;
const INPUT =
  'min-h-[48px] bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md font-body text-body-md text-on-surface';
const WEB = Platform.OS === 'web';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pure initializer (no clearing here: dev StrictMode may call it twice). The flag clears on the next action.
  const [error, setError] = useState<string | null>(() => (sessionNotice.ended ? MESSAGES.signedOut : null));

  const addr = email.trim();

  // Supabase returns {error} for auth failures (bad code, rate limit) and throws only on transport failure.
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, onOk?: () => void) => {
    setBusy(true);
    setError(null);
    clearSessionNotice();
    try {
      const { error: err } = await fn();
      if (err) setError(err.message);
      else onOk?.();
    } catch {
      setError("Can't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(() => supabase.auth.signInWithOtp({ email: addr }), () => setSent(true));
  // On success onAuthStateChange flips the root guard; nothing else to do here.
  const verify = () => run(() => supabase.auth.verifyOtp({ email: addr, token: code, type: 'email' }));
  const google = () =>
    run(() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 + insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }} className="gap-lg">
        <View className="items-center gap-sm">
          <MascotAvatar size={56} />
          <AppText variant="headlineMd" accessibilityRole="header">
            Sign in to FocusGuard AI
          </AppText>
          <AppText variant="bodyMd" color="on-surface-variant" className="text-center">
            Use the same account as the Chrome extension so your goals and days line up.
          </AppText>
        </View>

        {!AUTH_CONFIGURED ? (
          <Card surface="error-container" radius={20} className="p-md">
            <AppText variant="bodyMd" color="on-error-container">
              Sign-in isn’t set up yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env (or set
              EXPO_PUBLIC_DEMO_MODE=1) and restart.
            </AppText>
          </Card>
        ) : null}

        <Card radius={24} className="p-lg gap-md">
          {/* R40: Google is the primary, first option. The email code below is the secondary one. */}
          {WEB && !sent ? (
            <>
              <Button label="Continue with Google" disabled={busy || !AUTH_CONFIGURED} onPress={google} />
              <AppText variant="labelSm" color="on-surface-variant" className="text-center">
                or use an email code
              </AppText>
            </>
          ) : null}
          {!sent ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Palette.outline}
                keyboardType="email-address"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                accessibilityLabel="Email address"
                className={INPUT}
              />
              <Button
                tone={WEB ? 'quiet' : 'primary'}
                label={busy ? 'Sending…' : 'Email me a code'}
                disabled={busy || !AUTH_CONFIGURED || !EMAIL_RE.test(addr)}
                onPress={sendCode}
              />
            </>
          ) : (
            <>
              <AppText variant="bodyMd">Enter the 6-digit code we sent to {addr}.</AppText>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={Palette.outline}
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                accessibilityLabel="6-digit code"
                className={INPUT}
              />
              <Button label={busy ? 'Checking…' : 'Sign in'} disabled={busy || !CODE_RE.test(code)} onPress={verify} />
              <View className="flex-row gap-sm flex-wrap">
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
          {error ? (
            <AppText variant="labelSm" color="error" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
        </Card>
      </View>
    </ScrollView>
  );
}
