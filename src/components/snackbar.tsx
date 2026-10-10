import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { LIFT, RADIUS, useTheme } from '@/theme';
import { webStyle } from '@/theme/web';

/** Calm undo toast: ink on cream, bottom of the page, announced politely. Never steals focus. */
export function Snackbar({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  const t = useTheme();
  return (
    <View style={{ pointerEvents: 'box-none', position: 'absolute', left: 16, right: 16, bottom: 20, alignItems: 'center' }}>
      <View
        role="status"
        aria-live="polite"
        className="flex-row items-center gap-2"
        style={[{ maxWidth: 420, width: '100%', backgroundColor: t.ink, borderRadius: RADIUS.control, paddingLeft: 16, paddingRight: 4 }, LIFT]}>
        <AppText tone="onInk" style={{ flex: 1 }}>
          {message}
        </AppText>
        <Pressable
          role="button"
          onPress={onAction}
          style={[{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' }, webStyle({ cursor: 'pointer' })]}>
          <AppText variant="label" tone="onInk" style={{ textDecorationLine: 'underline' }}>
            {actionLabel}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
