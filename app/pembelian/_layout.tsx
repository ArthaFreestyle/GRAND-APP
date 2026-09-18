/**
 * Nota pembelian: the section's own Stack, and the box that pays for its edges.
 *
 * ## Where this sits, and why it moved
 *
 * **Beside the tabs now, not inside them.** This used to be the third tab root
 * — Beranda · Kasir · Nota — and that shipped two real bugs: the docked "Faktur
 * baru" pill sat under the native tab bar rather than above it (native tabs'
 * automatic bottom inset, documented in `app/(admin)/_layout.tsx`, did not
 * reliably reach a plain docked `View` the way it does a `ScrollView`), and the
 * tab was a second door to a screen Beranda's own "Pembelian" tile already
 * opens — exactly the redundancy issue #24 had just spent removing "Persetujuan"
 * for. Fixing the first bug the same way `produk` and `pengaturan` already
 * handle it — this section paying its own insets on the root stack — also fixed
 * the second, so both went together rather than patching the inset in place.
 *
 * The bar is down to two roots now: Beranda and Kasir. Nota is reached the way
 * Katalog already was — pushed from Beranda's tile and its "Menunggu
 * persetujuan" metric, and from wherever else a document number is tapped
 * (`pemasok/[id]/utang.tsx`'s open-invoice list, for one) — with a back arrow
 * to wherever it came from rather than a tab with nothing behind it. See
 * `app/produk/_layout.tsx` for the identical reasoning, written out in full the
 * first time this move was made.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does. `(admin)/_layout.tsx` pays top, left and right for
 * screens *inside* the tabs; the root stack pays nothing at all. Top, left and
 * right are this box's job for the same reason `produk`'s are: every screen
 * here runs `headerShown: false` and there is no navigator chrome above them.
 * The **bottom** is deliberately left alone — each screen docks a button on it
 * and reads `useDockPadding(insets.bottom, gap)` itself, so paying it here too
 * would double it on every device with a gesture bar.
 *
 * ## The three routes
 *
 * Declared rather than left to the file tree, so each carries its own options.
 * `title` is drawn nowhere — every screen renders its own `RamahHeader` — but it
 * is what names the route to the web document title and to accessibility, which
 * otherwise get the file name.
 *
 * The anchor is not optional: opened cold at `/pembelian/12`, the stack is built
 * with the list underneath, so dismissing the detail lands on it instead of
 * leaving the app.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PembelianLayout() {
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
        {/*
          `index` does not animate: it is what the push into this section
          *lands* on, and the root stack is already sliding the whole section in
          from the right — animating the screen inside it as well would play the
          same move twice.
        */}
        <Stack.Screen name="index" options={{ title: 'Pembelian', animation: 'none' }} />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Detail pembelian', animation: 'slide_from_right' }}
        />
        {/* One route holding the board's whole create flow — pick the goods, pick
            the supplier, and optionally photograph the faktur on the way. */}
        <Stack.Screen
          name="baru"
          options={{ title: 'Pembelian baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
