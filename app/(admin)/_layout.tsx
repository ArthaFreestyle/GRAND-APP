import { Slot } from 'expo-router';

import { AdminShellProvider } from '@/components/shell/AppShell';

// Persistent shell for every back-office screen (Produk, Pelanggan, ...):
// the sidebar/header chrome mounts once here and survives navigation between
// them. Using `Slot` (no Stack navigator) means switching screens is an
// instant content swap, not a page-transition push/pop — no slide animation,
// no shell remount, no lost sidebar-collapse state.
export default function AdminLayout() {
  return (
    <AdminShellProvider>
      <Slot />
    </AdminShellProvider>
  );
}
