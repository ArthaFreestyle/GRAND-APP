// Tailwind only. `autoprefixer` is no longer needed from Expo SDK 53 onward —
// the web pipeline handles prefixing itself — and `.mjs` is the config form
// Expo expects from SDK 53+.
export default {
  plugins: {
    tailwindcss: {},
  },
};
