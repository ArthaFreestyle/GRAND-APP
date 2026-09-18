/**
 * Manajemen pengguna (issue #42): the section's own Stack, and the box that
 * pays for its edges — the identical shape `app/pengaturan/_layout.tsx` and
 * `app/pemasok/_layout.tsx` carry, for the identical reason.
 *
 * Beside the tabs, not inside them: native tabs register a route only through
 * a `NativeTabs.Trigger`, and the bar has exactly five roots now (issue #25).
 * Reached from Profil's "Administrasi" group, drawn only for `SUPERADMIN` —
 * see `app/(admin)/profil.tsx` — because this is the **first** section in the
 * app where reading itself, not only writing, is role-gated: `GET /user`
 * answers 403 for INVENTARIS and CASHIER, so the door to it has to disappear
 * for them rather than open onto a page that fails.
 *
 * `index.tsx` still has to draw its own "tidak berwenang" page rather than
 * trust the door being hidden: the route is reachable by URL regardless of
 * what Profil draws, and a hidden row is not a guard.
 *
 * `baru` and `[id]/ubah` are routes rather than dialogs for the reason `produk`
 * worked out: a `Modal` presents from the bottom edge while every other push in
 * a section comes in from the right, so the one form that changes a record
 * would announce itself as a different kind of thing from the one that creates
 * one. There is no `[id]/_layout.tsx`: with no layout of its own the folder
 * flattens into this stack, which is what lets `router.dismiss()` pop straight
 * back onto the detail from an edit.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PenggunaLayout() {
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
        <Stack.Screen name="index" options={{ title: 'Pengguna', animation: 'none' }} />
        <Stack.Screen name="baru" options={{ title: 'Pengguna baru', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="[id]/index"
          options={{ title: 'Detail pengguna', animation: 'slide_from_right' }}
        />
        <Stack.Screen name="[id]/ubah" options={{ title: 'Ubah pengguna', animation: 'slide_from_right' }} />
      </Stack>
    </View>
  );
}
