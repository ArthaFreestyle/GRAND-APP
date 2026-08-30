import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Drawer } from 'expo-router/drawer';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminDrawerContent, NAV_ITEMS } from '@/components/shell/AppShell';
import { Colors } from '@/constants/theme-erp';

/**
 * The back-office shell: one drawer navigator, one screen per section.
 *
 * The sidebar used to be a `navShown` boolean and two absolutely positioned
 * views — no swipe to open, no animation, no back-button handling, and a menu
 * that had to reason about `usePathname()` to know where it was. This is
 * `expo-router/drawer` (React Navigation's drawer) instead, so all of that is
 * the navigator's job; `AdminDrawerContent` only draws what goes in the panel.
 *
 * Each section is a *directory* with its own `_layout.tsx` Stack, which is what
 * keeps a drawer from flattening the depth: a detail or a form is still pushed
 * over the list inside its section, the list stays mounted underneath it with
 * its scroll and appended pages, and the Android back button pops it. What the
 * drawer adds on top is that leaving a section and coming back restores the
 * screen it was left on, because that section's stack was never torn down.
 *
 * Nothing is guarded here any more. `app/_layout.tsx` puts this whole group
 * behind a `Stack.Protected` on the session having an **active context**, so a
 * screen in here cannot mount without one — deep links and nested routes
 * included — and the moment the session loses it the navigator unmounts the
 * group rather than each screen redirecting from an effect after it has already
 * fetched once.
 */
export default function AdminLayout() {
  // Every screen here runs with `headerShown: false`, so nothing is holding the
  // content off the status bar / notch / gesture bar. Padding *outside* the
  // navigator (rather than in each screen) also covers the panel and its
  // overlay: they are drawn inside this box, so the drawer starts below the
  // status bar and stops above the gesture bar, exactly as the content does.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}>
      <Drawer
        drawerContent={AdminDrawerContent}
        screenOptions={({ route }) => ({
          // The screens draw their own header (`AppShell`), which carries the
          // hamburger and the per-screen actions the stock one cannot.
          headerShown: false,
          // An overlay drawer over the current screen, not a fixed rail: a phone
          // in portrait has ~354pt to spare and cannot give 236 of them away.
          drawerType: 'front',
          drawerStyle: {
            width: 236,
            backgroundColor: Colors.card,
            borderRightWidth: 1,
            borderRightColor: Colors.borderCard,
          },
          // The old hand-rolled backdrop, `bg-toast/25`, kept as a value because
          // this one is read at runtime by the navigator and not by Tailwind.
          overlayColor: 'rgba(14,36,51,0.25)',
          // ---- the drawer stops at the section root ----
          //
          // A section is a place you can leave; a record open on top of it is
          // not. Once `[id]` or `baru` is pushed, swiping from the left edge
          // must not drag the menu out from under the screen the viewer is
          // working in — `AppShell` hides the hamburger on those same screens,
          // so the drawer is genuinely out of reach until the record is closed.
          //
          // The section's own Stack is nested in this route, so its focused
          // route name is readable from here. It is `undefined` until that
          // Stack has a state of its own — a section still on its list, and the
          // two sections that are single files with no Stack at all.
          swipeEnabled: (getFocusedRouteNameFromRoute(route) ?? 'index') === 'index',
        })}>
        {/* One screen per section, from the same array the menu renders, so a
            section added to `NAV_ITEMS` cannot end up listed but unroutable.
            `drawerLabel` is what accessibility reads; the visible list is drawn
            by `AdminDrawerContent`. */}
        {NAV_ITEMS.map((n) => (
          <Drawer.Screen key={n.name} name={n.name} options={{ drawerLabel: n.label, title: n.label }} />
        ))}
      </Drawer>
    </View>
  );
}
