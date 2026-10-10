import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { View } from 'react-native';

import { BrandBar, Nav, NavLink } from '@/components/nav';
import { useLayout } from '@/theme';

// Headless tabs: the brick rail (wide) / bottom bar (narrow) is the TabList. Inactive screens stay mounted
// but display:none, so they hold their last loaded content and are not tab stops.
// Keyed array, so crossing the breakpoint reorders the nav instead of remounting the screens.
export default function TabsLayout() {
  const { wide } = useLayout();
  const nav = (
    <TabList key="nav" asChild>
      <Nav wide={wide}>
        <TabTrigger name="index" href="/" asChild>
          <NavLink label="Today" icon="today" wide={wide} />
        </TabTrigger>
        <TabTrigger name="history" href="/history" asChild>
          <NavLink label="History" icon="history" wide={wide} />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <NavLink label="Settings" icon="settings" wide={wide} />
        </TabTrigger>
      </Nav>
    </TabList>
  );
  const main = (
    <View key="main" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      {wide ? null : <BrandBar />}
      <View role="main" style={{ flex: 1, minHeight: 0 }}>
        <TabSlot style={{ flexShrink: 1, minHeight: 0 }} />
      </View>
    </View>
  );
  return <Tabs style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>{wide ? [nav, main] : [main, nav]}</Tabs>;
}
