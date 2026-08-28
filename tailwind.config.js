/**
 * The design palette is the one in constants/theme-erp.ts, ported from the
 * Claude Design mockups. It is mirrored here rather than replaced by Gluestack's
 * defaults: the screens are a deliberate port, and letting a component library
 * pick the colours would quietly redesign them.
 *
 * Keep the two in sync. `Colors` stays exported for the places that still need
 * a runtime value (chart tints, inline `style` on animated views); everything
 * that can express itself as a class should use the class.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#EDEFF2',
        card: '#ffffff',
        ink: '#16181C',
        line: {
          DEFAULT: '#D6DAE0',
          card: '#DFE2E7',
          light: '#EBEDF0',
          lighter: '#F2F3F5',
        },
        muted: {
          DEFAULT: '#9AA0A8',
          2: '#8A9099',
          3: '#6B7280',
        },
        dark2: '#3A3F47',
        primary: {
          DEFAULT: '#17457E',
          dark: '#123A69',
          tint: 'rgba(23,69,126,0.1)',
          tintline: '#A9C0DC',
        },
        badge: '#F1F3F6',
        green: {
          DEFAULT: '#2E7D4F',
          bg: 'rgba(46,125,79,0.12)',
          line: '#B7DBC4',
        },
        amber: {
          DEFAULT: '#8A5A00',
          bg: 'rgba(180,120,0,0.1)',
          line: '#E6D3A3',
        },
        red: {
          DEFAULT: '#C8322B',
          bg: '#FDF2F1',
          line: '#F1D6D3',
          line2: '#E4C9C7',
        },
        thead: '#FBFBFC',
        toast: '#16181C',
      },
    },
  },
  plugins: [],
};
