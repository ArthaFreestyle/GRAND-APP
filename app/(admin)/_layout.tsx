import Feather from '@expo/vector-icons/Feather';
import { VectorIcon, useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_ITEMS } from '@/components/shell/AppShell';
import { RamahColors as C, RamahType as T } from '@/constants/theme-ramah';

/**
 * The back office shell: three tab roots, and the sections that hang off them.
 *
 * **Native tabs** (`expo-router/unstable-native-tabs`), which render the real
 * platform tab bar — UIKit's on iOS, Material's on Android — rather than a bar
 * drawn in React Native. An earlier version of this file drew its own from the
 * board's spec; the argument for it was that a native bar "cannot be told to
 * look like" the Ramah bar, and that was simply wrong. `backgroundColor`,
 * `tintColor`, `iconColor` and `labelStyle` cover the whole spec, and
 * `VectorIcon` feeds it the same Feather glyphs the rest of the app draws in.
 *
 * What the platform bar buys that a drawn one cannot: the correct press
 * feedback and haptics, the iOS 26 liquid-glass material and its minimize-on-
 * scroll behaviour, tapping the active tab to pop its stack and then to scroll
 * to top, keyboard avoidance on Android, and the accessibility tree a screen
 * reader already knows how to describe. Every one of those is work that a drawn
 * bar either re-implements badly or does without.
 *
 * ### Three things to know before changing this file
 *
 * 1. **It is still alpha.** Expo's own docs say so — "Native tabs is in alpha …
 *    Its API is subject to change" — and the import path still carries
 *    `unstable-`. Treat an SDK bump as a reason to re-read this file, not as a
 *    routine upgrade.
 * 2. **Every tab mounts eagerly and cannot be made lazy.** The native bar needs
 *    each screen present to animate between them, so all three roots fire their
 *    first read on launch rather than on first visit. That is documented
 *    behaviour, not a bug to hunt. If one of them ever gets expensive, the two
 *    sanctioned deferrals are `useIsFocused` (unmounts on blur, losing scroll
 *    and form state) or a `useFocusEffect` "has been activated once" flag.
 * 3. **A route reaches the bar only through a `Trigger`, and `hidden` on a
 *    trigger means unreachable.** Not "hidden but linkable" — the docs are
 *    explicit that a hidden tab "cannot be navigated to in any way". That is
 *    why `penerimaan-susulan` and `produk` both live on the root stack in
 *    `app/_layout.tsx` rather than in this directory. Do not move them back.
 *
 * ### The till hides the bar
 *
 * `hidden` on `NativeTabs` — the container, not a trigger — is a different
 * thing entirely: it hides the *bar*, leaving every tab reachable. That is what
 * makes Kasir a tab you can enter without the POS having to live with a tab bar
 * across the bottom of a screen whose bottom row is a 96pt pay button and a
 * keypad. Tapping Kasir takes the whole screen; the way back out is the
 * `more-vertical` menu the POS carries for exactly this reason.
 *
 * It is computed from the segments rather than from a tab-change callback,
 * because a deep link to `/kasir` and a cold start on a cashier's
 * `homeRouteFor` both have to arrive with the bar already gone — a callback
 * only fires when somebody presses something.
 *
 * Each tab is a *directory* with its own `_layout.tsx` Stack, which is what
 * keeps the bar from flattening the depth: a detail is pushed over its list
 * inside the tab, the list stays mounted underneath with its scroll and its
 * appended pages, and back pops it. Switching tabs and returning restores the
 * screen the tab was left on.
 *
 * Nothing is guarded here. `app/_layout.tsx` puts this whole group behind a
 * `Stack.Protected` on the session having a chosen active context, so a screen
 * in here cannot mount without one — deep links included — and the moment the
 * session loses it the navigator unmounts the group rather than each screen
 * redirecting from an effect after it has already fetched once.
 */
export default function AdminLayout() {
  /**
   * Three edges, not four — and for a different reason than before.
   *
   * Native tabs handle the **bottom** inset themselves: on Android the screen
   * content is wrapped in a `SafeAreaView` that applies it for the tab bar, and
   * on iOS the first `ScrollView` in a tab gets automatic content-inset
   * adjustment so content scrolls correctly behind the bar. Top, left and right
   * are still nobody's job but this one's, because every screen in here runs
   * `headerShown: false` and Android is edge-to-edge.
   *
   * A screen in here must therefore add neither: no `insets.top`, and no bottom
   * padding for the bar. Doing it again is invisible on a device with no notch
   * and obvious on every device with one.
   */
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const onKasir = segments.includes('kasir' as never);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.surfaceSunken,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}>
      <NativeTabs
        // The Ramah bar, expressed as the platform's own: white ground, brand
        // green for the selected root, muted grey for the rest, and the guide's
        // 11px semibold label — in Poppins, which is the one piece of chrome
        // outside a `Text` element that has to be told the family by hand.
        backgroundColor={C.white}
        tintColor={C.brandInk}
        iconColor={C.iconMuted}
        labelStyle={{
          fontSize: T.micro.fontSize,
          fontFamily: T.micro.fontFamily,
          fontWeight: T.micro.fontWeight,
        }}
        // iOS 26: let the bar shrink out of the way while a long list is being
        // read, and come back on the way up. Nota is the root this matters on
        // now that the catalogue is a pushed route — thirty invoices scanned
        // looking for the one that came up short.
        minimizeBehavior="onScrollDown"
        // The POS is full-screen. See the note above the component.
        hidden={onKasir}>
        {TAB_ITEMS.map((t) => (
          <NativeTabs.Trigger
            key={t.key}
            name={t.key}
            // The flag's *presence* is the answer — `TAB_ITEMS` is `as const`,
            // so a root that does not pad its own bottom edge does not carry
            // the key at all.
            disableAutomaticContentInsets={'ownsBottomInset' in t}>
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
            {/*
              `sf` is used on iOS and `src` on Android, so each platform gets the
              glyph it expects: an SF Symbol where the OS has one, and the same
              Feather line icon the rest of this app draws everywhere else.
              `VectorIcon` is what bridges an `@expo/vector-icons` family into a
              native tab item.
            */}
            <NativeTabs.Trigger.Icon
              sf={t.sf}
              src={<VectorIcon family={Feather} name={t.icon} />}
            />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    </View>
  );
}
