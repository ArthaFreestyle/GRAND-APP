# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

GRAND-APP is an Expo Router (SDK 54) universal app targeting iOS, Android, and web, currently at the default `create-expo-app` tabs template (unmodified starter content in `app/`, `components/`, `constants/`, `hooks/`).

Stack: Expo 54, React 19, React Native 0.81.5, expo-router 6, TypeScript (strict), New Architecture enabled, React Compiler enabled, typed routes enabled (`app.json` → `experiments`).

## Commands

- `npm start` — start the Expo dev server (Metro), then choose a platform from the CLI output.
- `npm run android` / `npm run ios` / `npm run web` — start the dev server targeting a specific platform.
- `npm run lint` — run ESLint via `expo lint` (flat config: `eslint-config-expo`).
- `npm run reset-project` — moves the current starter `app/` content to `app-example/` and creates a blank `app/`, via `scripts/reset-project.js`. Only run this if explicitly asked to strip the starter template.

There is no test runner or build script configured in `package.json`.

## Architecture

- **Routing**: file-based via `expo-router`, rooted at `app/`. `app/_layout.tsx` is the root `Stack` (wraps everything in React Navigation's `ThemeProvider`, switching between `DefaultTheme`/`DarkTheme` based on `useColorScheme`). `app/(tabs)/_layout.tsx` defines the tab navigator; each file in `app/(tabs)/` is a tab screen. `app/modal.tsx` is pushed as a modal `Stack.Screen` from root layout, not part of the tab group.
- **Path alias**: `@/*` maps to the repo root (`tsconfig.json`), e.g. `@/components/themed-text`, `@/hooks/use-color-scheme`.
- **Theming**: `constants/theme.ts` defines the `Colors` palette (light/dark) and platform-specific `Fonts`. `hooks/use-color-scheme.ts` (native) / `.web.ts` (web) resolve the active scheme; `hooks/use-theme-color.ts` resolves a themed color for a component. `components/themed-text.tsx` and `components/themed-view.tsx` are the theme-aware primitives most UI should build on instead of raw RN `Text`/`View`.
- **Platform-specific files**: the `.ios.tsx` / `.web.ts` suffix pattern (see `components/ui/icon-symbol.ios.tsx` vs `icon-symbol.tsx`, `hooks/use-color-scheme.web.ts`) is resolved automatically by Metro's platform extension resolution — keep using this convention when a component needs a different implementation per platform rather than branching on `Platform.OS` inline.
- **New Architecture**: `newArchEnabled: true` in `app.json` — avoid libraries or patterns that only support the legacy RN architecture.
