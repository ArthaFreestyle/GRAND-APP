import { usePathname, useRouter } from 'expo-router';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors as C } from '@/constants/theme-erp';
import { logout } from '@/services/auth';
import { useSession } from '@/services/session';

export type NavKey =
  | 'produk'
  | 'pelanggan'
  | 'supplier'
  | 'pembelian'
  | 'penjualan'
  | 'mutasi'
  | 'opname'
  | 'laporan'
  | 'unit-ruang';

const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: 'produk', label: 'Produk', href: '/produk' },
  { key: 'pelanggan', label: 'Pelanggan', href: '/pelanggan' },
  { key: 'supplier', label: 'Supplier', href: '/supplier' },
  { key: 'pembelian', label: 'Pembelian', href: '/pembelian' },
  { key: 'penjualan', label: 'Penjualan', href: '/penjualan' },
  { key: 'mutasi', label: 'Mutasi & Pemakaian', href: '/mutasi-pemakaian' },
  { key: 'opname', label: 'Stok Opname', href: '/stok-opname' },
  { key: 'laporan', label: 'Laporan', href: '/laporan' },
  { key: 'unit-ruang', label: 'Unit Kerja & Ruang', href: '/unit-kerja-ruang' },
];

// Placeholder identity for the screens that still gate their own controls on a
// hardcoded role — those are local-state-only and wired to the API separately.
// The sidebar user card below reads the real session instead.
export const CURRENT_USER = 'admin.rina';
export type Role = 'SUPERADMIN' | 'ADMIN' | 'STAFF';
export const ROLE: Role = 'ADMIN';

// ---- shell chrome lives here, mounted once by app/(admin)/_layout.tsx, so it
// survives navigation between admin pages instead of remounting (and
// page-transition-animating) on every sidebar click ----
const AdminNavContext = createContext<{ navShown: boolean; toggleNav: () => void } | null>(null);

function useAdminNav() {
  const ctx = useContext(AdminNavContext);
  if (!ctx) throw new Error('useAdminNav must be used inside AdminShellProvider');
  return ctx;
}

export function AdminShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [navShown, setNavShown] = useState(true);
  const active = NAV_ITEMS.find((n) => n.href === pathname)?.key ?? null;

  const ctxValue = useMemo(() => ({ navShown, toggleNav: () => setNavShown((v) => !v) }), [navShown]);

  return (
    <AdminNavContext.Provider value={ctxValue}>
      <View style={styles.root}>
        <View style={styles.main}>{children}</View>

        {navShown && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setNavShown(false)}
            accessibilityLabel="Tutup menu">
            <View style={styles.backdrop} />
          </Pressable>
        )}

        {navShown && (
          <View style={styles.aside}>
            <View style={styles.asideHead}>
              <Text style={styles.asideHeadText}>Manajemen</Text>
            </View>
            <Pressable onPress={() => router.push('/kasir' as never)} style={styles.kasirBtn}>
              <View style={styles.kasirDot} />
              <View>
                <Text style={styles.kasirTitle}>Buka Kasir</Text>
                <Text style={styles.kasirSub}>Layar penjualan</Text>
              </View>
            </Pressable>
            <ScrollView style={styles.nav} contentContainerStyle={{ gap: 4, paddingBottom: 12 }}>
              {NAV_ITEMS.map((n) => {
                const isActive = n.key === active;
                return (
                  <Pressable
                    key={n.key}
                    onPress={() => {
                      setNavShown(false);
                      if (!isActive) router.replace(n.href as never);
                    }}
                    style={[styles.navItem, isActive && styles.navItemActive]}>
                    <Text style={[styles.navItemText, { color: isActive ? C.primaryDark : C.dark2 }]}>
                      {n.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.asideFoot}>
              <Pressable
                onPress={async () => {
                  // Send the user away first: revoking the refresh token is a
                  // network round trip, and the local session is already gone.
                  router.replace('/');
                  await logout();
                }}
                accessibilityRole="button"
                accessibilityLabel="Keluar"
                style={({ pressed }) => [styles.userCard, pressed && styles.userCardPressed]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {session?.user.username ?? CURRENT_USER}
                  </Text>
                  <Text style={styles.userUnit} numberOfLines={1}>
                    {session?.grants.find(
                      (g) => g.id_user_role === session.active?.id_user_role
                    )?.nama_unit_kerja ?? 'Semua unit kerja'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={styles.userRole}>{session?.active?.role ?? ROLE}</Text>
                  <Text style={styles.userLogoutHint}>Keluar</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </AdminNavContext.Provider>
  );
}

export function AppShell({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const { toggleNav } = useAdminNav();

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={toggleNav} style={styles.hamburger}>
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        {headerRight}
      </View>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,18,22,0.28)' },
  aside: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 236,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: C.borderCard,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  asideHead: {
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  asideHeadText: { fontSize: 16.5, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  kasirBtn: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: C.primary,
  },
  kasirDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primaryTintBorder },
  kasirTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  kasirSub: { fontSize: 12.5, color: '#fff', opacity: 0.8 },
  nav: { flex: 1, paddingHorizontal: 12 },
  navItem: { height: 52, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  navItemActive: { backgroundColor: C.primaryTintBg, borderWidth: 1.5, borderColor: C.primaryTintBorder },
  navItemText: { fontSize: 15.5, fontWeight: '600' },
  asideFoot: { padding: 12, borderTopWidth: 1, borderTopColor: C.borderLight },
  userCard: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.tableHeaderBg,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  userCardPressed: { backgroundColor: C.redBg, borderColor: C.redBorder },
  userName: { fontSize: 14, fontWeight: '600', color: C.text },
  userUnit: { fontSize: 12.5, color: C.muted2 },
  userRole: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: C.dark2 },
  userLogoutHint: { fontSize: 11, fontWeight: '600', color: C.red },
  main: { flex: 1, minWidth: 0 },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: C.borderCard,
  },
  hamburger: {
    width: 40,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  hamburgerBar: { width: 17, height: 2, borderRadius: 2, backgroundColor: C.dark2 },
  headerTitle: { fontSize: 18.5, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
});
