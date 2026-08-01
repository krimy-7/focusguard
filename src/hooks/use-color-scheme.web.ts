import { useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * The state update happens during render (guarded) so the first render matches the server.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  if (!hasHydrated) {
    setHasHydrated(true);
  }

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
