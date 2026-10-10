import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { MAX_TITLE } from '@/lib/lines';
import type { Goal } from '@/lib/types';
import { useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

/** One goal in the user's own hand (Kalam). Check it off, tap the words to edit, remove it (with undo upstream). */
export function GoalRow({ goal, onToggle, onRename, onDelete }: { goal: Goal; onToggle: () => void; onRename: (title: string) => void; onDelete: () => void }) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.title);
  const done = goal.status === 'done';

  // Only onBlur commits (single-line submit blurs), so one edit = one PATCH.
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== goal.title && next.length <= MAX_TITLE) onRename(next);
    else setDraft(goal.title);
  };

  return (
    <View role="listitem" className="flex-row items-center gap-1" style={{ minHeight: 60, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <Pressable
        role="checkbox"
        aria-checked={done}
        accessibilityLabel={`${goal.title}: mark ${done ? 'not done' : 'done'}`}
        onPress={onToggle}
        style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, webStyle({ cursor: 'pointer' })]}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: done ? t.moss : t.ink,
            backgroundColor: done ? t.moss : t.field,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {done ? <Icon name="check" size={16} color={t.onMoss} /> : null}
        </View>
      </Pressable>

      {editing ? (
        <Field hand value={draft} onChangeText={setDraft} onBlur={commit} autoFocus maxLength={MAX_TITLE} returnKeyType="done" accessibilityLabel="Goal title" style={{ flex: 1, marginRight: 4 }} />
      ) : (
        <Pressable
          role="button"
          accessibilityLabel={`Edit goal: ${goal.title}`}
          onPress={() => {
            setDraft(goal.title);
            setEditing(true);
          }}
          style={[{ flex: 1, minHeight: 44, justifyContent: 'center', paddingLeft: 8 }, webStyle({ cursor: 'text' })]}>
          <AppText
            variant="hand"
            tone={done ? 'ink2' : 'ink'}
            style={[done ? { textDecorationLine: 'line-through', textDecorationColor: t.moss } : null, webStyle({ textDecorationThickness: '2px' })]}>
            {goal.title}
          </AppText>
        </Pressable>
      )}

      <Pressable
        role="button"
        accessibilityLabel={`Delete goal: ${goal.title}`}
        onPress={onDelete}
        style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, webStyle({ cursor: 'pointer' })]}>
        <Icon name="close" size={18} color={t.ink2} />
      </Pressable>
    </View>
  );
}
