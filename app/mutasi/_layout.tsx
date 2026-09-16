/**
 * Mutasi antar gudang: the section's own Stack, and the box that pays for its
 * edges.
 *
 * Beside the tabs on the root stack, like every other section — native tabs
 * register a route only through a `NativeTabs.Trigger`, so a directory under
 * `(admin)` without one is unreachable. Reached from Beranda's "Lihat semua".
 *
 * Top, left and right are paid here because the root stack pads nothing and
 * Android is edge-to-edge. The bottom is each screen's: they dock their own
 * controls and read the inset there.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function MutasiLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Mutasi gudang', animation: 'none' }} />
        <Stack.Screen name="[id]" options={{ title: 'Mutasi', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="baru"
          options={{ title: 'Mutasi baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
