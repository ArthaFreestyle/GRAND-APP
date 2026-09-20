import Feather from '@expo/vector-icons/Feather';
import { VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_ITEMS } from '@/components/shell/AppShell';
import { RamahColors as C, RamahType as T } from '@/constants/theme-ramah';
import { useActiveRole } from '@/services/permissions';

/**
 * The back office shell: four tab roots, and the sections that hang off them.
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
 *    each screen present to animate between them, so all five roots fire their
 *    first read on launch rather than on first visit — `pendapatan` and
 *    `riwayat` (issue #25) included, each a real request the moment the app
 *    opens. That is documented behaviour, not a bug to hunt. If one of them
 *    ever gets expensive, the two sanctioned deferrals are `useIsFocused`
 *    (unmounts on blur, losing scroll and form state) or a `useFocusEffect`
 *    "has been activated once" flag.
 * 3. **A route reaches the bar only through a `Trigger`, and `hidden` on a
 *    trigger means unreachable.** Not "hidden but linkable" — the docs are
 *    explicit that a hidden tab "cannot be navigated to in any way". That is
 *    why `penerimaan-susulan`, `produk` and `pembelian` all live on the root
 *    stack in `app/_layout.tsx` rather than in this directory, and why
 *    `penjualan` (issue #25's Riwayat detail) joined them there rather than
 *    becoming a sixth tab. Do not move any of them back — `pembelian` was a
 *    tab here once and moving it out is what fixed its docked button sitting
 *    under the bar (issue #24).
 *
 * ### The till is not in here
 *
 * Kasir used to be the middle tab, with `hidden` on `NativeTabs` to take the bar
 * away. On Android portrait that left a ~120dp strip along the bottom edge that
 * received no touches, so the Bayar button was drawn and dead. It lives on the
 * root stack now (`app/kasir.tsx`), full-screen with no bar to hide; Beranda's
 * tile and a cashier's `homeRouteFor` are how it is reached.
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
  // Pendapatan is SUPERADMIN-only chrome — see `TAB_ITEMS`'s own comment.
  const role = useActiveRole();

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
        // green for the selected root, grey for the rest, and a Caption label —
        // in Poppins, which is the one piece of chrome outside a `Text` element
        // that has to be told the family by hand. The unselected *label* takes
        // `textMuted` rather than the icons' lighter grey: an icon is exempt from
        // WCAG 2.0's text ratio, the word under it is not.
        backgroundColor={C.white}
        tintColor={C.brandInk}
        iconColor={C.iconMuted}
        labelStyle={{
          default: {
            fontSize: T.caption.fontSize,
            fontFamily: T.caption.fontFamily,
            fontWeight: T.caption.fontWeight,
            color: C.textMuted,
          },
          selected: {
            fontSize: T.caption.fontSize,
            fontFamily: T.caption.fontFamily,
            fontWeight: T.caption.fontWeight,
            color: C.brandInk,
          },
        }}
        // iOS 26: let the bar shrink out of the way while a long list is being
        // read, and come back on the way up. Beranda is the root this matters
        // on — its own scroll runs from the identity block down through the
        // invoice preview at the foot of the screen.
        minimizeBehavior="onScrollDown">
        {TAB_ITEMS.map((t) => (
          <NativeTabs.Trigger
            key={t.key}
            name={t.key}
            // `hidden` means unreachable, not merely unlisted — which is what
            // this wants: a superadmin is the only grant this report is for,
            // so every other role gets no door to `/pendapatan` at all.
            hidden={t.key === 'pendapatan' && role !== 'SUPERADMIN'}>
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
