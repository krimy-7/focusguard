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
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { api, type ContextDetect, type FocusContext, type Mode } from '@/lib/api';
import { Palette } from '@/theme';
import { cn } from '@/theme/tailwind';

export default function ContextsScreen() {
  const insets = useSafeAreaInsets();
  const { contentStyle } = useDashboardLayout();

  const [contexts, setContexts] = useState<FocusContext[]>([]);
  const [proposal, setProposal] = useState<ContextDetect | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [selectedMode, setSelectedMode] = useState<Mode>('work');
  const [detecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const detectSignals = async (): Promise<ContextDetect | null> => {
    // Derive the signal from the most recent real session (logged by the
    // desktop extension) so the mobile app reflects what is actually running.
    const sessions = await api.getSessions();
    const latest = sessions[0];
    if (!latest) return null;
    const recentDomains = Array.from(
      new Set(sessions.map((s) => s.url || s.app_name).filter(Boolean)),
    ).slice(0, 5);
    return api.detectContext(
      { title: latest.task_title || 'Active session', domain: latest.url || latest.app_name },
      recentDomains,
    );
  };

  const load = useCallback(async () => {
    try {
      // Detection is a nice-to-have; if it fails, just show no proposal.
      const [cs, det] = await Promise.all([api.getContexts(), detectSignals().catch(() => null)]);
      setContexts(cs);
      setProposal(det);
      setEditingTitle(det?.proposed_title ?? '');
      setSelectedMode(det?.mode ?? 'work');
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const write = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      load();
    } catch {
      setActionError("Can't reach FocusGuard right now. Nothing was saved.");
    }
  };

  const confirm = () =>
    write(async () => {
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
    });

  const dismiss = () => setProposal(null);

  const activate = (ctx: FocusContext) => write(() => api.setActiveContext(ctx.id));

  const groupLastActivity = (ctx: FocusContext) =>
    write(async () => {
      const last = ctx.activities[0];
      if (!last) return;
      await api.groupActivity(ctx.id, { kind: last.kind, label: last.label, domain: last.domain });
    });

  const activeContext = contexts.find((c) => c.active) ?? null;

  return (
    <View className="flex-1 bg-background">
      <TopAppBar />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ ...contentStyle, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Palette.primary} />}
        showsVerticalScrollIndicator={false}>
        <AppText variant="headlineXl">Contexts</AppText>
        <AppText variant="bodyMd" color="on-surface-variant">
          FocusGuard groups your tabs and apps into contexts — so switching between Figma, fonts and
          Photoshop stays one job.
        </AppText>

        {actionError ? (
          <AppText variant="labelSm" color="error">
            {actionError}
          </AppText>
        ) : null}

        {/* Pending detection */}
        {detecting && (
          <View className="items-center py-md">
            <ActivityIndicator color={Palette.primary} />
          </View>
        )}

        {proposal && !detecting ? (
          <Card className="p-lg gap-md border-2 border-primary">
            <View className="flex-row items-center gap-sm">
              <View className="w-9 h-9 rounded-full bg-primary items-center justify-center">
                <Icon name="auto-fix" size={18} color={Palette.onPrimary} />
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
                <View className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </View>
            <View className="flex-row items-center gap-sm">
              <AppText variant="headlineMd" color="on-primary-container" className="flex-1">
                {activeContext.title}
              </AppText>
              <ModePill mode={activeContext.mode} />
            </View>
            <View className="flex-row flex-wrap gap-xs">
              {activeContext.activities.slice(0, 6).map((a) => (
                <View key={a.id} className="px-sm py-xs rounded-full bg-primary/10">
                  <AppText variant="labelSm" color="on-primary-container">
                    {a.label}
                  </AppText>
                </View>
              ))}
            </View>
            <View className="flex-row gap-sm pt-sm">
              {activeContext.activities.length > 0 ? (
                <Pressable onPress={() => groupLastActivity(activeContext)} className="flex-row items-center gap-xs px-md py-xs rounded-full bg-primary/10 active:opacity-85">
                  <Icon name="plus" size={16} color={Palette.onPrimaryContainer} />
                  <AppText variant="labelSm" color="on-primary-container">
                    Group last activity
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Context list */}
        {loadError ? (
          <EmptyState title="Can't reach FocusGuard right now" subtitle="Check that the backend is running, then pull to refresh." />
        ) : contexts.length ? (
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
                    isActive ? 'border-primary bg-primary-container/30' : 'border-outline-variant/40 bg-surface-container-lowest',
                  )}>
                  <View
                    className={cn(
                      'w-10 h-10 rounded-[14px] items-center justify-center',
                      isActive ? 'bg-primary' : 'bg-surface-container-high',
                    )}>
                    <Icon name={isActive ? 'check-circle' : 'shape-outline'} color={isActive ? Palette.onPrimary : Palette.onSurfaceVariant} />
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
