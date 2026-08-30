import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { hasActiveContext, hydrateSession, useSession } from '@/services/session';

// Reading the stored session is a Keystore round trip. Holding the splash for
// it is what keeps a signed-in user from seeing the login screen flash past on
// every cold start.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or no splash on this platform — not worth failing over.
});

// Without this a deep link into a guarded route that later closes has nothing
// underneath it to fall back to, and dismissing would leave the app.
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateSession().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // The back-office screens are a light-mode design port; forcing the mode here
  // keeps a device in dark mode from half-inverting components that were never
  // given a dark palette.
  // `expo-router/drawer` is a gesture-handler navigator: on Android its
  // swipe-from-the-edge only reaches the JS side from inside this root view,
  // and without it the drawer silently stops opening by gesture on exactly one
  // platform.
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
 * signed-out / signed-in pair: a session can hold a token and still authorize
 * nothing until it picks a grant (`active: null`). That middle state gets its
 * own route rather than being folded into the login screen — it is a different
 * question, asked of someone who has already proved who they are.
 *
 * `index` is deliberately **not** guarded. It is the anchor every guard falls
 * back to when it closes, and it is also the one screen that knows where a
 * signed-in session belongs: a cashier's home is the POS screen, everyone
 * else's is the back office, and a `Stack.Protected` fallback would just take
 * whichever screen happens to be listed first. So it redirects itself instead.
 */
function RootNavigator() {
  const session = useSession();
  const ready = hasActiveContext(session);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={session !== null && !ready}>
        <Stack.Screen name="pilih-peran" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="kasir" />
      </Stack.Protected>
    </Stack>
  );
}
