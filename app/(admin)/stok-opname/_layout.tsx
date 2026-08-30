import { Stack } from 'expo-router';

/**
 * Depth inside the section: `[id]` and `baru` pushed over `index`.
 *
 * The section itself is one screen of the admin drawer, and this Stack is what
 * keeps the drawer from flattening it: the list stays mounted under a pushed
 * detail (scroll position and appended pages intact), the back button pops back
 * to it, and every record keeps a URL that can be deep linked.
 *
 * The three routes are declared rather than left to the file tree so each one
 * carries its own options. `title` is not drawn anywhere — every screen renders
 * `AppShell` under `headerShown: false` — but it is what names the route to the
 * web document title and to accessibility, which otherwise get the file name.
 *
 * Only the depth routes animate. `index` is the drawer's screen for this
 * section, so it arrives by whatever the drawer does; sliding it in as well
 * would animate the same move twice.
 *
 * The anchor is what a cold deep link needs: opened straight at `/stok-opname/12`,
 * the stack is built with the list underneath, so dismissing the detail lands
 * on it instead of leaving the app.
 */
export const unstable_settings = { anchor: 'index' };

export default function StokOpnameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Stok Opname', animation: 'none' }} />
      <Stack.Screen
        name="[id]"
        options={{ title: 'Detail Opname', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="baru"
        options={{ title: 'Opname Baru', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
