/**
 * Pengaturan unit kerja & ruang: the section's own Stack, and the box that
 * pays for its edges.
 *
 * ## Where this sits, and why it exists at all
 *
 * Beside the tabs, not inside them, for the hard reason `produk` and `pemasok`
 * are too: native tabs register a route only through a `NativeTabs.Trigger`,
 * and the bar has exactly three roots. Declared on the **root** stack in
 * `app/_layout.tsx`.
 *
 * Unlike every other section beside the tabs, this one is not reached from a
 * Beranda tile — issue #23's whole point is that it did not exist, so five
 * screens across the app stop dead the moment a unit kerja has no ruang, each
 * with a sentence and nowhere to go. Those five now push here directly. That
 * is also why there is no tile for it yet: a tile earns its place once
 * something routine sends people to it, and today the only paths in are five
 * dead ends and whoever goes looking.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does — see `app/pemasok/_layout.tsx`, which carries the
 * identical box for the identical reason. The root stack pads nothing at all,
 * so a section without this gets a header under the status bar and a docked
 * button under the gesture pill on every device with either.
 *
 * ## The six routes
 *
 * `baru` and `[id]/ubah` are routes rather than dialogs for the reason
 * `produk` worked out: a `Modal` presents from the bottom edge while every
 * other push in a section comes in from the right, so the one form that
 * *changes* a record would announce itself as a different kind of thing from
 * the one that creates one.
 *
 * `ruang/baru` and `ruang/[id]` sit beside the unit kerja routes rather than
 * nested under `[id]/ruang/…`: a ruang cannot change which unit it belongs to
 * once created (`PATCH /ruang/{id}` never touches `id_unit_kerja`), so its own
 * identity does not need one in its URL — `ruang/baru` takes `idUnitKerja` as a
 * param instead, the same way `penerimaan-susulan/baru` takes `idPembelian`.
 *
 * There is no `[id]/_layout.tsx` and no `ruang/[id]/_layout.tsx`: with no
 * layout file of its own each folder flattens into this stack, which is what
 * lets `router.dismiss()` pop straight back from an edit onto its detail.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PengaturanLayout() {
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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.surfaceSunken },
        }}>
        <Stack.Screen name="index" options={{ title: 'Unit kerja & ruang', animation: 'none' }} />
        <Stack.Screen
          name="baru"
          options={{ title: 'Unit kerja baru', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/index"
          options={{ title: 'Detail unit kerja', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/ubah"
          options={{ title: 'Ubah unit kerja', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ruang/baru"
          options={{ title: 'Ruang baru', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ruang/[id]/index"
          options={{ title: 'Detail ruang', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ruang/[id]/ubah"
          options={{ title: 'Ubah ruang', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
