import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

// Dot-notation reads only: Expo inlines process.env.EXPO_PUBLIC_* at build time (v57 env-vars guide).
export const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const AUTH_CONFIGURED = url !== '' && anonKey !== '';

// ponytail: placeholder URL/key only keep createClient from throwing when unconfigured;
// the Sign in screen shows AUTH_CONFIGURED=false instead of attempting a request.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage, // supports web + native (v57 async-storage page); no URL polyfill needed (v57 Supabase guide)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Google OAuth returns ?code= to the web origin; native has no URL
    flowType: 'pkce',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Session for the auth gate. `loading` until supabase-js has read storage (INITIAL_SESSION). */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(DEMO ? null : undefined);
  useEffect(() => {
    if (DEMO) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return {
    loading: session === undefined,
    signedIn: DEMO || session != null,
    email: session?.user.email ?? null,
  };
}
