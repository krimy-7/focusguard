const PALETTE_NAMES = [
  'on-tertiary-fixed-variant',
  'on-background',
  'surface-container-high',
  'on-tertiary-fixed',
  'secondary-fixed',
  'on-tertiary',
  'primary',
  'error',
  'background',
  'tertiary-fixed',
  'on-secondary',
  'inverse-surface',
  'secondary-container',
  'surface-container-low',
  'primary-container',
  'tertiary',
  'surface-variant',
  'error-container',
  'outline-variant',
  'primary-fixed-dim',
  'on-primary-fixed-variant',
  'on-secondary-container',
  'on-surface-variant',
  'on-primary-container',
  'secondary-fixed-dim',
  'on-tertiary-container',
  'surface-bright',
  'inverse-primary',
  'secondary',
  'on-secondary-fixed-variant',
  'on-primary-fixed',
  'primary-fixed',
  'inverse-on-surface',
  'tertiary-fixed-dim',
  'tertiary-container',
  'surface',
  'surface-tint',
  'on-primary',
  'on-error-container',
  'surface-container-lowest',
  'surface-container-highest',
  'surface-dim',
  'surface-container',
  'on-surface',
  'on-error',
  'on-secondary-fixed',
  'outline',
] as const;

export type TwColorName = (typeof PALETTE_NAMES)[number];

export const TEXT_COLORS = Object.fromEntries(
  PALETTE_NAMES.map((name) => [name, `text-${name}`]),
) as Record<TwColorName, string>;

export const BG_COLORS = Object.fromEntries(
  PALETTE_NAMES.map((name) => [name, `bg-${name}`]),
) as Record<TwColorName, string>;

export const BORDER_COLORS = Object.fromEntries(
  PALETTE_NAMES.map((name) => [name, `border-${name}`]),
) as Record<TwColorName, string>;

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
