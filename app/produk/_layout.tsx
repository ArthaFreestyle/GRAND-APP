/**
 * Katalog barang: the section's own Stack, and the box that pays for its edges.
 *
 * ## Where this sits
 *
 * **Beside the tabs, not inside them.** `app/(admin)/_layout.tsx` is a
 * three-root native tab navigator — Beranda · Kasir · Nota — and Katalog is not
 * one of the three: the till took the middle slot, because a till is a place
 * somebody stands for a whole shift while "how much of this is left" is a
 * question you arrive at. So this section is declared on the **root** stack in
 * `app/_layout.tsx`, pushed over the tabs by Beranda's Katalog tile and by its
 * reorder metric, and closing it returns there.
 *
 * That is also how the board draws it. `LayarGudang.dc.html` gives Katalog an
 * `AppHeader` with a back arrow to home, and `Papan Layar.dc.html` states the
 * rule at the foot of the map: three roots have no back button, **every other
 * screen is a stack — back arrow, no tab bar**. Being pushed from the stack
 * that *contains* the tabs is what makes both halves of that true at once; a
 * route left under `(admin)` with no `NativeTabs.Trigger` would simply be
 * unreachable, since native tabs register a route only through a trigger.
 *
 * ## Why this file pads three edges
 *
 * Because nothing else does. `(admin)/_layout.tsx` pads top, left and right for
 * the screens *inside* the tabs; the root stack pads nothing at all. When this
 * section moved out from under `(admin)` it therefore lost its insets in
 * silence — Android is edge-to-edge, so the header sat under the status bar and
 * the docked pill sat under the gesture pill, on every device with either.
 *
 * An inset is applied exactly once, by whatever owns that edge. Top, left and
 * right are this box's, because every screen in here runs `headerShown: false`
 * and there is no navigator chrome above them. The **bottom** is deliberately
 * left alone: each screen here docks a button on it and pads that edge itself,
 * so paying it here as well would open a strip of page colour under the button
 * — invisible on a device with no notch, obvious on every device with one.
 *
 * ## The four routes
 *
 * Declared rather than left to the file tree, so each carries its own options.
 * `title` is drawn nowhere — every screen renders its own `RamahHeader` — but
 * it is what names the route to the web document title and to accessibility,
 * which otherwise get the file name.
 *
 * **`[id]/ubah` is nested under the detail, and it is a screen of this stack.**
 * It was a full-screen `Modal` raised from the detail. That presented from the
 * bottom edge while every other push in the section comes in from the right, so
 * the one form in here that changes a record announced itself as a different
 * kind of thing from the two that create one — and the way out of it was an
 * `onRequestClose` rather than the stack. As a route the animation, the back
 * gesture and the insets are all the section's, declared here once. There is no
 * `[id]/_layout.tsx`: with no layout file of its own the folder is flattened
 * into this stack, which is what puts the form *beside* the detail at runtime
 * and lets `router.dismiss()` pop straight back onto it.
 *
 * The anchor is not optional: opened cold at `/produk/12`, the stack is built
 * with the catalogue underneath, so dismissing the detail lands on it instead
 * of leaving the app.
 */
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RamahColors as C } from '@/constants/theme-ramah';

export const unstable_settings = { anchor: 'index' };

export default function ProdukLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        // The merchant canvas, painted here as well as on each screen: during a
        // push the two screens slide past each other and whatever shows between
        // them for those few frames should be the grey they both sit on.
        backgroundColor: C.surfaceSunken,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.surfaceSunken } }}>
        {/*
          `index` does not animate. It is what the push into this section
          *lands* on, and the root stack is already sliding the whole section in
          from the right; animating the screen inside it as well plays the same
          move twice.
        */}
        <Stack.Screen name="index" options={{ title: 'Katalog produk', animation: 'none' }} />
        <Stack.Screen
          name="[id]/index"
          options={{ title: 'Detail barang', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/ubah"
          options={{ title: 'Ubah produk', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="[id]/katalog"
          options={{ title: 'Katalog unit kerja', animation: 'slide_from_right' }}
        />
        <Stack.Screen name="baru" options={{ title: 'Produk baru', animation: 'slide_from_right' }} />
      </Stack>
    </View>
  );
}
