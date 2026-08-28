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
import { hydrateSession } from '@/services/session';

// Reading the stored session is a Keystore round trip. Holding the splash for
// it is what keeps a signed-in user from seeing the login screen flash past on
// every cold start.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or no splash on this platform — not worth failing over.
});

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
  // The row swipe in `components/shell/record-list.tsx` is a gesture-handler
  // gesture, and on Android those only reach the JS side from inside this root
  // view. Without it the swipe silently does nothing on exactly one platform.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GluestackUIProvider mode="light">
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </ThemeProvider>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}
