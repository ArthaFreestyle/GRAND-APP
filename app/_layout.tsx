/*
 * Four **deep** imports, not one from the package root.
 *
 * `@expo-google-fonts/poppins`'s index re-exports all eighteen faces, each a
 * `require()` of a .ttf — and Metro does not tree-shake an asset `require`, so
 * importing four names from the root ships every italic and every weight from
 * Thin to Black. That is about 3 MB of fonts for the four the app draws in.
 * `npx expo export --platform android` lists them, which is how it was caught.
 *
 * `useFonts` comes from `expo-font` itself for the same reason: the root is
 * where the package re-exports it from, and touching the root is the thing being
 * avoided.
 */
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasChosenContext, hydrateSession, useSession } from '@/services/session';

// Reading the stored session is a Keystore round trip, and the four Poppins
// faces are files. Holding the splash for both is what keeps a signed-in user
// from seeing the login screen flash past on every cold start, and every screen
// from painting one frame in the platform font before swapping family under it.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or no splash on this platform — not worth failing over.
});

// Without this a deep link into a guarded route that later closes has nothing
// underneath it to fall back to, and dismissing would leave the app.
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [hydrated, setHydrated] = useState(false);

  /**
   * Poppins, in the four weights `constants/theme-ramah.ts` names.
   *
   * Loaded at runtime rather than embedded by the `expo-font` config plugin,
   * because the runtime loader registers each file under the family name we
   * give it and that name is then the same on Android and iOS — the plugin
   * takes the family from the file on iOS and from the file *name* on Android,
   * which would put a `Platform.select` in every text style in the app.
   *
   * `error` is a value here, not an exception: a face that fails to decode must
   * not hold the splash screen forever. The app opens in the platform font
   * instead, which is why every `RamahWeight` entry still carries its numeric
   * `fontWeight` — the hierarchy survives the fallback.
   */
  const [fontsLoaded, fontsError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    hydrateSession().finally(() => setHydrated(true));
  }, []);

  const ready = hydrated && (fontsLoaded || fontsError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // The back-office screens are a light-mode design port; forcing the mode here
  // keeps a device in dark mode from half-inverting components that were never
  // given a dark palette.
  // `GestureHandlerRootView` stays now that the drawer it was added for is
  // gone. `react-native-screens` builds its native-stack gestures on
  // gesture-handler — the swipe-back on iOS and the predictive back animation
  // on Android both run through it — and `ModalShell`'s scrim is a
  // `Pressable` inside a `Modal`, which on Android needs the root view above it
  // to receive touches at all. Removing it would break those quietly, on one
  // platform each, which is exactly the class of bug it was introduced to fix.
  //
  // There is **no sheet provider here any more**. `RamahSheet` is
  // `@expo/ui/community/bottom-sheet` now, which presents natively: it wraps its
  // own `Host`, needs no portal and no provider, and its host carries
  // `pointerEvents="none"` while the sheet is closed — which is precisely what
  // the hand-rolled `Modal` window it replaced did not, and why the app went
  // dead to touches after the first sheet was dismissed.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider mode="light">
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
          <StatusBar style="auto" />
        </ThemeProvider>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Which routes exist at all, decided by how far the session has got.
 *
 * These are `Stack.Protected` guards, not redirects. The difference is that a
 * guarded-off route is **not in the navigator**: it cannot be reached by a deep
 * link, by the back button, or by a stale `router.push` still in flight, and
 * when a guard turns false under a screen that is already open the navigator
 * pops it for us. The hook this replaces (`useRequireSession`) redirected from
 * an effect, which meant the screen mounted, ran its first fetch against a
 * session that was already gone, and painted one frame before leaving.
 *
 * Three states, not two, because this contract has one more than the usual
 * signed-out / signed-in pair: a session can hold a token and still not be
 * ready to work. That middle state gets its own route rather than being folded
 * into the login screen — it is a different question, asked of someone who has
 * already proved who they are.
 *
 * The middle state is `hasChosenContext`, not `hasActiveContext`: a login with
 * exactly one usable grant comes back with that grant already active, and the
 * app still shows `/pilih-peran` so the person sees which role and unit kerja
 * the session is about to work as. Guarding on "active" alone would skip the
 * question for precisely the people who never chose anything.
 *
 * `index` is deliberately **not** guarded. It is the anchor every guard falls
 * back to when it closes, and it is also the one screen that knows where a
 * signed-in session belongs: a cashier's home is the POS screen, everyone
 * else's is the back office, and a `Stack.Protected` fallback would just take
 * whichever screen happens to be listed first. So it redirects itself instead.
 */
function RootNavigator() {
  const session = useSession();
  const ready = hasChosenContext(session);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={session !== null && !ready}>
        <Stack.Screen name="pilih-peran" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(admin)" />
        {/*
          Katalog sits **beside** the tabs for the same reason susulan does,
          below — and it moved out the day the till took the middle tab.

          The board draws three roots — Beranda, Kasir, Nota — and the bar had
          three to match until issue #24 (below). Katalog was never one of them:
          a route inside `(admin)` with no `NativeTabs.Trigger` is a route
          nothing can reach. So it is pushed from the stack that *contains* the
          tabs, which is also how the board draws the screen itself:
          `LayarGudang.dc.html` gives Katalog an `AppHeader` with a back arrow to
          home, not a tab root with no way back. Beranda's metric card and its
          Katalog tile are what push it, and closing it returns there.
        */}
        <Stack.Screen name="produk" />
        {/*
          Penerimaan susulan sits **beside** the tabs, not inside them.

          Two reasons, and the first is a hard constraint. Native tabs register a
          route only through a `NativeTabs.Trigger`, and a trigger marked
          `hidden` "cannot be navigated to in any way" — so a susulan left inside
          `(admin)` would either occupy a fourth tab nobody wants or become
          unreachable, and `/penerimaan-susulan/baru?idPembelian=` is a link the
          invoice screen pushes on every short delivery.

          The second is that this is where it belonged anyway. A susulan is
          always started from the invoice that recorded the shortfall (F1 → F2 on
          the board), never from a standing menu. Pushed from the stack that
          *contains* the tabs, closing it returns to the invoice the reader came
          from rather than to a susulan index they never visited.
        */}
        <Stack.Screen name="penerimaan-susulan" />
        {/*
          Pemasok sits **beside** the tabs for the same hard reason as the two
          above: native tabs register a route only through a
          `NativeTabs.Trigger`, and the bar has exactly three roots. It is
          reached from Beranda's feature grid — twice, in fact, since the
          "Utang pemasok" tile lands on the same list with `?utang=1` and only
          changes where a row goes. See `app/pemasok/index.tsx` for why the
          contract cannot give that second tile a screen of its own.
        */}
        <Stack.Screen name="pemasok" />
        {/*
          Laporan, beside the tabs for the same reason as the three above. It is
          two screens rather than one because `GET /laporan/pergerakan` has no
          paging and no natural bound — see `app/laporan/index.tsx`.
        */}
        <Stack.Screen name="laporan" />
        {/*
          Stok opname, beside the tabs like the four above. Opening one freezes
          a whole room against every module, so its own screens say so loudly —
          see `app/stok-opname/baru.tsx`.
        */}
        <Stack.Screen name="stok-opname" />
        {/*
          Pengaturan unit kerja & ruang, beside the tabs for the same hard
          reason as the five above. Issue #23: it exists so five screens across
          the app — kasir, pembelian's nota baru, produk's katalog and detail,
          stok opname's buka sesi — have somewhere to send someone the moment a
          unit kerja has no ruang at all, rather than stopping dead with a
          sentence and nowhere to go. See `app/pengaturan/_layout.tsx`.
        */}
        <Stack.Screen name="pengaturan" />
        {/*
          Nota pembelian, beside the tabs too now — issue #24 moved it off the
          bar it used to be the third root of. It was not a hard constraint like
          the six above: a `NativeTabs.Trigger` could still have hosted it. It
          moved because its docked "Faktur baru" pill was sitting under the bar
          rather than above it, and because Beranda's own "Pembelian" tile was
          already a second door to the same screen — the same redundancy that
          issue had just finished removing from the feature grid itself
          (`Persetujuan`, folded into the "Diajukan" chip on this list). See
          `app/pembelian/_layout.tsx`.
        */}
        <Stack.Screen name="pembelian" />
        {/*
          Nota penjualan, beside the tabs too — issue #25. Riwayat (the list)
          is the fourth tab; this is only the record a row of it pushes, and it
          has no `NativeTabs.Trigger` of its own because a sixth tab would sit
          past the platform's own five-tab ceiling on both bottom-navigation
          styles. See `app/penjualan/_layout.tsx`.
        */}
        <Stack.Screen name="penjualan" />
      </Stack.Protected>
    </Stack>
  );
}
