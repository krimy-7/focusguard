import { TextInput, type TextInputProps } from 'react-native';

import { RADIUS, TYPE, useTheme } from '@/theme';

/** Text input with a 3:1 border (not the hairline), 48px tall. `hand` = the user's own words, in Kalam. */
export function Field({ hand = false, style, ...rest }: TextInputProps & { hand?: boolean }) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.placeholder}
      {...rest}
      style={[
        hand ? TYPE.handField : TYPE.body,
        {
          minHeight: 48,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: 1.5,
          borderColor: t.ink,
          borderRadius: RADIUS.control,
          backgroundColor: t.field,
          color: t.ink,
        },
        style,
      ]}
    />
  );
}
