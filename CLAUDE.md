# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`README.md` is accurate and detailed on setup, the API server, sessions, the Bluetooth printer, and the file tree — read it rather than rediscovering that here. This file covers what only shows up after reading several files at once.

## Commands

- `npm start` — Metro dev server, then pick a platform.
- `npm run android` / `npm run ios` — **native builds** (`expo run:*`), not `expo start --platform`. The app needs a dev build: `react-native-bluetooth-classic` and `expo-secure-store` are native modules, and in Expo Go the printer reports itself unavailable and sessions silently fall back to memory-only.
- `npm run web` — `expo start --web`.
- `npm run lint` — `expo lint`. Baseline is **0 errors, 18 warnings**, all pre-existing `import/no-duplicates` and unused-var warnings inside `components/ui/*` (vendored gluestack). Treat any warning outside those files as yours.
- `npx tsc --noEmit` — not a package script, but the only real check on a repo with no tests. Run it before claiming a change works.
- `npx expo export --platform android` — the closest thing to a build test. Recent bundles are ~5.4 MB; a sudden jump means a dependency got pulled in.
- `npx openapi-typescript contracts/openapi.yaml -o types/api.ts` — after any contract change.
- `npx expo prebuild --platform android` — after touching `app.json` plugins. A JS reload is not enough.

No test runner is configured. `npm run reset-project` moves `app/` aside and leaves a blank one — it is a leftover from the `create-expo-app` starter. Never run it.

## The contract is the source of truth

`contracts/openapi.yaml` describes a backend this repo does not own, and `types/api.ts` is generated from it. **Check the contract before designing anything that depends on a filter, a sort, or a field.** Several plausible-sounding features are not buildable and the gaps are not obvious from the screens:

- `GET /product` accepts only `page`, `size`, `search`, `is_aktif`. No sort parameter, and the list payload carries no stock at all — fetching stock per row is the N+1 the contract explicitly warns against.
- There is no `DELETE /product`. The only removal is `PATCH { is_aktif: false }`, which is why archiving is treated as reversible everywhere.
- "Low stock" is a **separate endpoint**, `GET /product/stok-minimum`, pre-sorted worst-first — not a filter on the product list.
- Paging is offset-based (`page`/`size`) with no cursor anywhere, so appending pages must de-duplicate by id.

When the contract cannot serve something, say so rather than faking it client-side.

## Auth, session, and permissions

Three layers that only make sense together:

1. `services/session.ts` holds the one signed-in session. A session has a token **and** an `active` context (the chosen grant). `hasActiveContext()` is the type guard that narrows to `ActiveSession`.
2. `hooks/use-require-session.ts` guards a screen on **active context, not merely a token** — a session that has not picked a grant is answered `role tidak mencukupi` by every role-guarded endpoint. `app/(admin)/_layout.tsx` applies it once for all back-office screens, which also covers deep links.
3. `services/permissions.ts` — `useCanWrite(area)` / `useActiveRole()`. Roles are exactly `SUPERADMIN | INVENTARIS | CASHIER`; writes are split by **who owns the data**, not seniority. There is no `ADMIN` or `STAFF` in the contract.

`services/client.ts` single-flights token renewal because refresh tokens are rotated and deleted on first use — two concurrent requests must not spend the same one. Do not add a second refresh path.

## Screen architecture

- `app/(admin)/_layout.tsx` uses `Slot`, not a `Stack`, so switching back-office screens is an instant content swap and `AppShell`'s sidebar state survives. Do not turn it into a navigator.
- `app/kasir.tsx` is standalone: its own palette (`const K`), its own landscape lock, no `AppShell`. It also shadows RN's `Text` with a wrapper applying a size-derived `maxFontSizeMultiplier` — dense POS chrome cannot absorb a blanket 1.4× cap, so the cap goes *down* as the text gets bigger. Keep using that local `Text`.
- `app/index.tsx` is the login and role picker, and drives its own fluid sizing via a local `useFluid()` (a CSS `clamp()` equivalent).

## Responsive rules

`hooks/use-breakpoint.ts` is the only place layout width is classified: `phone` / `tablet` / `large` at 600 and 905 (Material window size classes). Decide on **width, never orientation** — `height >= width` reads a portrait tablet as a phone. Use `atLeast(bp, 'tablet')`, and keep the breakpoint a string so it is safe in a dependency array.

The `AppShell` sidebar is an overlay drawer, not a fixed rail, so a screen gets the full window width minus 18pt padding either side. A phone in portrait has ~354pt — which is why fixed-width table columns do not fit.

Prefer `minHeight` over `height` on anything wrapping text, so a raised system font size cannot clip it.

## Migration in progress — three overlapping conversions

The repo is mid-flight on all three at once. Check which state a screen is in before editing it.

**1. StyleSheet → gluestack + NativeWind.** `components/ui/*` is vendored gluestack; `components/shell/ui.tsx` holds the shared building blocks styled with NativeWind classes from `tailwind.config.js`. Only `unit-kerja-ruang.tsx` is fully converted (via the shared components); the other eight still carry a local `StyleSheet.create`. `cx` is exported from `ui.tsx` for the repeated page chrome but **has no consumer yet** — it is scaffolding for the remaining conversions, not an established pattern.

Colours resolve at build time, so a runtime-computed hex has to fall back to inline styles and drifts off the palette. Pass a `className` the caller picks instead. `constants/theme-erp.ts`, `tailwind.config.js`, and `components/ui/gluestack-ui-provider/config.ts` hold the same palette three times — keep them in step.

**2. `DataTable` → `RecordList`.** `components/shell/record-list.tsx` is the responsive replacement: one row layout that stacks fields on a phone and ranges them right on a tablet, never scrolling horizontally. Actions are gestures — tap opens, swipe-left runs `quick` actions, long-press starts multi-select, the ⋮ menu holds everything. Actions marked `danger` are excluded from swipe by design; anything reversible runs immediately and offers `UndoBar` instead of a confirmation. Per-row actions live on the `RecordItem` so the array stays referentially stable for the row's `memo`.

Only `produk.tsx` uses it. Seven screens still call `DataTable` (which stays in `ui.tsx` for them).

**3. Paging buttons → infinite scroll.** The API stays paginated; the UI does not. `produk.tsx` is the reference: `PAGE_SIZE` 20, `onEndReached` guarded by an in-flight flag (it fires repeatedly — the threshold is not a guard), a failed page halting the loop behind a "Coba lagi" button rather than a spinner that never ends, and scroll offset parked in a ref so returning from a detail view does not snap to the top.

**Convention for all three:** convert one screen fully as the reference before rolling out, and translate each screen from its own values rather than forcing a shared set — the nine screens genuinely disagree on padding and font sizes, and flattening them silently redesigns things.

## Language

UI copy and commit messages are Indonesian. Code comments are English and explain *why*, at length, especially where a choice looks arbitrary — match that density rather than writing terse comments.
