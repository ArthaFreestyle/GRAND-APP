/**
 * Laporan: the section's own Stack, and the box that pays for its edges.
 *
 * Beside the tabs on the root stack, like `produk`, `penerimaan-susulan` and
 * `pemasok` — native tabs register a route only through a `NativeTabs.Trigger`
 * and the bar has exactly three roots, so a directory under `(admin)` with no
 * trigger is a route nothing can reach. Reached from Beranda's feature grid.
 *
 * This file pays top, left and right because nothing else does: the root stack
 * pads nothing at all, and Android is edge-to-edge, so a section landing here
 * without this box draws its header under the status bar. The bottom is left
 * alone — neither screen in here docks a control, and both scroll, so the bottom
 * inset belongs inside `contentContainerStyle` where the last row can scroll
 * clear of the gesture bar rather than on a container that would stop the list's
 * own background short of the edge.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function LaporanLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Laporan', animation: 'none' }} />
        <Stack.Screen
          name="pergerakan"
          options={{ title: 'Pergerakan stok', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
