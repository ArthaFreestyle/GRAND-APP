/**
 * Kiriman susulan: the section's own Stack, and the box that pays for its edges.
 *
 * ## Where this sits
 *
 * **Beside the tabs, not inside them**, and not by preference. Native tabs
 * register a route only through a `NativeTabs.Trigger`, and Expo's docs are
 * explicit that a trigger marked `hidden` "cannot be navigated to in any way" —
 * so a susulan left under `(admin)` would either occupy a fourth tab nobody
 * wants or become unreachable. `/penerimaan-susulan/baru?idPembelian=…` is a
 * link the invoice screen pushes on every short delivery, so unreachable was not
 * an option.
 *
 * It is also where the document belongs. A susulan is always started from the
 * invoice that recorded the shortfall (F1 → F2 on the board), never from a
 * standing menu. Pushed from the stack that *contains* the tabs, closing it
 * returns to the invoice the reader came from rather than to a susulan index
 * they never visited.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does, and for a while nothing did. `(admin)/_layout.tsx`
 * pays top, left and right for the screens *inside* the tabs; `app/_layout.tsx`
 * pays nothing at all. When this section moved out from under `(admin)` it
 * therefore lost its insets in silence — and Android is edge-to-edge, so the
 * header sat under the status bar and the docked button under the gesture pill,
 * on every device with either. `app/produk/_layout.tsx` carries the same box for
 * the same reason.
 *
 * The **bottom** is deliberately left alone: each screen here docks its own
 * controls on that edge and pays it in the component, because an inset is a
 * runtime value that changes with rotation, a foldable and the keyboard, and is
 * often zero. Paying it here as well would open a strip of page colour under the
 * dock — invisible on a device with no notch, obvious on every device with one.
 *
 * ## The three routes
 *
 * Declared rather than left to the file tree so each carries its own options.
 * `title` is drawn nowhere — every screen renders its own `RamahHeader` — but it
 * names the route to the web document title and to accessibility.
 *
 * The anchor is what a cold deep link needs, including the one this section gets
 * most often: opened straight at `/penerimaan-susulan/baru?idPembelian=…`, the
 * stack is built with the list underneath, so dismissing lands on it instead of
 * leaving the app.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function PenerimaanSusulanLayout() {
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
        {/*
          `index` does not animate. It is what a push into this section lands on,
          and the root stack is already sliding the whole section in from the
          right; animating the screen inside it as well plays the same move twice.
        */}
        <Stack.Screen name="index" options={{ title: 'Kiriman susulan', animation: 'none' }} />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Detail kiriman susulan', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="baru"
          options={{ title: 'Kiriman susulan baru', animation: 'slide_from_right' }}
        />
      </Stack>
    </View>
  );
}
