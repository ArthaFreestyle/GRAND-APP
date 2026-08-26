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

## Screens

- `app/index.tsx` — role picker + login.
- `app/kasir.tsx` — POS checkout screen (cart, barcode/search, keypad, payment). Locks to landscape while open; shows today's completed transactions from the header menu.
- `app/(admin)/` — back-office screens sharing a persistent floating sidebar shell (`components/shell/AppShell.tsx`): Produk, Pelanggan, Supplier, Pembelian, Penjualan, Mutasi & Pemakaian, Stok Opname, Laporan, Unit Kerja & Ruang.

All screens currently run on **local component state with inline mock data** — none are wired to a backend yet. `contracts/openapi.yaml` is the GRAND-ERP API contract; `types/api.ts` is generated from it (see below) for when screens are wired up for real.

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

### Android native build

`npx expo run:android` needs an Android SDK on your machine with `ANDROID_HOME` (or `android/local.properties` → `sdk.dir`) pointing at it.

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
