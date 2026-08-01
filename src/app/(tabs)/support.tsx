import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { TopAppBar } from '@/components/top-app-bar';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api, parseServerUtc, type BeastMode } from '@/lib/api';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

import {
  getLaunchableApps,
  hasUsageAccess,
  isBeastGuardAvailable,
  openUsageAccessSettings,
  startBeastGuard,
  stopBeastGuard,
  type LaunchableApp,
} from '../../../modules/focusguard-usage';

type Tool = 'timer' | 'meditate' | 'mood' | 'beast';

const TOOLS: { key: Tool; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
  { key: 'timer', label: 'Timer', icon: 'timer-outline' },
  { key: 'meditate', label: 'Meditate', icon: 'meditation' },
  { key: 'mood', label: 'Mood', icon: 'emoticon-happy-outline' },
  { key: 'beast', label: 'Beast Mode', icon: 'fire' },
];

const MOODS = ['😴', '😐', '🙂', '😄', '🔥'];
const TIMER_STORAGE_PREFIX = 'focusguard:countdown:';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useCountdown(initialSeconds: number, storageKey: string) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef<number | null>(null);
  const notificationIdRef = useRef<string | null>(null);

  const clearPersistedState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(`${TIMER_STORAGE_PREFIX}${storageKey}`);
    } catch {
      // ignore persistence errors
    }
  }, [storageKey]);

  const clearScheduledNotification = useCallback(async () => {
    if (Platform.OS === 'web' || !notificationIdRef.current) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    } catch {
      // ignore notification errors
    }
  }, []);

  const persistState = useCallback(
    async (nextRemaining: number, nextRunning: boolean, nextEndAt: number | null) => {
      if (!storageKey) return;
      try {
        await AsyncStorage.setItem(
          `${TIMER_STORAGE_PREFIX}${storageKey}`,
          JSON.stringify({ remaining: nextRemaining, running: nextRunning, endAt: nextEndAt }),
        );
      } catch {
        // ignore persistence errors
      }
    },
    [storageKey],
  );

  const finish = useCallback(async () => {
    endAtRef.current = null;
    setRunning(false);
    setRemaining(0);
    await clearScheduledNotification();
    await clearPersistedState();
  }, [clearPersistedState, clearScheduledNotification]);

  const stop = useCallback(async () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    endAtRef.current = null;
    setRunning(false);
    await clearScheduledNotification();
    await persistState(remaining, false, null);
  }, [clearScheduledNotification, persistState, remaining]);

  const start = useCallback(async () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (remaining <= 0) {
      setRemaining(initialSeconds);
    }
    const secondsToRun = Math.max(1, remaining > 0 ? remaining : initialSeconds);
    const nextEndAt = Date.now() + secondsToRun * 1000;
    endAtRef.current = nextEndAt;
    setRemaining(secondsToRun);
    setRunning(true);
    await persistState(secondsToRun, true, nextEndAt);
    if (Platform.OS !== 'web') {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          await clearScheduledNotification();
          notificationIdRef.current = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Focus timer complete',
              body: 'Your session is done. Take a breath or start the next one.',
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(nextEndAt) },
          });
        }
      } catch {
        // ignore notification errors
      }
    }
  }, [clearScheduledNotification, initialSeconds, persistState, remaining]);

  const reset = useCallback(
    async (seconds: number) => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      endAtRef.current = null;
      setRemaining(seconds);
      setRunning(false);
      await clearScheduledNotification();
      await clearPersistedState();
    },
    [clearPersistedState, clearScheduledNotification],
  );

  useEffect(() => {
    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(`${TIMER_STORAGE_PREFIX}${storageKey}`);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { remaining?: number; running?: boolean; endAt?: number | null };
        if (!parsed || typeof parsed !== 'object') return;
        if (parsed.running && parsed.endAt && parsed.endAt > Date.now()) {
          const nextRemaining = Math.max(0, Math.ceil((parsed.endAt - Date.now()) / 1000));
          endAtRef.current = parsed.endAt;
          setRemaining(nextRemaining);
          setRunning(true);
          await persistState(nextRemaining, true, parsed.endAt);
        } else {
          endAtRef.current = null;
          setRemaining(parsed.remaining ?? initialSeconds);
          setRunning(false);
          await clearPersistedState();
        }
      } catch {
        // ignore persistence errors
      }
    };

    hydrate();
  }, [clearPersistedState, initialSeconds, persistState, storageKey]);

  useEffect(() => {
    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!endAtRef.current) return;
      const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        void finish();
      }
    });

    return () => appStateListener.remove();
  }, [finish]);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (!endAtRef.current) return;
      const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        await finish();
        return;
      }
      await persistState(nextRemaining, true, endAtRef.current);
    };

    void tick();
    timer.current = setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [finish, persistState, running]);

  return { remaining, running, start, stop, reset, setRemaining };
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'px-md py-xs rounded-full border active:opacity-85',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-low',
      )}>
      <AppText variant="labelSm" color={selected ? 'primary' : 'on-surface-variant'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ToolShell({ children }: { children: React.ReactNode }) {
  return <Card className="p-lg gap-md">{children}</Card>;
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle } = useDashboardLayout();
  const [tool, setTool] = useState<Tool>('timer');

  // Pomodoro
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const timer = useCountdown(focusMin * 60, 'focus');
  const [onBreak, setOnBreak] = useState(false);

  // Meditation
  const [medMin, setMedMin] = useState(5);
  const [ambient, setAmbient] = useState('Lo-fi');
  const med = useCountdown(medMin * 60, 'meditation');

  // Mood
  const [mood, setMood] = useState('');
  const [moodNote, setMoodNote] = useState('');

  // Beast
  const [beast, setBeast] = useState<BeastMode | null>(null);
  const [beastMin, setBeastMin] = useState(60);
  const [blockedInput, setBlockedInput] = useState('');
  const [installedApps, setInstalledApps] = useState<LaunchableApp[]>([]);
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [usageGranted, setUsageGranted] = useState(false);
  const [beastAvailable, setBeastAvailable] = useState(false);
  const [guardBusy, setGuardBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.getBeast().then(setBeast);
      Promise.all([getLaunchableApps(), hasUsageAccess()]).then(([apps, granted]) => {
        setInstalledApps(apps);
        setUsageGranted(granted);
        setBeastAvailable(isBeastGuardAvailable());
      });
    }, []),
  );

const pickFocus = async (min: number) => {
    setFocusMin(min);
    await timer.reset(min * 60);
    setOnBreak(false);
  };

  const handleStartTimer = async () => {
    if (timer.remaining === 0 || onBreak) {
      await timer.reset((onBreak ? breakMin : focusMin) * 60);
      setOnBreak(false);
    }
    await timer.start();
  };

  const pickMeditate = async (min: number) => {
    setMedMin(min);
    await med.reset(min * 60);
  };

  const handleStartMeditation = async () => {
    if (med.remaining === 0) await med.reset(medMin * 60);
    await med.start();
  };

  const logMood = async () => {
    if (!mood) return;
    await api.logMood(mood, moodNote);
    setMood('');
    setMoodNote('');
  };

  const toggleBlockedApp = (pkg: string) => {
    setBlockedApps((prev) => (prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg]));
  };

  const startBeast = async () => {
    const sites = blockedInput.split(',').map((s) => s.trim()).filter(Boolean);
    setGuardBusy(true);
    try {
      const created = await api.startBeast(beastMin, sites, blockedApps);
      setBeast(created);
      if (created && created.ends_at && blockedApps.length) {
        await startBeastGuard(blockedApps, parseServerUtc(created.ends_at));
      }
    } finally {
      setGuardBusy(false);
    }
  };

  const stopBeast = async () => {
    await stopBeastGuard();
    await api.stopBeast();
    setBeast(null);
  };

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, gap: 16, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineXl">Support</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          Gentle tools for the moments in between.
        </AppText>

        <View className="flex-row gap-xs rounded-[22px] bg-surface-container-low p-xs">
          {TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTool(t.key)}
              className={cn(
                'flex-1 items-center gap-xs py-sm rounded-[18px] active:opacity-85',
                tool === t.key ? 'bg-surface-container-lowest' : 'bg-transparent',
              )}>
              <Icon name={t.icon} size={18} color={tool === t.key ? Palette.primary : Palette.onSurfaceVariant} />
              <AppText variant="labelSm" color={tool === t.key ? 'primary' : 'on-surface-variant'}>
                {t.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        {tool === 'timer' ? (
          <ToolShell>
            <View className="flex-row justify-between items-center">
              <AppText variant="headlineMd">{onBreak ? 'Break time' : 'Focus timer'}</AppText>
              <AppText variant="labelSm" color="on-surface-variant">
                Supporting tool — optional
              </AppText>
            </View>

            <View className="items-center py-lg rounded-[24px] bg-primary-container">
              <View className="w-44 h-44 rounded-full border-4 bg-surface-container-lowest items-center justify-center"
                style={{ borderColor: Palette.primary }}>
                <AppText variant="headlineXl" className="text-[44px]">
                  {fmt(timer.remaining)}
                </AppText>
                <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[2px]">
                  {onBreak ? 'Break' : 'Focus'}
                </AppText>
              </View>
            </View>

            <View className="flex-row gap-sm justify-center">
              <Pressable onPress={handleStartTimer} className="px-lg py-sm rounded-full bg-primary items-center active:opacity-85">
                <AppText variant="labelLg" color="on-primary">
                  {timer.running ? 'Pause' : 'Start'}
                </AppText>
              </Pressable>
              <Pressable onPress={() => void timer.reset((onBreak ? breakMin : focusMin) * 60)} className="px-lg py-sm rounded-full border border-outline-variant active:opacity-85">
                <AppText variant="labelLg">Reset</AppText>
              </Pressable>
            </View>

            <View className="gap-xs">
              <AppText variant="labelSm" color="on-surface-variant">Focus length</AppText>
              <View className="flex-row gap-sm">
                {[15, 25, 50].map((m) => (
                  <Chip key={m} label={`${m} min`} selected={!onBreak && focusMin === m} onPress={() => pickFocus(m)} />
                ))}
              </View>
              <AppText variant="labelSm" color="on-surface-variant">Break length</AppText>
              <View className="flex-row gap-sm">
                {[5, 10].map((m) => (
                  <Chip key={m} label={`${m} min`} selected={breakMin === m} onPress={() => setBreakMin(m)} />
                ))}
              </View>
            </View>
          </ToolShell>
        ) : tool === 'meditate' ? (
          <ToolShell>
            <AppText variant="headlineMd">Meditation</AppText>
            <AppText variant="bodyMd" color="on-surface-variant">
              A quiet reset for your mind. Choose a length and breathe.
            </AppText>
            <View className="items-center py-md">
              <View className="w-40 h-40 rounded-full border-4 border-tertiary-container items-center justify-center">
                <AppText variant="headlineXl" className="text-[40px]">
                  {fmt(med.remaining)}
                </AppText>
                <AppText variant="labelSm" color="on-surface-variant" className="uppercase tracking-[2px]">
                  {ambient} · {medMin} min
                </AppText>
              </View>
            </View>
            <View className="flex-row gap-sm justify-center">
              <Pressable onPress={handleStartMeditation} className="px-lg py-sm rounded-full bg-tertiary-container items-center active:opacity-85">
                <AppText variant="labelLg" color="on-tertiary-container">
                  {med.running ? 'Pause' : 'Begin'}
                </AppText>
              </Pressable>
              <Pressable onPress={() => void med.reset(medMin * 60)} className="px-lg py-sm rounded-full border border-outline-variant active:opacity-85">
                <AppText variant="labelLg">Reset</AppText>
              </Pressable>
            </View>
            <View className="gap-xs">
              <AppText variant="labelSm" color="on-surface-variant">Duration</AppText>
              <View className="flex-row gap-sm">
                {[5, 10, 15].map((m) => (
                  <Chip key={m} label={`${m} min`} selected={medMin === m} onPress={() => pickMeditate(m)} />
                ))}
              </View>
              <AppText variant="labelSm" color="on-surface-variant">Ambient</AppText>
              <View className="flex-row gap-sm">
                {['Lo-fi', 'Rain', 'Silence'].map((a) => (
                  <Chip key={a} label={a} selected={ambient === a} onPress={() => setAmbient(a)} />
                ))}
              </View>
            </View>
          </ToolShell>
        ) : tool === 'mood' ? (
          <ToolShell>
            <AppText variant="headlineMd">How are you feeling?</AppText>
            <AppText variant="bodyMd" color="on-surface-variant">
              Quick check-in — no journaling required.
            </AppText>
            <View className="flex-row justify-between py-sm">
              {MOODS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMood(m)}
                  className={cn('w-12 h-12 rounded-full items-center justify-center text-[26px]', mood === m && 'bg-primary-container')}>
                  <AppText variant="headlineMd">{m}</AppText>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={moodNote}
              onChangeText={setMoodNote}
              placeholder="Add a short note (optional)"
              placeholderTextColor={Palette.outline}
              className="bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body text-body-md text-on-surface"
            />
            <Pressable onPress={logMood} disabled={!mood} className="bg-primary rounded-full px-lg py-sm items-center active:opacity-85 disabled:opacity-40">
              <AppText variant="labelLg" color="on-primary">
                Log mood
              </AppText>
            </Pressable>
          </ToolShell>
        ) : (
          <ToolShell>
            <View className="flex-row items-center justify-between">
              <AppText variant="headlineMd">Beast Mode</AppText>
              <View className="flex-row items-center gap-xs">
                <Icon name="fire" size={18} color={beast?.active ? Palette.error : Palette.outline} />
                <AppText variant="labelSm" color={beast?.active ? 'error' : 'on-surface-variant'}>
                  {beast?.active ? 'Active' : 'Off'}
                </AppText>
              </View>
            </View>

            {beast?.active ? (
              <View className="gap-sm">
                <Card surface="error-container" radius={16} className="p-md gap-xs">
                  <AppText variant="labelLg" color="on-error-container">
                    Locked until {beast.ends_at ? new Date(parseServerUtc(beast.ends_at)).toLocaleTimeString() : '…'}
                  </AppText>
                  <AppText variant="bodyMd" color="on-error-container">
                    {beast.blocked_apps.length
                      ? `${beast.blocked_apps.length} app(s) blocked: ${beast.blocked_apps.join(', ')}`
                      : 'No apps blocked.'}
                    {beast.blocked_sites.length ? `  Sites: ${beast.blocked_sites.join(', ')}` : ''}
                  </AppText>
                </Card>
                <Pressable onPress={stopBeast} className="bg-error rounded-full px-lg py-sm items-center active:opacity-85">
                  <AppText variant="labelLg" color="on-error">
                    End Beast Mode
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View className="gap-md">
                <AppText variant="bodyMd" color="on-surface-variant">
                  Pick a window and the apps to lock away while you grind. On Android, FocusGuard
                  needs Usage Access to catch you opening a blocked app.
                </AppText>

                {beastAvailable && !usageGranted && (
                  <Card surface="error-container" radius={16} className="p-md gap-xs">
                    <AppText variant="labelLg" color="on-error-container">
                      Usage Access required
                    </AppText>
                    <AppText variant="bodyMd" color="on-error-container">
                      Grant FocusGuard access to app usage so Beast Mode can block distracting apps.
                    </AppText>
                    <Pressable
                      onPress={openUsageAccessSettings}
                      className="bg-error rounded-full px-lg py-sm items-center self-start active:opacity-85">
                      <AppText variant="labelLg" color="on-error">
                        Grant access
                      </AppText>
                    </Pressable>
                  </Card>
                )}

                <View className="flex-row gap-sm">
                  {[30, 60, 90].map((m) => (
                    <Chip key={m} label={`${m} min`} selected={beastMin === m} onPress={() => setBeastMin(m)} />
                  ))}
                </View>

                <TextInput
                  value={blockedInput}
                  onChangeText={setBlockedInput}
                  placeholder="Also block web sites, comma separated (e.g. youtube.com, instagram.com)"
                  placeholderTextColor={Palette.outline}
                  className="bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body text-body-md text-on-surface"
                />

                {beastAvailable && installedApps.length > 0 && (
                  <View className="gap-xs">
                    <AppText variant="labelSm" color="on-surface-variant">
                      Block these apps ({blockedApps.length} selected):
                    </AppText>
                    <ScrollView
                      style={{ maxHeight: 240 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      className="gap-sm bg-surface-container-low rounded-[14px] p-sm">
                      <View className="gap-xs">
                        {installedApps.map((app) => {
                          const selected = blockedApps.includes(app.package);
                          return (
                            <Pressable
                              key={app.package}
                              onPress={() => toggleBlockedApp(app.package)}
                              className={cn(
                                'flex-row items-center justify-between rounded-[12px] px-md py-sm border active:opacity-85',
                                selected
                                  ? 'border-primary bg-error-container'
                                  : 'border-outline-variant bg-surface-container-lowest',
                              )}>
                              <AppText variant="bodyMd" numberOfLines={1} className="flex-1 pr-sm">
                                {app.name}
                              </AppText>
                              <AppText variant="labelSm" color={selected ? 'error' : 'on-surface-variant'}>
                                {selected ? 'Blocking' : 'Off'}
                              </AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <Pressable
                  onPress={startBeast}
                  disabled={guardBusy}
                  className="bg-error rounded-full px-lg py-sm items-center active:opacity-85 disabled:opacity-40">
                  <AppText variant="labelLg" color="on-error">
                    {guardBusy ? 'Starting…' : 'Start Beast Mode'}
                  </AppText>
                </Pressable>
              </View>
            )}
          </ToolShell>
        )}
      </ScrollView>
    </View>
  );
}
