/**
 * Only the shades gluestack has no semantic name for.
 *
 * The overlap — primary, card, background, foreground, border, muted,
 * destructive — is themed in `components/ui/gluestack-ui-provider/config.ts`
 * instead, so gluestack's own components come out in the design's colours
 * without an override at every call site. Redefining those names here would
 * shadow the CSS variables they resolve from and break opacity modifiers like
 * `bg-primary/70`.
 *
 * Palette: https://colorhunt.co/palette/005689007cb9f6c667f1f8fd
 *   #005689  pressed fills, emphasis text on light (7.8:1 on white)
 *   #007CB9  the primary fill; white on it is 4.6:1, which clears AA
 *   #F6C667  accent and warning tint only — as text on white it is 1.6:1,
 *            so gold type is `amber` (#8A5A00, 5.9:1) instead
 *   #F1F8FD  the page background
 *
 * The border ladder and the text greys are derived, tinted toward the palette's
 * blue so they belong to it: four colours cannot express a neutral scale. Green
 * and red stay as they were because they carry meaning rather than style —
 * "lunas" and "jatuh tempo" have to be told apart at a glance, and gold cannot
 * stand in for both.
 *
 * The source of truth for the values is `constants/theme-erp.ts`, which stays
 * exported for the handful of places that still need a runtime colour (stepped
 * fades, animated inline styles). Keep the three in step.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // The border ladder: gluestack only names one `border`.
        'line-card': '#D5E6F2',
        'line-light': '#E4EFF8',
        'line-lighter': '#EDF5FB',

        // Text greys between `foreground` and `muted-foreground`.
        faint: '#93A8B8',
        'faint-2': '#7C93A5',
        dark2: '#2E4557',

        // Primary shades beyond the base token.
        'primary-dark': '#005689',
        'primary-tint': 'rgba(0,124,185,0.10)',
        'primary-tintline': '#A9D0E7',

        // Status tints, none of which gluestack names.
        green: '#2E7D4F',
        'green-bg': 'rgba(46,125,79,0.12)',
        'green-line': '#B7DBC4',
        amber: '#8A5A00',
        'amber-bg': 'rgba(246,198,103,0.28)',
        'amber-line': '#F0D69B',
        danger: '#C8322B',
        'danger-bg': '#FDF2F1',
        'danger-line': '#F1D6D3',
        'danger-line2': '#E4C9C7',

        // The palette's gold, for the places that want the accent itself.
        gold: '#F6C667',

        // Surfaces.
        thead: '#F7FBFE',
        toast: '#0E2433',
      },
    },
  },
  plugins: [],
};
