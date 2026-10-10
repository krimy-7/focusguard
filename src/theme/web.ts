import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const isWeb = Platform.OS === 'web';

/** CSS that react-native-web passes through (background-image, text-wrap, cursor...). Ignored on native. */
export const webStyle = (css: Record<string, string | number>): (ViewStyle & TextStyle) | undefined =>
  isWeb ? (css as unknown as ViewStyle & TextStyle) : undefined;

/** Props only react-native-web understands (data-*, href...). Ignored on native. */
export const webProps = <T extends Record<string, unknown>>(p: T): Partial<T> => (isWeb ? p : {});
