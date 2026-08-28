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
        'line-card': '#DFE2E7',
        'line-light': '#EBEDF0',
        'line-lighter': '#F2F3F5',

        // Text greys between `foreground` and `muted-foreground`.
        faint: '#9AA0A8',
        'faint-2': '#8A9099',
        dark2: '#3A3F47',

        // Primary shades beyond the base token.
        'primary-dark': '#123A69',
        'primary-tint': 'rgba(23,69,126,0.1)',
        'primary-tintline': '#A9C0DC',

        // Status tints, none of which gluestack names.
        green: '#2E7D4F',
        'green-bg': 'rgba(46,125,79,0.12)',
        'green-line': '#B7DBC4',
        amber: '#8A5A00',
        'amber-bg': 'rgba(180,120,0,0.1)',
        'amber-line': '#E6D3A3',
        danger: '#C8322B',
        'danger-bg': '#FDF2F1',
        'danger-line': '#F1D6D3',
        'danger-line2': '#E4C9C7',

        // Surfaces.
        thead: '#FBFBFC',
        toast: '#16181C',
      },
    },
  },
  plugins: [],
};
