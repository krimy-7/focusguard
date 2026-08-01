import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { MODES, ModePill } from '@/components/mode-pill';
import { TopAppBar } from '@/components/top-app-bar';
import { api, type ContextDetect, type FocusContext, type Mode } from '@/lib/api';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

export default function ContextsScreen() {
  const insets = useSafeAreaInsets();

  const [contexts, setContexts] = useState<FocusContext[]>([]);
  const [proposal, setProposal] = useState<ContextDetect | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [selectedMode, setSelectedMode] = useState<Mode>('work');
  const [detecting, setDetecting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cs, det] = await Promise.all([api.getContexts(), detectSignals()]);
    setContexts(cs);
    setProposal(det);
    setEditingTitle(det?.proposed_title ?? '');
    setSelectedMode(det?.mode ?? 'work');
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const detectSignals = async (): Promise<ContextDetect | null> => {
    // Use the last-known desktop signals as a hint; the extension pushes
    // richer signals. Backend falls back to mock proposals when offline.
    return api.detectContext({ title: 'Figma', domain: 'figma.com' }, ['figma.com', 'fonts.google.com']);
  };

  const confirm = async () => {
    if (!proposal || !editingTitle.trim()) return;
    const title = editingTitle.trim();
    const existing = contexts.find((c) => c.title.toLowerCase() === title.toLowerCase());
    if (existing) {
      await api.confirmContext(existing.id, title, selectedMode);
    } else {
      const created = await api.createContext(title, selectedMode, 'detected');
      await api.setActiveContext(created.id);
    }
    setProposal(null);
    load();
  };

  const dismiss = () => setProposal(null);

  const activate = async (ctx: FocusContext) => {
    await api.setActiveContext(ctx.id);
    load();
  };

  const groupLastActivity = async (ctx: FocusContext) => {
    const last = ctx.activities[0];
    await api.groupActivity(ctx.id, {
      kind: last?.kind ?? 'tab',
      label: last?.label ?? 'figma.com',
      domain: last?.domain ?? 'figma.com',
    });
    load();
  };

  const activeContext = contexts.find((c) => c.active) ?? null;

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, gap: 20, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineXl">Contexts</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          FocusGuard groups your tabs and apps into contexts — so switching between Figma, fonts and
          Photoshop stays one job.
        </AppText>

        {/* Pending detection */}
        {detecting && (
          <View className="items-center py-md">
            <ActivityIndicator color={Palette.primary} />
          </View>
        )}

        {proposal && !detecting ? (
          <Card className="p-lg gap-md border-2 border-primary-container">
            <View className="flex-row items-center gap-sm">
              <View className="w-9 h-9 rounded-full bg-primary-container items-center justify-center">
                <Icon name="auto-fix" size={18} color="#ffffff" />
              </View>
              <View>
                <AppText variant="labelLg" color="primary">
                  New context detected
                </AppText>
                <AppText variant="labelSm" color="on-surface-variant">
                  {Math.round((proposal.confidence ?? 0.7) * 100)}% confident
                </AppText>
              </View>
            </View>

            <TextInput
              value={editingTitle}
              onChangeText={setEditingTitle}
              placeholder="Context title"
              placeholderTextColor={Palette.outline}
              className="bg-surface-container-lowest border border-outline-variant rounded-[14px] px-md py-sm font-body-bold text-headline-md text-on-surface"
            />

            <View className="flex-row gap-sm">
              {MODES.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setSelectedMode(mode)}
                  className={cn(
                    'px-md py-xs rounded-full border',
                    selectedMode === mode ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-container-low',
                  )}>
                  <AppText variant="labelSm" color={selectedMode === mode ? 'primary' : 'on-surface-variant'}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <View className="flex-row gap-sm justify-end">
              <Pressable onPress={dismiss} className="px-lg py-sm rounded-full border border-outline-variant active:opacity-85">
                <AppText variant="labelLg">Cancel</AppText>
              </Pressable>
              <Pressable onPress={confirm} className="px-lg py-sm rounded-full bg-primary active:opacity-85">
                <AppText variant="labelLg" color="on-primary">
                  Okay
                </AppText>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* Active context */}
        {activeContext && !proposal ? (
          <Card surface="primary-container" radius={24} className="p-lg gap-sm">
            <View className="flex-row items-center justify-between">
              <AppText variant="labelSm" color="on-primary-container" className="uppercase tracking-[1.5px]">
                Active now
              </AppText>
              <View className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            </View>
            <View className="flex-row items-center gap-sm">
              <AppText variant="headlineMd" color="on-primary-container" className="flex-1">
                {activeContext.title}
              </AppText>
              <ModePill mode={activeContext.mode} />
            </View>
            <View className="flex-row flex-wrap gap-xs">
              {activeContext.activities.slice(0, 6).map((a) => (
                <View key={a.id} className="px-sm py-xs rounded-full bg-white/20">
                  <AppText variant="labelSm" color="on-primary-container">
                    {a.label}
                  </AppText>
                </View>
              ))}
            </View>
            <View className="flex-row gap-sm pt-sm">
              <Pressable onPress={() => groupLastActivity(activeContext)} className="flex-row items-center gap-xs px-md py-xs rounded-full bg-white/20 active:opacity-85">
                <Icon name="plus" size={16} color={Palette.onPrimaryContainer} />
                <AppText variant="labelSm" color="on-primary-container">
                  Group last activity
                </AppText>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* Context list */}
        {contexts.length ? (
          <View className="gap-sm">
            <AppText variant="labelLg">All contexts</AppText>
            {contexts.map((ctx) => {
              const isActive = ctx.id === activeContext?.id;
              return (
                <Pressable
                  key={ctx.id}
                  onPress={() => (isActive ? null : activate(ctx))}
                  className={cn(
                    'flex-row items-center gap-md p-md rounded-[18px] border',
                    isActive ? 'border-secondary bg-secondary-container/15' : 'border-outline-variant/40 bg-surface-container-lowest',
                  )}>
                  <View
                    className={cn(
                      'w-10 h-10 rounded-[14px] items-center justify-center',
                      isActive ? 'bg-secondary' : 'bg-surface-container-high',
                    )}>
                    <Icon name={isActive ? 'check-circle' : 'shape-outline'} color={isActive ? Palette.onSecondary : Palette.onSurfaceVariant} />
                  </View>
                  <View className="flex-1">
                    <AppText variant="bodyLg" className={cn(isActive && 'font-body-bold')}>
                      {ctx.title}
                    </AppText>
                    <AppText variant="labelSm" color="on-surface-variant">
                      {ctx.activities.length} grouped activities · {ctx.source}
                    </AppText>
                  </View>
                  <ModePill mode={ctx.mode} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No contexts yet" subtitle="Open your laptop and FocusGuard will suggest one automatically." />
        )}
      </ScrollView>
    </View>
  );
}
