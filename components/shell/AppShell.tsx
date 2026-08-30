/**
 * Back-office chrome: what goes *inside* the navigation drawer, and the header
 * every admin screen puts above its own body.
 *
 * The drawer itself is a real navigator — `expo-router/drawer`, mounted once in
 * `app/(admin)/_layout.tsx`. It owns the panel, the dimming overlay, the
 * swipe-from-the-edge gesture, the open/close animation, and the back-button
 * handling, so none of that is re-implemented here. This file supplies the
 * panel's contents (`AdminDrawerContent`) and the button that opens it.
 */
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RoleChip } from '@/components/shell/role-switcher';
import { Box } from '@/components/ui/box';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { logout } from '@/services/auth';
import { roleLabel } from '@/services/permissions';
import { useSession } from '@/services/session';

/**
 * The sections, in the order the drawer lists them.
 *
 * `name` is both the route name the drawer navigator knows a section by and its
 * path segment — `app/(admin)/_layout.tsx` maps this same array into
 * `<Drawer.Screen>` children, so the menu and the navigator cannot drift apart.
 */
export const NAV_ITEMS = [
  { name: 'produk', label: 'Produk' },
  { name: 'pelanggan', label: 'Pelanggan' },
  { name: 'supplier', label: 'Supplier' },
  { name: 'pembelian', label: 'Pembelian' },
  { name: 'penjualan', label: 'Penjualan' },
  { name: 'mutasi-pemakaian', label: 'Mutasi & Pemakaian' },
  { name: 'stok-opname', label: 'Stok Opname' },
  { name: 'laporan', label: 'Laporan' },
  { name: 'unit-kerja-ruang', label: 'Unit Kerja & Ruang' },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['name'];

/**
 * The drawer panel's contents, handed to the navigator as `drawerContent`.
 *
 * Which section is current comes from the navigator's own state rather than
 * from `usePathname()`: the drawer's focused route *is* the section, so a
 * detail pushed inside it (`/produk/12`) keeps Produk lit without the prefix
 * matching a pathname comparison would need.
 */
export function AdminDrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const router = useRouter();
  const session = useSession();
  const active = state.routeNames[state.index];

  const activeUnit = session?.grants.find(
    (g) => g.id_user_role === session.active?.id_user_role
  )?.nama_unit_kerja;

  return (
    <Box className="flex-1">
      <Box className="h-16 justify-center border-b border-line-light px-[18px]">
        <Text className="text-[16.5px] font-semibold tracking-tight text-foreground">
          Manajemen
        </Text>
      </Box>

      <Pressable
        onPress={() => {
          // The kasir screen lives outside this drawer's group, so it is a push
          // on the root stack rather than a section switch. Close by hand: the
          // drawer only closes itself for navigation its own router handles.
          navigation.dispatch(DrawerActions.closeDrawer());
          router.push('/kasir');
        }}
        className="mx-3 mb-1.5 mt-3 h-[60px] flex-row items-center gap-3 rounded-[11px] bg-primary px-3.5 data-[active=true]:bg-primary-dark">
        {/* The palette's gold, against the primary blue — the one place
            the accent carries weight rather than tinting a warning. */}
        <Box className="h-[9px] w-[9px] rounded-full bg-gold" />
        <Box>
          <Text className="text-base font-semibold text-white">Buka Kasir</Text>
          <Text className="text-[12.5px] text-white opacity-80">Layar penjualan</Text>
        </Box>
      </Pressable>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12 }}
        contentContainerStyle={{ gap: 4, paddingBottom: 12 }}>
        {NAV_ITEMS.map((n) => {
          const isActive = n.name === active;
          return (
            <Pressable
              key={n.name}
              onPress={() => {
                // The drawer router closes itself on a navigate that changes the
                // focused route, but not on one that re-selects the section
                // already showing — closing here covers both.
                navigation.dispatch(DrawerActions.closeDrawer());
                // `navigate`, not a push or a replace: each section is its own
                // Stack under the drawer, so navigating back to one restores the
                // screen it was left on rather than rebuilding it from the list.
                // Nothing has to be dismissed by hand any more either — a
                // section's depth belongs to that section's stack, and the menu
                // can no longer assemble a history out of its own clicks.
                navigation.navigate(n.name);
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
            // No navigation to do. Dropping the session closes the
            // `Stack.Protected` guard this whole group sits behind, so the
            // navigator unmounts it and falls back to the login anchor —
            // which is also what happens when a refresh fails mid-screen, so
            // signing out and being signed out now take the same path.
            void logout();
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
              {roleLabel(session?.active?.role)}
            </Text>
            <Text className="text-[11px] font-semibold text-danger">Keluar</Text>
          </Box>
        </Pressable>
      </Box>
    </Box>
  );
}

/**
 * The header bar, and — on a pushed screen — the way back out of it.
 *
 * The leading slot holds exactly one control, and which one it is says where
 * you are: the hamburger at a section root, the back chevron once a record or a
 * form is pushed over it. That is the arrangement every app with a navigation
 * bar uses, App Store included, and the reason is that the title and the way
 * back belong to the same thing — the screen you are on. Putting the back
 * control in the body instead, under a bar still showing the *section* name,
 * gave every detail two titles and a button that scrolled away from the bar it
 * belonged to.
 *
 * So a depth screen passes its own `title` — the record, not the section — and
 * the `goBack` it already had. `onBack` is not called at a section root even if
 * one is passed: there is nothing there to go back to, and the drawer needs the
 * slot.
 */
export function AppShell({
  title,
  onBack,
  headerRight,
  children,
}: {
  title: string;
  /**
   * Shown as the header's back control while this screen is pushed over its
   * section root. It should be the screen's own `goBack` — `dismiss()` to the
   * section Stack, falling back to a `replace` for a cold deep link — so the
   * bar and the Android back button do the same thing.
   */
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  // Every admin screen renders inside its section's Stack, which is itself one
  // screen of the drawer. A drawer action dispatched from here is not something
  // that Stack handles, so React Navigation bubbles it up to the drawer — which
  // is why this needs no context of its own.
  const navigation = useNavigation();
  /**
   * Which control the leading slot holds, decided by the screen itself.
   *
   * This used to be read off the navigator — `useNavigationState((s) => s.type
   * === 'stack' && s.index > 0)` — which was correct and *late*. A native-stack
   * pop is committed to the JS navigation state only when the transition ends,
   * so for the length of the animation the list underneath still believed it was
   * at depth: you watched the record slide away over a header with a hole where
   * the hamburger goes, and the menu popped in a beat after the screen had
   * settled. Nothing was loading; the header was answering a question about a
   * screen that was already gone.
   *
   * `onBack` is the same fact as a prop, known at the first render of every
   * screen, so the bar is right on the frame it is drawn. Every pushed screen
   * passes it (that is how it gets a back control at all), and no section root
   * has anything to go back to — so "has an `onBack`" and "is at depth" are the
   * same set, without a subscription.
   *
   * The drawer stays out of reach on those screens by design, the way it is
   * anywhere else: you leave the record first, then you switch sections.
   * `app/(admin)/_layout.tsx` turns off the edge swipe to match — that one is
   * still a navigator option and still reads the route, but it gates a gesture
   * nobody can attempt mid-animation, so its timing is not visible.
   */
  const inDepth = onBack !== undefined;

  return (
    <>
      <Box className="h-16 flex-row items-center gap-3.5 border-b border-line-card bg-card px-[18px]">
        {inDepth ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            // No border and a wider touch target than the hamburger: a back
            // control is pressed constantly and reads as part of the title, not
            // as a button parked next to it.
            className="-ml-2.5 h-11 w-11 items-center justify-center rounded-full data-[active=true]:bg-line-lighter">
            <View style={styles.chevron} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
            accessibilityRole="button"
            accessibilityLabel="Buka menu"
            className="h-10 w-10 items-center justify-center gap-1 rounded-[9px] border border-border data-[active=true]:bg-line-lighter">
            <View style={styles.hamburgerBar} />
            <View style={styles.hamburgerBar} />
            <View style={styles.hamburgerBar} />
          </Pressable>
        )}
        <Text
          numberOfLines={1}
          className="shrink text-[18.5px] font-semibold tracking-tight text-foreground">
          {title}
        </Text>
        <Box className="flex-1" />
        {/* Section roots only. A pushed screen is one record on a phone-width
            bar that already carries a back control, a title long enough to
            truncate, and the record's own actions; the grant is not what anyone
            is there to read, and it is still one tap away in the drawer, which
            also names the unit kerja the chip never had room for. */}
        {!inDepth && <RoleChip />}
        {/* The screen's own actions, tight together and flush to the edge: the
            header's 14pt gap is right between the title and the chip, and far
            too much between two 40pt icon buttons that belong to each other. */}
        {headerRight && (
          <Box className="-mr-1.5 flex-row items-center gap-0.5">{headerRight}</Box>
        )}
      </Box>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  // Three 2px bars: too small for a class to read more clearly than this.
  hamburgerBar: { width: 17, height: 2, borderRadius: 2, backgroundColor: '#2E4557' },
  /**
   * The back chevron: a square with two of its four borders, turned 45°. Drawn
   * rather than typed because the glyphs that look like a chevron (‹, ❮, ⟨) are
   * a different weight and a different height in every font the platforms pick,
   * and this one has to line up with the title beside it.
   */
  chevron: {
    width: 11,
    height: 11,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#2E4557',
    transform: [{ rotate: '45deg' }],
    // The rotated square's visual centre sits right of its layout box.
    marginLeft: 3,
  },
});
