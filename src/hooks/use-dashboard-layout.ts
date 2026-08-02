import { useWindowDimensions } from 'react-native';

import { ScreenContent } from '@/theme';

export function useDashboardLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  return {
    isDesktop,
    contentStyle: {
      ...ScreenContent,
      maxWidth: isDesktop ? 1440 : 560,
      paddingHorizontal: isDesktop ? 40 : 20,
      paddingLeft: isDesktop ? 280 : 20,
    },
  } as const;
}
