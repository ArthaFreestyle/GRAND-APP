/**
 * Tutup buku: the section's own Stack, and the box that pays for its edges.
 *
 * Beside the tabs on the root stack like every other section, for the same
 * hard reason — a route under `(admin)` with no `NativeTabs.Trigger` is a route
 * nothing can reach. Reached from Laporan, and from the confirmation of any
 * posting the server rejected because its month is closed.
 *
 * Top, left and right are paid here because the root stack pays nothing and
 * Android is edge-to-edge. The bottom is left to the screen: it docks nothing
 * and scrolls, so the inset belongs inside its `contentContainerStyle`.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PeriodeLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Tutup buku' }} />
      </Stack>
    </View>
  );
}
