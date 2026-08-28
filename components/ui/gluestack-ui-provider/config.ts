import { vars } from 'nativewind';

/**
 * gluestack's semantic tokens, pointed at the GRAND-ERP palette.
 *
 * This is the seam where the component library adopts the ported design rather
 * than the other way round. Every gluestack component styles itself from these
 * names — `bg-primary`, `border-border`, `text-muted-foreground` — so setting
 * them here makes `<Button>` come out the right blue without a single override
 * at the call site.
 *
 * Values are space-separated `R G B` because NativeWind wraps them in
 * `rgb(var(--token) / <alpha>)`, which is what makes `bg-primary/70` work.
 * A hex here would break every opacity modifier.
 *
 * The source of truth for the colours is `constants/theme-erp.ts`; the extra
 * shades that have no semantic equivalent here (green, amber, the border
 * ladder) live in `tailwind.config.js` instead. Keep the three in step.
 *
 * Only a light theme is filled in: the back-office screens are a light-mode
 * design port, and the provider is mounted with `mode="light"`. The dark block
 * mirrors it so a stray `dark:` class cannot produce an unreadable pairing.
 */
const palette = {
  /** primary #17457E */
  primary: '23 69 126',
  /** text on primary */
  primaryForeground: '255 255 255',
  /** card #fff */
  card: '255 255 255',
  /** page background #EDEFF2 */
  background: '237 239 242',
  /** text #16181C */
  foreground: '22 24 28',
  /** badge / subtle fill #F1F3F6 */
  subtle: '241 243 246',
  /** dark2 #3A3F47 — text on a subtle fill */
  subtleForeground: '58 63 71',
  /** muted3 #6B7280 — secondary text */
  mutedForeground: '107 114 128',
  /** border #D6DAE0 */
  border: '214 218 224',
  /** borderLighter #F2F3F5 */
  accent: '242 243 245',
  /** red #C8322B */
  destructive: '200 50 43',
};

export const colors = {
  light: {
    '--primary': palette.primary,
    '--primary-foreground': palette.primaryForeground,
    '--card': palette.card,
    '--secondary': palette.subtle,
    '--secondary-foreground': palette.subtleForeground,
    '--background': palette.background,
    '--popover': palette.card,
    '--popover-foreground': palette.foreground,
    '--muted': palette.subtle,
    '--muted-foreground': palette.mutedForeground,
    '--destructive': palette.destructive,
    '--foreground': palette.foreground,
    '--border': palette.border,
    '--input': palette.border,
    '--ring': palette.primary,
    '--accent': palette.accent,
    '--accent-foreground': palette.subtleForeground,
  },
  dark: {
    '--primary': palette.primary,
    '--primary-foreground': palette.primaryForeground,
    '--card': palette.card,
    '--secondary': palette.subtle,
    '--secondary-foreground': palette.subtleForeground,
    '--background': palette.background,
    '--popover': palette.card,
    '--popover-foreground': palette.foreground,
    '--muted': palette.subtle,
    '--muted-foreground': palette.mutedForeground,
    '--destructive': palette.destructive,
    '--foreground': palette.foreground,
    '--border': palette.border,
    '--input': palette.border,
    '--ring': palette.primary,
    '--accent': palette.accent,
    '--accent-foreground': palette.subtleForeground,
  },
};

// Config for nativewind vars() - used by provider
export const config = {
  light: vars(colors.light),
  dark: vars(colors.dark),
};
