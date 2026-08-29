import { Stack } from 'expo-router';

import { AdminShellProvider } from '@/components/shell/AppShell';
import { useRequireSession } from '@/hooks/use-require-session';

/**
 * Depth inside a section: a detail or a form pushed on top of its list.
 *
 * These are the only routes that animate. A section is a place, and moving
 * between two places through the sidebar should feel like a swap, not a
 * journey — so the default below is `none` and only the pushed screens slide.
 */
const DEPTH = { animation: 'slide_from_right' } as const;

// Persistent shell for every back-office screen (Produk, Pelanggan, ...): the
// sidebar/header chrome mounts once here, *above* the navigator, so it survives
// every navigation below it — the sidebar's open/closed state and the safe-area
// padding are unaffected by anything the Stack does.
//
// The navigator is what buys back the depth each screen used to fake with a
// `view` state: a pushed detail leaves its list mounted underneath (scroll
// position and appended pages intact), the Android back button pops it instead
// of leaving the section, and every record gets a URL that can be deep linked.
//
// Guarding here rather than per screen covers deep links into any of them,
// nested routes included.
export default function AdminLayout() {
  const allowed = useRequireSession();
  if (!allowed) return null;

  return (
    <AdminShellProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        {/* Only the depth routes are named here. Everything else — the nine
            section roots — takes the defaults above and is picked up from the
            file tree without an entry. */}
        <Stack.Screen name="produk/[id]" options={DEPTH} />
        <Stack.Screen name="produk/baru" options={DEPTH} />
        <Stack.Screen name="pelanggan/[id]" options={DEPTH} />
        <Stack.Screen name="pelanggan/baru" options={DEPTH} />
        <Stack.Screen name="supplier/[id]" options={DEPTH} />
        <Stack.Screen name="supplier/baru" options={DEPTH} />
        <Stack.Screen name="pembelian/[id]" options={DEPTH} />
        <Stack.Screen name="pembelian/baru" options={DEPTH} />
        <Stack.Screen name="penjualan/[id]" options={DEPTH} />
        <Stack.Screen name="penjualan/baru" options={DEPTH} />
        <Stack.Screen name="mutasi-pemakaian/[id]" options={DEPTH} />
        <Stack.Screen name="mutasi-pemakaian/baru" options={DEPTH} />
        <Stack.Screen name="stok-opname/[id]" options={DEPTH} />
        <Stack.Screen name="stok-opname/baru" options={DEPTH} />
      </Stack>
    </AdminShellProvider>
  );
}
