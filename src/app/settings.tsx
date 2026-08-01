import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { TopAppBar } from '@/components/top-app-bar';
import { API_URL, api, type FocusContext } from '@/lib/api';
import { Palette, ScreenContent } from '@/theme';
import { cn } from '@/theme/tailwind';

type ToggleRowProps = {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
};

function ToggleRow({ icon, label, sub, value, onChange, danger }: ToggleRowProps) {
  return (
    <View className="flex-row items-center gap-md py-sm px-sm">
      <View className={cn('w-10 h-10 rounded-full items-center justify-center', danger ? 'bg-error-container' : 'bg-surface-container-high')}>
        <Icon name={icon} size={20} color={danger ? Palette.error : Palette.onSurfaceVariant} />
      </View>
      <View className="flex-1">
        <AppText variant="bodyLg">{label}</AppText>
        {sub ? (
          <AppText variant="labelSm" color="on-surface-variant">
            {sub}
          </AppText>
        ) : null}
      </View>
      <Pressable
        hitSlop={8}
        onPress={() => onChange(!value)}
        className={cn('w-[46px] h-[28px] rounded-full items-center justify-start p-[3px]', value ? 'bg-primary' : 'bg-surface-container-highest')}>
        <View className={cn('w-5 h-5 rounded-full shadow-sm', value ? 'bg-on-primary ml-auto' : 'bg-white')} />
      </Pressable>
    </View>
  );
}

type SectionProps = { title: string; children: React.ReactNode; danger?: boolean };

function Section({ title, children, danger }: SectionProps) {
  return (
    <View className={cn('rounded-[24px] border bg-surface', danger ? 'border-error-container' : 'border-outline-variant/40')}>
      <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[1.5px] px-sm pt-md pb-xs">
        {title}
      </AppText>
      <View className="gap-sm pb-sm">{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [syncStatus, setSyncStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [graceMin, setGraceMin] = useState(5);
  const [graceCustom, setGraceCustom] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [quietWatch, setQuietWatch] = useState(true);
  const [cloudSync, setCloudSync] = useState(true);
  const [contextRetention, setContextRetention] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [contexts, setContexts] = useState<FocusContext[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [res, cs] = await Promise.all([fetch(`${API_URL}/api/health`), api.getContexts()]);
          if (active) {
            setSyncStatus(res.ok ? 'online' : 'offline');
            setContexts(cs);
          }
        } catch {
          if (active) setSyncStatus('offline');
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const extensionConnected = contexts.some((c) => c.source === 'extension');

  const gracePresets = [5, 10, 15];

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...ScreenContent, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <View className="items-center gap-sm pt-sm">
          <View className="w-20 h-20 rounded-[28px] bg-primary-container items-center justify-center">
            <Icon name="shield-check-outline" size={40} color={Palette.onPrimaryContainer} />
          </View>
          <AppText variant="headlineMd">FocusGuard</AppText>
          <AppText variant="labelSm" color="on-surface-variant">
            v1.0.0 · Free Forever
          </AppText>
        </View>

        {/* Account / sync */}
        <Section title="Account & sync">
          <View className="flex-row items-center gap-md py-sm px-sm">
            <View className={cn('w-10 h-10 rounded-full items-center justify-center', syncStatus === 'online' ? 'bg-secondary-container' : syncStatus === 'checking' ? 'bg-surface-container-high' : 'bg-error-container')}>
              <Icon name={syncStatus === 'online' ? 'cloud-check' : syncStatus === 'checking' ? 'cloud-sync' : 'cloud-off-outline'} color={syncStatus === 'online' ? Palette.onSecondaryContainer : syncStatus === 'checking' ? Palette.onSurfaceVariant : Palette.error} />
            </View>
            <View className="flex-1">
              <AppText variant="bodyLg">
                {syncStatus === 'online' ? 'Phone ⇄ Account ⇄ Desktop' : syncStatus === 'checking' ? 'Checking sync…' : 'Sync unavailable'}
              </AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                {syncStatus === 'online' ? `Connected to ${API_URL.replace('http://', '')}` : 'Start the backend to sync across devices'}
              </AppText>
            </View>
          </View>
          <ToggleRow icon="cloud-sync" label="Cloud sync" sub="Keep goals, context and progress in sync" value={cloudSync} onChange={setCloudSync} />
          <View className="flex-row items-center gap-md py-sm px-sm">
            <View className={cn('w-10 h-10 rounded-full items-center justify-center', extensionConnected ? 'bg-secondary-container' : 'bg-surface-container-high')}>
              <Icon name="puzzle" size={20} color={extensionConnected ? Palette.onSecondaryContainer : Palette.onSurfaceVariant} />
            </View>
            <View className="flex-1">
              <AppText variant="bodyLg">Chrome extension</AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                {extensionConnected ? 'Desktop watchdog connected' : 'Not connected — open your laptop to sync'}
              </AppText>
            </View>
          </View>
        </Section>

        {/* Watchdog / preferences */}
        <Section title="Watchdog preferences">
          <View className="px-sm py-sm gap-xs">
            <AppText variant="bodyLg">Grace period</AppText>
            <AppText variant="labelSm" color="on-surface-variant">
              How long FocusGuard waits before nudging you after a drift.
            </AppText>
            <View className="flex-row gap-sm pt-xs">
              {gracePresets.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setGraceMin(m);
                    setGraceCustom(false);
                  }}
                  className={cn(
                    'px-md py-xs rounded-full border',
                    !graceCustom && graceMin === m ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-low',
                  )}>
                  <AppText variant="labelSm" color={!graceCustom && graceMin === m ? 'primary' : 'on-surface-variant'}>
                    {m} min
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
          <ToggleRow icon="bell-outline" label="Gentle notifications" sub="Level 1 + 2 interventions" value={notifications} onChange={setNotifications} />
          <ToggleRow icon="eye-off-outline" label="Quiet watch" sub="No nagging during grace period" value={quietWatch} onChange={setQuietWatch} />
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <ToggleRow icon="history" label="Context retention" sub="Keep grouped activity history" value={contextRetention} onChange={setContextRetention} />
          <ToggleRow icon="shield-lock-outline" label="Private mode" sub="Never send raw activity" value={privateMode} onChange={setPrivateMode} />
          <View className="flex-row items-center gap-md py-sm px-sm opacity-60">
            <View className="w-10 h-10 rounded-full bg-surface-container-high items-center justify-center">
              <Icon name="database-export-outline" size={20} color={Palette.onSurfaceVariant} />
            </View>
            <View className="flex-1">
              <AppText variant="bodyLg">Export my data</AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                Coming soon
              </AppText>
            </View>
          </View>
        </Section>

        <Section title="Account" danger>
          <Pressable className="flex-row items-center gap-md py-sm px-sm active:opacity-80">
            <View className="w-10 h-10 rounded-full bg-error-container items-center justify-center">
              <Icon name="logout" size={20} color={Palette.error} />
            </View>
            <AppText variant="bodyLg" color="error">
              Log Out
            </AppText>
          </Pressable>
        </Section>

        <AppText variant="labelSm" color="on-surface-variant" className="text-center pb-sm">
          FocusGuard is privacy-first. Raw browsing data is never exposed — only meaningful context.
        </AppText>
      </ScrollView>
    </View>
  );
}
