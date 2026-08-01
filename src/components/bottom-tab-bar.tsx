import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Palette } from '@/theme';

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

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      className="flex-row items-center justify-around px-gutter pt-sm bg-surface-container-lowest rounded-t-[32px] border-t border-outline-variant/40">
      {state.routes.map((route, index) => {
        const def = TAB_ROUTES.find((r) => r.name === route.name);
        if (!def) return null;
        const focused = state.index === index;

        return (
          <Pressable
            key={route.name}
            onPress={() => navigation.navigate(route.name)}
            className={[
              'items-center justify-center px-md py-sm rounded-full gap-[2px] min-w-[64px] active:scale-95',
              focused && 'bg-primary-container',
            ].join(' ')}>
            <MaterialCommunityIcons
              name={focused ? def.iconActive : def.icon}
              size={22}
              color={focused ? Palette.onPrimaryContainer : Palette.onSurfaceVariant}
            />
            <AppText
              variant="labelSm"
              color={focused ? 'on-primary-container' : 'on-surface-variant'}>
              {def.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
