import { Slot } from 'expo-router';

import { AdminShellProvider } from '@/components/shell/AppShell';
import { useRequireSession } from '@/hooks/use-require-session';

// Persistent shell for every back-office screen (Produk, Pelanggan, ...):
// the sidebar/header chrome mounts once here and survives navigation between
// them. Using `Slot` (no Stack navigator) means switching screens is an
// instant content swap, not a page-transition push/pop — no slide animation,
// no shell remount, no lost sidebar-collapse state.
//
// Guarding here rather than per screen covers deep links into any of them.
export default function AdminLayout() {
  const allowed = useRequireSession();
  if (!allowed) return null;

  return (
    <AdminShellProvider>
      <Slot />
    </AdminShellProvider>
  );
}
