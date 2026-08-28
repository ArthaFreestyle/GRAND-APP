# GRAND-APP

GRAND-APP is the frontend for **GRAND-ERP** — a point-of-sale and back-office
management app for a retail/stationery business, covering cashier checkout,
products, customers, suppliers, purchasing, sales, stock mutation, stock
opname, and reporting. Built with [Expo](https://expo.dev) (Expo Router,
universal for Android/iOS/web).

## Stack

- Expo SDK 54, React 19, React Native 0.81
- [Expo Router](https://docs.expo.dev/router/introduction/) v6 (file-based routing), typed routes
- TypeScript (strict), New Architecture, React Compiler enabled
- `react-native-svg` for vector illustrations/icons
- Receipt printing: `react-native-bluetooth-classic` (SPP/RFCOMM transport, config plugin `with-rn-bluetooth-classic`) + `@point-of-sale/receipt-printer-encoder` (ESC/POS bytes) + `base64-js`

## Screens

- `app/index.tsx` — role picker + login.
- `app/kasir.tsx` — POS checkout screen (cart, barcode/search, keypad, payment). Locks to landscape while open; the header menu holds today's completed transactions and the Bluetooth receipt-printer picker.
- `app/(admin)/` — back-office screens sharing a persistent floating sidebar shell (`components/shell/AppShell.tsx`): Produk, Pelanggan, Supplier, Pembelian, Penjualan, Mutasi & Pemakaian, Stok Opname, Laporan, Unit Kerja & Ruang.

All screens currently run on **local component state with inline mock data** — none are wired to a backend yet. The one exception is receipt printing on the Kasir screen, which talks to a real Bluetooth printer (see below). `contracts/openapi.yaml` is the GRAND-ERP API contract; `types/api.ts` is generated from it (see below) for when screens are wired up for real.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the dev server

   ```bash
   npm start
   ```

   Then pick a platform from the CLI output, or target one directly:

   ```bash
   npm run android   # expo run:android (native build)
   npm run ios       # expo run:ios (native build)
   npm run web       # expo start --web
   ```

3. Lint

   ```bash
   npm run lint
   ```

There is no test runner configured yet.

### API server

The login screen talks to a real GRAND-ERP backend. Copy `.env.example` to
`.env.local` and point `EXPO_PUBLIC_API_BASE_URL` at your API; it defaults to
the contract's dev server (`http://127.0.0.1:3000`) when unset. Expo inlines
`EXPO_PUBLIC_*` at build time, so restart the dev server after changing it.

Plain `http://` is accepted in dev builds only — a release build aimed at a
non-HTTPS base URL fails on startup instead of sending credentials in the clear.

On a physical device `127.0.0.1` is the *device's* own loopback, not your
machine — use the LAN IP of the host running the API (or `10.0.2.2` on an
Android emulator).

### Sessions

The signed-in session survives restarts: the access and refresh tokens go to
`expo-secure-store` (Keystore/Keychain), and the non-secret half — user and
grants — to `AsyncStorage`, because SecureStore values are capped near 2 KB on
Android. Both halves are cleared together on logout.

Access tokens expire after ~60 minutes and cannot be revoked, so `services/client.ts`
renews them from the refresh token — before expiry, and once more on a 401.
Refresh tokens are **rotated and deleted on first use**, so renewals are
single-flighted: two concurrent requests must not both spend the same one.

`expo-secure-store` ships native code. After pulling this change, run
`npx expo prebuild --platform android` and rebuild the app — a JS reload is not
enough, and until then the session silently falls back to memory-only.

### Android native build

`npx expo run:android` needs an Android SDK on your machine with `ANDROID_HOME` (or `android/local.properties` → `sdk.dir`) pointing at it.

### Receipt printer

The Kasir screen prints to Bluetooth Classic (SPP) thermal printers. This is a native module, so it only
works in a dev build or a release build — in Expo Go the printer screen reports the module as unavailable.

- Bluetooth permissions come from the `with-rn-bluetooth-classic` config plugin (`app.json`), so run
  `npx expo prebuild --platform android` after changing plugins, then rebuild the app.
- Pair the printer once in Android's Bluetooth settings — the app deliberately does no scanning or
  pairing of its own (pairing cheap printers over the API hangs and their PINs vary), it only lists
  already-bonded devices. The chosen printer is remembered across restarts via AsyncStorage.
- Paper width (58 mm / 80 mm) is chosen in the picker — it sets the encoder's column count. Receipts
  end with a paper feed instead of a cut command, since most 58 mm printers have no auto-cutter.
- USB/OTG printers are not supported; that needs a separate native module.

## Project structure

```
app/
  index.tsx           # login / role picker
  kasir.tsx           # POS Kasir (landscape)
  (admin)/            # back-office screens, persistent shell layout
    _layout.tsx
    produk.tsx
    pelanggan.tsx
    supplier.tsx
    pembelian.tsx
    penjualan.tsx
    mutasi-pemakaian.tsx
    stok-opname.tsx
    laporan.tsx
    unit-kerja-ruang.tsx
components/
  shell/              # AppShell (admin sidebar/header) + shared ui primitives
  produk/             # Produk-screen-specific modals
constants/
  theme-erp.ts        # shared color tokens + rp() currency formatter
  produk.ts           # Produk screen's mock data + types
contracts/
  openapi.yaml        # GRAND-ERP API contract (source of truth for the backend)
services/
  api.ts              # fetch wrapper + { data | errors } envelope unwrapping
  client.ts           # authenticated requests: bearer token + auto-refresh
  produk.ts           # /api/v1/product + /api/v1/satuan, mapped for the screen
  auth.ts             # auth/login, auth/switch-context, auth/refresh, auth/logout
  session.ts          # the one signed-in session + its persistence
  permissions.ts      # what the active grant's role may write
  bluetooth-printer.ts # Bluetooth Classic transport (bonded list/connect/write)
  receipt.ts          # ESC/POS receipt + test-print encoder
types/
  api.ts              # types generated from contracts/openapi.yaml
```

Path alias `@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/components/shell/AppShell`.

## Regenerating API types

```bash
npx openapi-typescript contracts/openapi.yaml -o types/api.ts
```

Run this whenever `contracts/openapi.yaml` changes.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
