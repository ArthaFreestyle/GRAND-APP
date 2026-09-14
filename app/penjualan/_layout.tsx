/**
 * Nota penjualan: the section's own Stack, and the box that pays for its
 * edges — issue #25.
 *
 * ## Why this section exists at all, and why it has no `index`
 *
 * Riwayat (`app/(admin)/riwayat.tsx`) is the list — it is a *tab*, not a route
 * under here, because the board draws it as one of the five roots. What sits
 * here is only the record a row opens, the same split `app/produk/` and
 * `app/pembelian/` already use between a list and the record it pushes. The
 * difference from both of those is that this section's list lives somewhere
 * else entirely, so there is no `index.tsx` to anchor on and none is declared:
 * `unstable_settings.anchor` only synthesizes a *sibling route in this same
 * layout* underneath a deep link, and there is no sibling here for it to
 * synthesize — the real list is a different segment (`(admin)/riwayat`)
 * reached through the tab bar, not through this Stack.
 *
 * A cold deep link straight into `/penjualan/123` still lands safely: the
 * route sits behind `Stack.Protected` in `app/_layout.tsx` like every other
 * admin screen, so it resolves through the sign-in and context guards first,
 * which is what actually builds a stack underneath it (`(admin)`, showing
 * whichever tab a session's guard settles on) — not this layout's anchor.
 * `[id].tsx`'s own `goBack` falls back to `router.replace('/riwayat')` for the
 * case that leaves nothing to dismiss, the same shape `pembelian`'s and
 * `produk`'s details use.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does. `(admin)/_layout.tsx` pays top, left and right for
 * screens *inside* the tabs; the root stack pays nothing at all. This section
 * sits beside the tabs on the root stack — reached by pushing `/penjualan/[id]`
 * from wherever a nota is tapped (Riwayat's own rows, and anywhere else a nota
 * number is shown), never from inside a tab, so back returns to the tab the
 * person was actually looking at rather than to whichever tab happens to own
 * the pushed route (see "Eager mounting also changes where back goes" in
 * CLAUDE.md). The bottom edge is left alone: the screen docks its own controls
 * on it and reads `useDockPadding(insets.bottom, gap)` itself, exactly like
 * `pembelian`'s and `produk`'s detail routes.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export default function PenjualanLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.surfaceSunken,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.surfaceSunken } }}>
        <Stack.Screen name="[id]" options={{ title: 'Detail nota', animation: 'slide_from_right' }} />
      </Stack>
    </View>
  );
}
