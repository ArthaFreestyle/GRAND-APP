/**
 * Pemasok: the section's own Stack, and the box that pays for its edges.
 *
 * ## Where this sits
 *
 * **Beside the tabs, not inside them**, for the same reason `produk` and
 * `penerimaan-susulan` are. `app/(admin)/_layout.tsx` is a three-root native tab
 * navigator — Beranda · Kasir · Nota — and a route left under `(admin)` without
 * a `NativeTabs.Trigger` is a route nothing can reach, because native tabs
 * register a route only through a trigger. So this is declared on the **root**
 * stack in `app/_layout.tsx` and pushed from Beranda's feature grid, which is
 * how it is reached and the only way it is reached.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does. `(admin)/_layout.tsx` pads top, left and right for
 * the screens *inside* the tabs; the root stack pads nothing at all. A section
 * that lands here without this box gets a header under the status bar and a
 * docked button under the gesture pill, on every device with either — which is
 * exactly the bug that put this box into `produk/_layout.tsx` after it moved out
 * from under `(admin)`.
 *
 * The **bottom** is deliberately left alone: the screens in here that dock a
 * control pay that edge themselves, and paying it twice opens a strip of page
 * colour under the button.
 *
 * ## The five routes
 *
 * `baru` and `[id]/ubah` are both routes rather than dialogs, which is the split
 * `produk` worked out: a dialog is a question about the record already on
 * screen, and a form with six fields and a save is a place. The second half of
 * that rule decided `ubah` in particular — a `Modal` presents from the bottom
 * edge while every other push in a section comes in from the right, so the one
 * form that *changes* a record would have announced itself as a different kind
 * of thing from the one that creates one.
 *
 * `[id]/utang` is a route for a plainer reason: it is a work queue somebody
 * sits in, and the "Utang pemasok" tile on Beranda links people straight to it.
 *
 * There is no `[id]/_layout.tsx`. With no layout file of its own the folder
 * flattens into this stack, which is what puts the three `[id]` screens beside
 * each other at runtime and lets `router.dismiss()` pop straight back.
 *
 * The anchor is not optional: opened cold at `/pemasok/12`, the stack is built
 * with the list underneath, so dismissing the detail lands on it instead of
 * leaving the app.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PemasokLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        // Painted here as well as on each screen: during a push the two slide
        // past each other, and whatever shows between them for those few frames
        // should be the grey they both sit on.
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
        {/* `index` does not animate: it is what the push into this section
            lands on, and the root stack is already sliding the whole section in
            from the right. Animating the screen inside it plays the same move
            twice. */}
        <Stack.Screen name="index" options={{ title: 'Pemasok', animation: 'none' }} />
        <Stack.Screen
          name="[id]/index"
          options={{ title: 'Detail pemasok', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/ubah"
          options={{ title: 'Ubah pemasok', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/utang"
          options={{ title: 'Utang pemasok', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="baru"
          options={{ title: 'Pemasok baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
