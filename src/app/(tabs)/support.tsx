import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { TopAppBar } from '@/components/top-app-bar';
import { api, type BeastMode } from '@/lib/api';
import { Palette, ScreenContent } from '@/theme';
import { cn } from '@/theme/tailwind';

type Tool = 'timer' | 'meditate' | 'mood' | 'beast';

const TOOLS: { key: Tool; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
  { key: 'timer', label: 'Timer', icon: 'timer-outline' },
  { key: 'meditate', label: 'Meditate', icon: 'meditation' },
  { key: 'mood', label: 'Mood', icon: 'emoticon-happy-outline' },
  { key: 'beast', label: 'Beast Mode', icon: 'fire' },
];

const MOODS = ['😴', '😐', '🙂', '😄', '🔥'];

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    stop();
    setRunning(true);
  }, [stop]);

  const reset = useCallback(
    (seconds: number) => {
      stop();
      setRemaining(seconds);
    },
    [stop],
  );

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stop();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return stop;
  }, [running, stop]);

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
  const [tool, setTool] = useState<Tool>('timer');

  // Pomodoro
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const timer = useCountdown(focusMin * 60);
  const [onBreak, setOnBreak] = useState(false);

  // Meditation
  const [medMin, setMedMin] = useState(5);
  const [ambient, setAmbient] = useState('Lo-fi');
  const med = useCountdown(medMin * 60);

  // Mood
  const [mood, setMood] = useState('');
  const [moodNote, setMoodNote] = useState('');

  // Beast
  const [beast, setBeast] = useState<BeastMode | null>(null);
  const [beastMin, setBeastMin] = useState(60);
  const [blockedInput, setBlockedInput] = useState('');

  useFocusEffect(
    useCallback(() => {
      api.getBeast().then(setBeast);
    }, []),
  );

  const pickFocus = (min: number) => {
    setFocusMin(min);
    timer.reset(min * 60);
    setOnBreak(false);
  };

  const handleStartTimer = () => {
    if (timer.remaining === 0 || onBreak) {
      timer.reset((onBreak ? breakMin : focusMin) * 60);
      setOnBreak(false);
    }
    timer.start();
  };

  const pickMeditate = (min: number) => {
    setMedMin(min);
    med.reset(min * 60);
  };

  const handleStartMeditation = () => {
    if (med.remaining === 0) med.reset(medMin * 60);
    med.start();
  };

  const logMood = async () => {
    if (!mood) return;
    await api.logMood(mood, moodNote);
    setMood('');
    setMoodNote('');
  };

  const startBeast = async () => {
    const sites = blockedInput.split(',').map((s) => s.trim()).filter(Boolean);
    const created = await api.startBeast(beastMin, sites);
    setBeast(created);
  };

  const stopBeast = async () => {
    await api.stopBeast();
    setBeast(null);
  };

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...ScreenContent, gap: 16, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineXl">Support</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          Gentle tools for the moments in between.
        </AppText>

        <View className="flex-row gap-xs">
          {TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTool(t.key)}
              className={cn(
                'flex-1 items-center gap-xs py-sm rounded-full border active:opacity-85',
                tool === t.key ? 'border-primary bg-primary-container' : 'border-outline-variant/50 bg-surface-container-lowest',
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

            <View className="items-center py-md">
              <View className="w-44 h-44 rounded-full border-4 items-center justify-center"
                style={{ borderColor: onBreak ? Palette.secondary : Palette.primary }}>
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
              <Pressable onPress={() => timer.reset((onBreak ? breakMin : focusMin) * 60)} className="px-lg py-sm rounded-full border border-outline-variant active:opacity-85">
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
              <Pressable onPress={() => med.reset(medMin * 60)} className="px-lg py-sm rounded-full border border-outline-variant active:opacity-85">
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
                    Blocking {beast.blocked_sites.length} site{beast.blocked_sites.length === 1 ? '' : 's'} until {beast.ends_at ? new Date(beast.ends_at).toLocaleTimeString() : '…'}
                  </AppText>
                  <AppText variant="bodyMd" color="on-error-container">
                    {beast.blocked_sites.join(', ') || 'No sites listed — staying accountable.'}
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
                  You asked for it. Pick a window and which sites to lock away while you grind.
                </AppText>
                <View className="flex-row gap-sm">
                  {[30, 60, 90].map((m) => (
                    <Chip key={m} label={`${m} min`} selected={beastMin === m} onPress={() => setBeastMin(m)} />
                  ))}
                </View>
                <TextInput
                  value={blockedInput}
                  onChangeText={setBlockedInput}
                  placeholder="Blocked sites, comma separated (e.g. youtube.com, instagram.com)"
                  placeholderTextColor={Palette.outline}
                  className="bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body text-body-md text-on-surface"
                />
                <Pressable onPress={startBeast} className="bg-error rounded-full px-lg py-sm items-center active:opacity-85">
                  <AppText variant="labelLg" color="on-error">
                    Start Beast Mode
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
