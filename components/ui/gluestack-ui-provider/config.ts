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
 * This file supplies the *values* only. Each of these names also has to be
 * declared as a colour in `tailwind.config.js` (as
 * `rgb(var(--token) / <alpha-value>)`) or the class does not exist: Tailwind
 * emits nothing for a name it does not know, NativeWind has nothing to apply,
 * and the component paints no background at all. That is exactly how the
 * dialogs and the tables ended up see-through.
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
  /** primary #007CB9 */
  primary: '0 124 185',
  /** text on primary */
  primaryForeground: '255 255 255',
  /** card #fff */
  card: '255 255 255',
  /** page background #F1F8FD */
  background: '241 248 253',
  /** text #0E2433 */
  foreground: '14 36 51',
  /** subtle fill #E9F2F9 */
  subtle: '233 242 249',
  /** dark2 #2E4557 — text on a subtle fill */
  subtleForeground: '46 69 87',
  /** muted3 #5A7387 — secondary text */
  mutedForeground: '90 115 135',
  /** border #C7DBEA */
  border: '199 219 234',
  /** borderLighter #EDF5FB */
  accent: '237 245 251',
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
