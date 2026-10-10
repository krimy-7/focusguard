import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Web tab title, e.g. "History · FocusGuard AI", set whenever this screen is the focused one. No-op on native. */
export function useDocumentTitle(page: string) {
  const focused = useIsFocused();
  useEffect(() => {
    if (Platform.OS === 'web' && focused && typeof document !== 'undefined') document.title = `${page} · FocusGuard AI`;
  }, [page, focused]);
}
