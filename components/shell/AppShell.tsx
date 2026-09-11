/**
 * The header every *unported* admin screen puts above its own body.
 *
 * This file used to hold the navigation drawer's panel as well
 * (`AdminDrawerContent`). The drawer is gone: `app/(admin)/_layout.tsx` is a
 * three-root native tab navigator now (`expo-router/unstable-native-tabs`),
 * which renders the real platform bar. What is left here is the old blue-and-gold header — still rendered
 * by `pembelian`, `penerimaan-susulan`, and the two `produk` depth routes,
 * because those screens have not been ported to the Ramah system yet. When they
 * are, they take `RamahHeader` and this file goes with the last of them.
 *
 * **The leading slot only ever holds a back control now.** It used to hold a
 * hamburger at a section root; there is no drawer to open, and a tab root has
 * nothing to go back to — the board is explicit that the three roots have no
 * back button. So a pushed screen passes its own `goBack` and gets a chevron; a
 * root passes nothing and the slot stays empty.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoleChip } from '@/components/shell/role-switcher';
import { Box } from '@/components/ui/box';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';

/**
 * The three tab roots, in the order the bar shows them.
 *
 * `key` is both the route name the tab navigator knows the root by and its path
 * segment — `app/(admin)/_layout.tsx` maps this same array into
 * `<NativeTabs.Trigger>` children, so a directory added under `(admin)` cannot
 * silently grow a fourth tab. With native tabs a route reaches the bar *only*
 * through a trigger, so this array is not a convenience: it is the registry.
 *
 * Katalog's segment is `produk`, not `katalog`. The label is what the board
 * calls it; the segment is what every `router.push('/produk/[id]')` in the app
 * already says, and `homeRouteFor` with it. Renaming the folder would be churn
 * with no reader-visible effect.
 *
 * `penerimaan-susulan` is deliberately absent, and it does not live under
 * `(admin)` at all any more. Native tabs treat a `hidden` trigger as
 * unreachable rather than merely unlisted, so the only way to keep
 * `/penerimaan-susulan/baru?idPembelian=` linkable was to move the section onto
 * the root stack beside the tabs — which is also where it belonged, since a
 * susulan is always started from the invoice that recorded the shortfall.
 */
export const TAB_ITEMS = [
  { key: 'beranda', label: 'Beranda', icon: 'home', sf: 'house' },
  /*
    The middle root is the **till**, not the catalogue.

    Three tabs is what the board draws, and which three is a judgement about
    what somebody opens this app to do. Katalog answers "how much of this is
    left" — a question you arrive at from Beranda, which already carries a
    Katalog tile and a reorder count that links into it. The till is a *place
    you stand*, for a whole shift, and a cashier's `homeRouteFor` is this
    screen. So Katalog moved to the root stack (`app/produk/`) and this took its
    slot.

    `ownsBottomInset` is what makes that work: the POS is drawn full-screen with
    the bar hidden (see `app/(admin)/_layout.tsx`), so the bottom edge is its
    own to pad and Android's automatic tab-bar inset would be padding for a bar
    that is not there.
  */
  { key: 'kasir', label: 'Kasir', icon: 'shopping-cart', sf: 'cart', ownsBottomInset: true },
  { key: 'pembelian', label: 'Nota', icon: 'file-text', sf: 'doc.text' },
] as const satisfies readonly {
  key: string;
  /** Feather, via `VectorIcon` — the same family the rest of the app draws in. Used on Android. */
  icon: 'home' | 'shopping-cart' | 'file-text';
  /** SF Symbol, used on iOS where the platform has its own vocabulary for these. */
  sf: 'house' | 'cart' | 'doc.text';
  label: string;
  /**
   * This root pads its own bottom edge, so the navigator must not.
   *
   * Android wraps every tab screen in a `SafeAreaView` applying the bottom
   * inset *for the tab bar*; `disableAutomaticContentInsets` on the trigger is
   * what switches that off for a root that hides the bar and reaches the edge
   * itself.
   */
  ownsBottomInset?: true;
}[];

export type TabKey = (typeof TAB_ITEMS)[number]['key'];


/**
 * The header bar, and — on a pushed screen — the way back out of it.
 *
 * The leading slot holds a back chevron once a record or a form is pushed, and
 * nothing at all at a tab root. The title and the way back belong to the same
 * thing — the screen you are on — which is why the control sits in the bar and
 * not in the body: under a bar still showing the *section* name, a back button
 * in the body gave every detail two titles and an affordance that scrolled away
 * from the bar it belonged to.
 *
 * So a depth screen passes its own `title` — the record, not the section — and
 * the `goBack` it already had. A root passes neither.
 */
export function AppShell({
  title,
  onBack,
  headerRight,
  children,
}: {
  title: string;
  /**
   * Shown as the header's back control while this screen is pushed over its
   * section root. It should be the screen's own `goBack` — `dismiss()` to the
   * section Stack, falling back to a `replace` for a cold deep link — so the
   * bar and the Android back button do the same thing.
   */
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  /**
   * Which control the leading slot holds, decided by the screen itself.
   *
   * This used to be read off the navigator — `useNavigationState((s) => s.type
   * === 'stack' && s.index > 0)` — which was correct and *late*. A native-stack
   * pop is committed to the JS navigation state only when the transition ends,
   * so for the length of the animation the list underneath still believed it was
   * at depth: you watched the record slide away over a header still drawing a
   * back control, which then vanished a beat after the screen had settled.
   * Nothing was loading; the header was answering a question about a screen
   * that was already gone.
   *
   * `onBack` is the same fact as a prop, known at the first render of every
   * screen, so the bar is right on the frame it is drawn. Every pushed screen
   * passes it (that is how it gets a back control at all), and no section root
   * has anything to go back to — so "has an `onBack`" and "is at depth" are the
   * same set, without a subscription.
   *
   * The tab bar stays visible under a pushed screen for the same reason it does
   * in every tabbed app: the roots are always one reach away. What changes at
   * depth is only this slot.
   */
  const inDepth = onBack !== undefined;

  return (
    <>
      <Box className="h-16 flex-row items-center gap-3.5 border-b border-line-card bg-card px-[18px]">
        {inDepth ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            // No border and a wide touch target: a back control is pressed
            // constantly and reads as part of the title, not as a button parked
            // next to it.
            className="-ml-2.5 h-11 w-11 items-center justify-center rounded-full data-[active=true]:bg-line-lighter">
            <View style={styles.chevron} />
          </Pressable>
        ) : null}
        <Text
          numberOfLines={1}
          className="shrink text-[18.5px] font-semibold tracking-tight text-foreground">
          {title}
        </Text>
        <Box className="flex-1" />
        {/* Tab roots only. A pushed screen is one record on a phone-width
            bar that already carries a back control, a title long enough to
            truncate, and the record's own actions; the grant is not what anyone
            is there to read, and it is still one reach away on Beranda, whose
            konteks pill also names the unit kerja the chip never had room for. */}
        {!inDepth && <RoleChip />}
        {/* The screen's own actions, tight together and flush to the edge: the
            header's 14pt gap is right between the title and the chip, and far
            too much between two 40pt icon buttons that belong to each other. */}
        {headerRight && (
          <Box className="-mr-1.5 flex-row items-center gap-0.5">{headerRight}</Box>
        )}
      </Box>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  /**
   * The back chevron: a square with two of its four borders, turned 45°. Drawn
   * rather than typed because the glyphs that look like a chevron (‹, ❮, ⟨) are
   * a different weight and a different height in every font the platforms pick,
   * and this one has to line up with the title beside it.
   */
  chevron: {
    width: 11,
    height: 11,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#2E4557',
    transform: [{ rotate: '45deg' }],
    // The rotated square's visual centre sits right of its layout box.
    marginLeft: 3,
  },
});
