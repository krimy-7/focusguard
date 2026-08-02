import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

type TabRoute = {
  name: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconActive: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

export const TAB_ROUTES: TabRoute[] = [
  { name: 'index', label: 'Today', icon: 'weather-sunny', iconActive: 'weather-sunny' },
  { name: 'contexts', label: 'Contexts', icon: 'shape-outline', iconActive: 'shape' },
  { name: 'progress', label: 'Progress', icon: 'chart-line', iconActive: 'chart-line' },
  { name: 'support', label: 'Support', icon: 'heart-outline', iconActive: 'heart' },
];

type BottomTabBarProps = {
  state: { index: number; routes: { name: string }[] };
  navigation: { navigate: (name: string) => void };
};

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  return (
    <View
      style={isDesktop
        ? { position: 'absolute', left: 20, top: 20 + insets.top, bottom: 20 + insets.bottom, width: 224 }
        : { paddingBottom: Math.max(insets.bottom, 12) }}
      className={cn(
        'bg-surface-container-lowest border border-outline-variant/70',
        isDesktop ? 'rounded-[28px] p-md' : 'mx-md mb-sm px-sm pt-sm rounded-[24px]',
      )}>
      <View className={cn(isDesktop ? 'flex-1 gap-xs' : 'flex-row items-center justify-around')}>
        {isDesktop ? (
          <View className="flex-row items-center gap-sm px-sm pb-lg mb-sm border-b border-outline-variant/70">
            <View className="w-9 h-9 rounded-[14px] bg-primary items-center justify-center">
              <MaterialCommunityIcons name="shield-check" size={20} color={Palette.onPrimary} />
            </View>
            <View>
              <AppText variant="labelLg">FocusGuard</AppText>
              <AppText variant="labelSm" color="on-surface-variant">Focus workspace</AppText>
            </View>
          </View>
        ) : null}
        {state.routes.map((route, index) => {
          const def = TAB_ROUTES.find((r) => r.name === route.name);
          if (!def) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.name}
              onPress={() => navigation.navigate(route.name)}
              className={cn(
                'flex-row items-center gap-[8px] rounded-[14px] px-md py-sm active:opacity-80',
                isDesktop && 'w-full justify-start',
                focused ? 'bg-primary' : 'bg-transparent',
              )}>
              <MaterialCommunityIcons
                name={focused ? def.iconActive : def.icon}
                size={20}
                color={focused ? Palette.onPrimary : Palette.onSurfaceVariant}
              />
              <AppText
                variant="labelSm"
                color={focused ? 'on-primary' : 'on-surface-variant'}>
                {def.label}
              </AppText>
            </Pressable>
          );
        })}
        {isDesktop ? (
          <View className="mt-auto rounded-[18px] bg-primary-container p-md gap-xs">
            <AppText variant="labelSm" color="on-primary-container">Quietly protecting your attention.</AppText>
            <AppText variant="labelSm" color="primary">Focus better, one day at a time.</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
