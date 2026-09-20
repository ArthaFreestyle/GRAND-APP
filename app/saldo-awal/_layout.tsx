/**
 * Saldo awal: the section's own Stack, and the box that pays for its edges.
 *
 * Beside the tabs on the root stack, like `stok-opname` and `penerimaan-susulan`:
 * native tabs register a route only through a `NativeTabs.Trigger`, so a
 * directory under `(admin)` without one is unreachable. Reached from Beranda's
 * "Lihat semua" — a migration document is typed once per unit kerja, so it does
 * not earn one of the eight tiles opened four times a day.
 *
 * This file pays top, left and right because nothing else does: the root stack
 * pads nothing, and Android is edge-to-edge. The bottom is each screen's, where
 * it docks its own controls. Every route is declared here so each carries a
 * `title`, which nothing draws but which names the route to the web document
 * title and to accessibility.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function SaldoAwalLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Saldo awal', animation: 'none' }} />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Dokumen saldo awal', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="baru"
          options={{ title: 'Saldo awal baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
