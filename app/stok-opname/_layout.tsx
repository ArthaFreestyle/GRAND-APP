/**
 * Stok opname: the section's own Stack, and the box that pays for its edges.
 *
 * Beside the tabs on the root stack, like `produk`, `penerimaan-susulan`,
 * `pemasok` and `laporan` — native tabs register a route only through a
 * `NativeTabs.Trigger` and the bar has three roots, so a directory under
 * `(admin)` without a trigger is unreachable. Reached from Beranda's grid.
 *
 * This file pays top, left and right because nothing else does: the root stack
 * pads nothing, and Android is edge-to-edge. The bottom is left alone — the
 * screens in here dock their own controls and pay that edge themselves.
 *
 * `[id]` is the counting screen and the only place in the whole app that writes
 * a document line at a time; `baru` opens a session, which is also the moment a
 * whole room stops accepting postings. Both are declared here rather than left
 * to the file tree so each carries its own `title`, which nothing draws but
 * which names the route to the web document title and to accessibility.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function StokOpnameLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Stok opname', animation: 'none' }} />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Hitung fisik', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="baru"
          options={{ title: 'Buka sesi hitung', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
