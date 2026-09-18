/**
 * Presensi: the section's own Stack, and the box that pays for its edges.
 *
 * ## Where this sits
 *
 * **Beside the tabs, not on them and not on the grid.** The bar is already at
 * its five-tab ceiling since issue #25, and Beranda's grid is already at its
 * eight-tile cap (guide §4) — either would have to evict something this
 * section did not earn. So it sits on the root stack next to `produk` and
 * `penerimaan-susulan`, reached from the presensi card on Beranda and from the
 * "Presensi" group in `app/(admin)/profil.tsx`, the one surface every role
 * actually reaches (`homeRouteFor` sends CASHIER to `/kasir`, whose bar stays
 * hidden until "Kembali" is pressed, so a cashier never sees Beranda at all).
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does. `(admin)/_layout.tsx` pays top, left and right for
 * screens *inside* the tabs; `app/_layout.tsx` pays nothing. `app/produk/_layout.tsx`
 * and `app/penerimaan-susulan/_layout.tsx` both carry the same box for the same
 * reason — a section that moves out from under `(admin)` loses its insets in
 * silence, and Android's edge-to-edge default puts a header under the status bar
 * and a docked control under the gesture pill.
 *
 * The **bottom** stays unpaid here: nothing in this section docks a control on
 * every screen (the history and team lists have no add button — a susulan-style
 * "buat baru" pill has no reason to exist when the record is made by pressing a
 * tombol on Beranda instead), and the one screen that does dock something,
 * `[id]/ubah.tsx`, reads `insets.bottom` itself.
 *
 * ## The five routes
 *
 * Declared rather than left to the file tree, each with its own `title` (drawn
 * nowhere — every screen renders its own `RamahHeader` — but named for the web
 * document title and accessibility). `[id]/index` and `[id]/ubah` are both
 * SUPERADMIN screens; `tim` and `rekap` are too. **No `[id]/_layout.tsx`**, so
 * that folder flattens into this stack and `router.dismiss()` from `ubah` lands
 * straight on the detail underneath it — the same shape `app/produk/[id]/` uses.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PresensiLayout() {
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
        {/* Lands on directly from Beranda's card or Profil's "Riwayat presensi"
            row, both of which are already sliding the section in from the
            right — animating this screen too would play that move twice. */}
        <Stack.Screen name="index" options={{ title: 'Riwayat presensi', animation: 'none' }} />
        <Stack.Screen name="tim" options={{ title: 'Presensi tim', animation: 'slide_from_right' }} />
        <Stack.Screen name="rekap" options={{ title: 'Rekap bulanan', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="[id]/index"
          options={{ title: 'Detail presensi', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/ubah"
          options={{ title: 'Koreksi presensi', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
