/**
 * Pemakaian internal: the section's own Stack, and the box that pays for its
 * edges.
 *
 * Beside the tabs on the root stack for the same reason as every other section,
 * and reached from Beranda's "Lihat semua". Top, left and right are paid here;
 * the bottom belongs to whatever each screen docks there.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PemakaianLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Pemakaian', animation: 'none' }} />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Permintaan pemakaian', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="baru"
          options={{ title: 'Permintaan baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
