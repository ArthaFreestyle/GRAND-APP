/**
 * Two layers of colour, and both have to be declared here.
 *
 * 1. **The semantic tokens** — primary, card, background, foreground, border,
 *    muted, destructive — whose *values* live in
 *    `components/ui/gluestack-ui-provider/config.ts` as CSS variables. The
 *    variables alone are not enough: Tailwind still has to be told the class
 *    exists, or `bg-card` compiles to nothing at all and the surface renders
 *    with no background. Each one is declared as
 *    `rgb(var(--token) / <alpha-value>)`, which is what keeps both halves
 *    working — the provider can re-point a token at runtime, and opacity
 *    modifiers like `bg-primary/70` still resolve.
 * 2. **The shades gluestack has no semantic name for** — the border ladder, the
 *    text greys, the status tints — declared here as plain hex.
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
 * **Every value here is opaque.** The tints used to be `rgba(...)` at 10–28%,
 * which is a different colour depending on what happens to be behind it and
 * reads as a bug the moment anything but white is: they are pre-composited
 * against white and written as hex instead. The only translucency left in the
 * app is where it is the point — a modal's scrim and the table's edge fade.
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
        // Themed in the provider; declared here so the classes exist at all.
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        popover: 'rgb(var(--popover) / <alpha-value>)',
        'popover-foreground': 'rgb(var(--popover-foreground) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--primary-foreground) / <alpha-value>)',
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        'secondary-foreground': 'rgb(var(--secondary-foreground) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--accent-foreground) / <alpha-value>)',
        destructive: 'rgb(var(--destructive) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // The border ladder: gluestack only names one `border`.
        'line-card': '#D5E6F2',
        'line-light': '#E4EFF8',
        'line-lighter': '#EDF5FB',

        // Text greys between `foreground` and `muted-foreground`.
        faint: '#93A8B8',
        'faint-2': '#7C93A5',
        dark2: '#2E4557',

        // Primary shades beyond the base token. The tint is #007CB9 at 10% on
        // white, flattened.
        'primary-dark': '#005689',
        'primary-tint': '#E6F2F8',
        'primary-tintline': '#A9D0E7',

        // Status tints, none of which gluestack names. Both `-bg` shades are
        // their status colour on white, flattened the same way.
        green: '#2E7D4F',
        'green-bg': '#E6EFEA',
        'green-line': '#B7DBC4',
        amber: '#8A5A00',
        'amber-bg': '#FDEFD4',
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
