import { usePathname, useRouter } from 'expo-router';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Box } from '@/components/ui/box';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
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
  // The sidebar is an overlay drawer with a dimming backdrop, not a fixed rail —
  // opening it by default puts it over the screen the user actually asked for.
  const [navShown, setNavShown] = useState(false);
  const active = NAV_ITEMS.find((n) => n.href === pathname)?.key ?? null;

  const ctxValue = useMemo(
    () => ({ navShown, toggleNav: () => setNavShown((v) => !v) }),
    [navShown]
  );

  const activeUnit = session?.grants.find(
    (g) => g.id_user_role === session.active?.id_user_role
  )?.nama_unit_kerja;

  return (
    <AdminNavContext.Provider value={ctxValue}>
      <Box className="flex-1 bg-background">
        <Box className="min-w-0 flex-1">{children}</Box>

        {navShown && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setNavShown(false)}
            accessibilityLabel="Tutup menu">
            <Box className="flex-1 bg-toast/25" />
          </Pressable>
        )}

        {navShown && (
          <Box
            // The drawer floats over the content, so it carries its own shadow;
            // elevation is Android's and has no className equivalent.
            style={{ elevation: 12 }}
            className="absolute bottom-0 left-0 top-0 w-[236px] border-r border-line-card bg-card shadow-lg">
            <Box className="h-16 justify-center border-b border-line-light px-[18px]">
              <Text className="text-[16.5px] font-semibold tracking-tight text-foreground">
                Manajemen
              </Text>
            </Box>

            <Pressable
              onPress={() => router.push('/kasir' as never)}
              className="mx-3 mb-1.5 mt-3 h-[60px] flex-row items-center gap-3 rounded-[11px] bg-primary px-3.5 data-[active=true]:bg-primary-dark">
              <Box className="h-[9px] w-[9px] rounded-full bg-primary-tintline" />
              <Box>
                <Text className="text-base font-semibold text-white">Buka Kasir</Text>
                <Text className="text-[12.5px] text-white opacity-80">Layar penjualan</Text>
              </Box>
            </Pressable>

            <ScrollView style={{ flex: 1, paddingHorizontal: 12 }} contentContainerStyle={{ gap: 4, paddingBottom: 12 }}>
              {NAV_ITEMS.map((n) => {
                const isActive = n.key === active;
                return (
                  <Pressable
                    key={n.key}
                    onPress={() => {
                      setNavShown(false);
                      if (!isActive) router.replace(n.href as never);
                    }}
                    className={`h-[52px] justify-center rounded-[10px] px-3.5 ${
                      isActive
                        ? 'border-[1.5px] border-primary-tintline bg-primary-tint'
                        : 'data-[active=true]:bg-line-lighter'
                    }`}>
                    <Text
                      className={`text-[15.5px] font-semibold ${
                        isActive ? 'text-primary-dark' : 'text-dark2'
                      }`}>
                      {n.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Box className="border-t border-line-light p-3">
              <Pressable
                onPress={() => {
                  // Drop the session first — the login screen sends a live one
                  // straight back in. logout() finishes the revoke itself.
                  void logout();
                  router.replace('/');
                }}
                accessibilityRole="button"
                accessibilityLabel="Keluar"
                className="h-14 flex-row items-center justify-between rounded-[10px] border border-line-card bg-thead px-3.5 data-[active=true]:border-danger-line data-[active=true]:bg-danger-bg">
                <Box className="flex-1">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {session?.user.username ?? '—'}
                  </Text>
                  <Text className="text-[12.5px] text-faint-2" numberOfLines={1}>
                    {activeUnit ?? 'Semua unit kerja'}
                  </Text>
                </Box>
                <Box className="items-end gap-[3px]">
                  <Text className="text-xs font-semibold tracking-wide text-dark2">
                    {session?.active?.role ?? '—'}
                  </Text>
                  <Text className="text-[11px] font-semibold text-danger">Keluar</Text>
                </Box>
              </Pressable>
            </Box>
          </Box>
        )}
      </Box>
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
      <Box className="h-16 flex-row items-center gap-3.5 border-b border-line-card bg-card px-[18px]">
        <Pressable
          onPress={toggleNav}
          accessibilityRole="button"
          accessibilityLabel="Buka menu"
          className="h-10 w-10 items-center justify-center gap-1 rounded-[9px] border border-border data-[active=true]:bg-line-lighter">
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
        </Pressable>
        <Text className="text-[18.5px] font-semibold tracking-tight text-foreground">{title}</Text>
        <Box className="flex-1" />
        {headerRight}
      </Box>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  // Three 2px bars: too small for a class to read more clearly than this.
  hamburgerBar: { width: 17, height: 2, borderRadius: 2, backgroundColor: '#3A3F47' },
});
