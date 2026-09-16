/**
 * The Ramah design system's chrome, as React Native components.
 *
 * `constants/theme-ramah.ts` holds the system's *values*; this file holds the
 * handful of shapes those values are always assembled into — the screen header,
 * the search field, a filter chip, a group heading, the one green pill, and the
 * bottom sheet. It is the Ramah counterpart of `components/shell/ui.tsx`, and
 * the two do not meet: `ui.tsx` is gluestack plus the old blue-and-gold
 * `theme-erp`, and every screen that still renders it is a screen the rebuild
 * has not reached yet.
 *
 * **Why a shared file rather than a `const` block per screen.** The two screens
 * ported before `constants/theme-ramah.ts` existed (`app/index.tsx`,
 * `app/pilih-peran.tsx`) each carry a local copy of the palette, which was fine
 * at two and stopped being fine at three. The same argument applies one level
 * up: a 48pt search field outlined in 1.5px `borderStrong` is not a value, it
 * is a *composition* of six of them, and re-deriving that composition on
 * Katalog, on Beranda and on Nota is how three screens end up with three
 * slightly different search fields that nobody can tell apart on purpose.
 *
 * **Press feedback is held in state, never read from `Pressable`'s
 * `style={({ pressed }) => …}` callback.** `babel.config.js` sets
 * `jsxImportSource: 'nativewind'`, so every `Pressable` in this app is the
 * cssInterop wrapper; it normalises a non-array `style` by wrapping it in an
 * array, and React Native only invokes `style` when it is a function *itself*,
 * never one nested inside an array. The callback is swallowed by
 * `StyleSheet.flatten` and the element renders with no styles at all. Three
 * screens have already tripped over this, which is why every pressable here
 * uses `onPressIn`/`onPressOut`.
 */
import Feather from '@expo/vector-icons/Feather';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahMotion,
  RamahRadius as R,
  RamahTileTone,
  RamahType as T,
  type RamahTypeName,
  scoreTone,
  type RamahTileToneName,
} from '@/constants/theme-ramah';

export type FeatherName = keyof typeof Feather.glyphMap;

/**
 * The screen header: one leading control, a title, and whatever chrome the
 * screen keeps permanently on the right.
 *
 * **The leading slot holds a back arrow, or nothing at all.** Which of the two
 * says where you are, and it is the rule `Papan Layar.dc.html` states at the foot
 * of the map: the three tab roots have no back button, and every other screen is
 * a stack — back arrow, no tab bar. The title and the way back belong to the
 * same screen, which is why the control sits in the bar and not in the body.
 *
 * It used to take an `onMenu` for a hamburger at a section root. There is
 * nothing left for that to open — the drawer is gone, and a tab root has nothing
 * to go back to either — so the prop went with it rather than being left as a
 * slot nobody fills. CLAUDE.md lists the drawer among the two dead lineages, and
 * a hamburger sitting in this component's type signature is an invitation to
 * revive one.
 *
 * `right` is whatever the screen keeps permanently on the far side. On a *pushed*
 * screen that is its own standing actions and **not** the role chip: a
 * phone-width bar already carrying a back control, a title long enough to
 * truncate and two icon buttons has no room for a grant nobody came here to
 * read, and Beranda's konteks pill names it along with the unit kerja a chip
 * never had room for.
 */
export function RamahHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <RamahIconButton icon="arrow-left" label="Kembali" onPress={onBack} inset />
      ) : null}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.grow} />
      {right}
    </View>
  );
}

/**
 * A round icon target, in the four looks `IconButton.jsx` defines.
 *
 * `plain` is the default and the only one the back-office screens use: no fill,
 * no border, the glyph alone. The other three exist because the till needs them
 * — `outline` for a control that has to be findable on a white column,
 * `tint` for the one that adds rather than removes, and `solid` for a mode that
 * is currently *on*, where a border cannot say so loudly enough across a
 * counter.
 *
 * `inset` pulls it back into the gutter so the glyph — not the invisible box
 * around it — lines up with the content below.
 *
 * The design system sizes its glyph off the button (20 at 40pt and up, 18
 * below); this keeps that rule so a 36pt button in a dense POS row does not
 * carry a header-sized icon.
 */
export type RamahIconButtonVariant = 'plain' | 'outline' | 'tint' | 'solid' | 'dark';

export function RamahIconButton({
  icon,
  label,
  onPress,
  inset = false,
  variant = 'plain',
  size = L.tapMin,
  disabled = false,
  color,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  inset?: boolean;
  variant?: RamahIconButtonVariant;
  size?: number;
  disabled?: boolean;
  /** Overrides the variant's glyph colour. `plain` only, in practice. */
  color?: string;
}) {
  const [down, setDown] = useState(false);
  const look = ICON_BUTTON_LOOK[variant];
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          backgroundColor: look.fill,
          borderWidth: look.border ? 1.5 : 0,
          borderColor: look.border,
        },
        inset && styles.iconButtonInset,
        disabled && { opacity: 0.4 },
        down && !disabled && { opacity: RamahMotion.pressDim, transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      <Feather
        name={icon}
        size={size >= 40 ? RamahIcon.row : 18}
        color={color ?? look.ink}
      />
    </Pressable>
  );
}

const ICON_BUTTON_LOOK: Record<
  RamahIconButtonVariant,
  { fill: string; ink: string; border?: string }
> = {
  plain: { fill: 'transparent', ink: C.iconDefault },
  outline: { fill: C.white, ink: C.iconDefault, border: C.borderHairline },
  tint: { fill: C.brandTint, ink: C.brandInk },
  solid: { fill: C.brand, ink: C.textOnBrand },
  dark: { fill: C.surfaceInverse, ink: C.textOnInverse },
};

/**
 * The search field, drawn as the board draws it: 48pt tall, white, outlined in
 * 1.5px `borderStrong`, with the magnifier inside rather than beside it.
 *
 * Outlined and not filled, unlike the login screen's fields — those sit on a
 * white page and need the fill to be visible at all, while this one sits on the
 * grey merchant canvas, where an outline reads as a control and a grey fill
 * would dissolve into the page.
 */
export function RamahSearchField({
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.search,
        focused && { borderColor: C.borderFocus },
        !editable && { backgroundColor: C.surfaceField },
      ]}>
      <Feather name="search" size={RamahIcon.row} color={C.iconMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value.length > 0 && editable ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Hapus pencarian"
          hitSlop={10}>
          <Feather name="x" size={RamahIcon.row} color={C.iconMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A 36pt pill. `selected` wears the brand tint; everything else is white on a
 * hairline.
 *
 * 36 and not 32: `LayarKasir.dc.html` asks several of its chips for `size="sm"`,
 * but `Chip.jsx` has no size prop at all and renders every chip at
 * `--control-h-sm`. The drawing is aspirational, the component is the contract,
 * and 36 is also the smaller of the two numbers this system will let a finger
 * aim at.
 */
export function RamahChip({
  label,
  selected = false,
  iconLeft,
  iconRight,
  disabled = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  iconLeft?: FeatherName;
  iconRight?: FeatherName;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const [down, setDown] = useState(false);
  const ink = selected ? C.brandInk : C.textTitle;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? C.brandTintSoft : C.white,
          borderColor: selected ? C.borderBrand : C.borderHairline,
        },
        disabled && { opacity: 0.4 },
        down && { transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      {iconLeft ? <Feather name={iconLeft} size={RamahIcon.meta} color={ink} /> : null}
      <Text style={[styles.chipLabel, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {iconRight ? <Feather name={iconRight} size={RamahIcon.meta} color={ink} /> : null}
    </Pressable>
  );
}

/**
 * The small grey heading above a group of rows. `T.bodySmall` weight semibold,
 * muted — the group's *name*, not a title competing with the rows under it.
 *
 * `action` is the design system's own second slot (`SectionHeader.jsx` takes
 * `action` / `onAction`): one link-coloured word on the far right, baseline
 * aligned with the heading, which opens the full list the group is a preview
 * of. It is a *word*, not an icon, because unlike the standing edit/archive
 * pair on a detail it says something specific to this one group — "Semua" under
 * three of thirty invoices means something a chevron does not.
 */
export function RamahSectionHeader({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{children}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sectionHeaderAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The one solid green pill a screen is allowed. Exactly one — the guide is
 * blunt about it, and the reason is that two primary actions are none.
 */
export function RamahPrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  height = L.controlH,
  type = 'titleTiny',
}: {
  label: string;
  icon?: FeatherName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /**
   * 52 everywhere except the till, where `LayarKasir.dc.html` draws the pay
   * button at 96 with a larger label. A cashier hits that button with a queue
   * waiting and without looking down at it, which is the one place in this app
   * where a control earns more than its standard height.
   */
  height?: number;
  /**
   * The label's step on the type scale. Title Tiny everywhere except that same
   * pay button. A bundle name rather than a raw size, so a label can only ever
   * be a size the scale has — and carries the line height that goes with it.
   */
  type?: RamahTypeName;
}) {
  const [down, setDown] = useState(false);
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={label}
      style={[
        styles.primary,
        { backgroundColor: down ? C.brandPress : C.brand, height },
        off && styles.primaryOff,
        down && { transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      {busy ? (
        <ActivityIndicator color={C.textOnBrand} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={RamahIcon.row} color={C.textOnBrand} /> : null}
          <Text style={[styles.primaryLabel, T[type]]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * The outlined counterpart of the green pill: brand ink on a 1.5px brand
 * border, nothing filled.
 *
 * It exists so a card can carry a second action without breaking the one-solid-
 * green-pill-per-screen rule — the guide's own `Button variant="secondary"`,
 * and the reason the "Lihat semua" control on the feature card does not read as
 * a second primary action. `sm` is the only size drawn on an operational
 * screen: 36pt tall, 16pt of side padding, 14px label.
 */
export function RamahSecondaryButton({
  label,
  icon,
  onPress,
  fullWidth = false,
  height = L.controlHSm,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  icon?: FeatherName;
  onPress: () => void;
  /**
   * Docked at the foot of a screen rather than sitting inside a card.
   *
   * The board uses this shape on the product detail: a full-width outlined pill
   * at `controlH`, carrying the screen's only action. It is outlined and not
   * solid because a detail is a *reading* screen — the guide allows one solid
   * green pill per screen and spends it where something is created or posted,
   * not where a record is opened for correction.
   */
  fullWidth?: boolean;
  height?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.secondary,
        { height },
        fullWidth && { alignSelf: 'stretch' },
        disabled && { opacity: 0.4 },
        down && !disabled && { backgroundColor: C.brandTint },
      ]}>
      {icon ? <Feather name={icon} size={RamahIcon.row} color={C.brandInk} /> : null}
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The third button in the system: an outlined grey escape hatch.
 *
 * `Button variant="tertiary"` — `borderStrong`, title-coloured label, no fill
 * until pressed. It is what a "go back one step" control looks like next to a
 * primary pill, and the reason the till's "Kembali ke keranjang" does not have
 * to borrow the brand colour to be visible.
 */
export function RamahTertiaryButton({
  label,
  onPress,
  height = L.controlH,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  height?: number;
  accessibilityLabel?: string;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.tertiary, { height }, down && { backgroundColor: C.grey100 }]}>
      <Text style={styles.tertiaryLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * A bottom sheet — the platform's own, through
 * `@expo/ui/community/bottom-sheet`.
 *
 * That package is `@expo/ui`'s API-compatible replacement for
 * `@gorhom/bottom-sheet`, and "API-compatible" is where the resemblance ends:
 * underneath it is Jetpack Compose's `ModalBottomSheet` on Android and SwiftUI's
 * sheet on iOS. The presentation, the drag, the detents, the scrim, the back
 * button and the keyboard are the operating system's.
 *
 * ## Why not a route
 *
 * `presentation: 'formSheet'` is the real platform sheet as a **route**, which
 * is the wrong shape for almost everything this app opens in one: which gudang,
 * which faktur, confirm this posting. Those are questions about the screen
 * underneath, not places — they have nothing to link to, and dismissing one must
 * land exactly where it was opened. Expo documents that split and CLAUDE.md
 * records it. The costs are documented too: Android caps at 3 detents, a
 * formSheet there cannot render a native header or a nested stack, a docked
 * footer is `unstable_sheetFooter` and Android-only experimental, and every one
 * needs its stack's anchor or a cold deep link leaves nothing behind it.
 *
 * ## Two rewrites, and what each one cost
 *
 * This is the third implementation. The history is short and worth keeping,
 * because each version failed in a way the next one has to not repeat.
 *
 * **First: a hand-drawn sheet on React Native's `Modal`.** `animationType`
 * animates the modal's whole container, and on a transparent modal that
 * container holds the scrim — so the dim slid up from the bottom along with the
 * card, which reads as a shadow rising rather than a layer over the app.
 * Driving the two separately with `Animated` fixed that and still left out
 * detents, the rubber-band, and a drag that hands off to the list inside it. A
 * sheet you cannot half-open is a dialog with round corners.
 *
 * **Second: `@gorhom/bottom-sheet`.** It brought all of that, and then every
 * sheet in the app was silently dead — pressing anything that opened one did
 * nothing, on every screen, with no error. The cause is a single point of
 * failure that is invisible from the call site: a sheet cannot open until
 * `useAnimatedDetents` can say where its detents are, and that hook returns an
 * **empty detent set** if the container height, the handle height, or (under
 * `enableDynamicSizing`) the content height has not been measured. The container
 * height is the fatal one — `BottomSheet` renders its own hosting container with
 * `shouldCalculateHeight={!$modal}`, so a *modal* sheet measures nothing and
 * reads instead from the one container `BottomSheetModalProvider` renders at the
 * root of the app. One measurement, shared by every `BottomSheetModal` there is;
 * when it does not arrive they all die together.
 *
 * **Then, briefly, a plain `BottomSheet` inside an RN `Modal`** to escape that
 * shared measurement. It escaped it, and introduced something worse: the window
 * came up on `visible` and only came down when the sheet reported reaching index
 * -1. Miss that one callback and a full-screen transparent window stays over the
 * app forever — every control still drawn, none of them reachable. The app went
 * dead after the first sheet was dismissed.
 *
 * The lesson both of those share is the reason for this version: **a sheet
 * should not depend on JavaScript having measured or reported anything.** The
 * native sheet has no measurement chain to stall, and its host carries
 * `pointerEvents="none"` while it is closed, so there is no state in which it
 * can be up and swallowing touches. There is no provider, no portal, and no
 * `GestureHandlerRootView` of its own.
 *
 * ## What changed at the call sites: nothing, and one thing on screen
 *
 * The `visible` / `onClose` / `title` API is unchanged, so none of the fifteen
 * call sites moved. `present()` and `dismiss()` are bridged from `visible` in an
 * effect, and `onDismiss` reports a swipe or a scrim tap back — but **only while
 * `visible` is still true**, which is what tells a user's dismissal from the
 * parent having already closed it.
 *
 * The one visible change is the **title, which is now in the body**. It used to
 * live in `handleComponent`, which bought a title that did not scroll away and a
 * drag zone exactly the width of the grabber. Neither is ours to give any more:
 * the platform draws the drag indicator, and this implementation documents that
 * a custom handle component is simply not rendered on native. Drawing a grabber
 * of our own underneath the system's would be two of them.
 *
 * The keyboard is the platform's too. `hooks/use-keyboard-height.ts` is still
 * what the screens' *docked* buttons use, which are outside any sheet.
 */
export function RamahSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<BottomSheetMethods>(null);

  /**
   * Whether the parent still wants this open, readable from a callback.
   *
   * Written in an effect rather than during render — `react-hooks/refs` forbids
   * touching a ref in the render phase, and this is only read from `onDismiss`,
   * which fires long after.
   */
  const wantsOpen = useRef(visible);
  useEffect(() => {
    wantsOpen.current = visible;
  }, [visible]);

  useEffect(() => {
    if (visible) ref.current?.present();
    else ref.current?.dismiss();
  }, [visible]);

  /**
   * The cap, in points, on how tall the sheet's own scroll may grow.
   *
   * The sheet sizes itself to its content natively, so this is not what decides
   * the height — it is only what stops a ten-option list from asking for the
   * whole screen. `useWindowDimensions` rather than `Dimensions.get`: window
   * height is a runtime value like an inset, and a rotation does not itself
   * cause the render a one-shot read would be sampled in.
   */
  const window = useWindowDimensions();

  return (
    <BottomSheetModal
      ref={ref}
      enablePanDownToClose
      onDismiss={() => {
        // Only a dismissal the parent did not ask for is news to it.
        if (wantsOpen.current) onClose();
      }}
      backgroundStyle={sheetStyles.background}>
      <BottomSheetView style={{ maxHeight: Math.round(window.height * 0.85) }}>
        {/*
          The title is **in the body, not in a handle**. It lived in
          `handleComponent` when this was `@gorhom/bottom-sheet`, which is not an
          option any more and should not be worked around: the drag indicator is
          drawn by the platform now, and this implementation documents that a
          custom handle component is simply not rendered on native. Putting a
          hand-drawn grabber back would be two of them.
        */}
        <Text style={styles.sheetTitle}>{title}</Text>
        {/*
          `flexShrink: 1` with `flexGrow: 0` is the same shape the till's docked
          cart uses: the box above is capped, and this is the part that gives way
          and scrolls. React Native defaults `flexShrink` to 0, so without it a
          long list would keep its full height and run out of the bottom of a
          sheet that had already stopped growing.
        */}
        <ScrollView
          style={sheetStyles.body}
          contentContainerStyle={sheetStyles.bodyPad}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
const sheetStyles = StyleSheet.create({
  body: { flexGrow: 0, flexShrink: 1 },
  bodyPad: { paddingBottom: L.space6 },
  background: {
    backgroundColor: C.surfaceCard,
    borderTopLeftRadius: R.sheet,
    borderTopRightRadius: R.sheet,
  },
  backdrop: { backgroundColor: C.scrim },
});

/**
 * One choice inside a sheet. The check sits on the right rather than a radio on
 * the left: the label is what is being read, and a column of empty circles
 * beside a column of names is a column of noise.
 */
export function RamahSheetOption({
  label,
  sub,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  /**
   * Drawn but not choosable — a room frozen by stok opname, say. Shown rather
   * than filtered out, so `sub` can say why the option someone is looking for
   * cannot be picked.
   */
  disabled?: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={[
        styles.sheetOption,
        down && !disabled && { backgroundColor: C.surfaceStack },
        disabled && styles.tileOff,
      ]}>
      <View style={styles.grow}>
        <Text style={[styles.sheetOptionLabel, selected && { color: C.brandInk }]}>{label}</Text>
        {sub ? <Text style={styles.sheetOptionSub}>{sub}</Text> : null}
      </View>
      {selected ? <Feather name="check" size={RamahIcon.row} color={C.brand} /> : null}
    </Pressable>
  );
}

/**
 * One row of a master table, resolved by search rather than picked from a
 * short fixed list — a product, a supplier, an ekspedisi.
 */
export interface RamahSearchOption {
  value: string;
  label: string;
  /** Second line: a code, a phone number, whatever tells two similar rows apart. */
  sub?: string;
}

/**
 * A search-and-pick sheet over a table the client has never fully loaded.
 *
 * The Ramah counterpart of `components/shell/search-picker.tsx`'s
 * `SearchPicker`, and a sheet rather than an inline expand/collapse for the
 * same reason `TurunanLineEditor`'s satuan picker is one: the field on the form
 * shows the *answer* (`RamahPickerField`), and searching for a different one is
 * a question about the field, raised over the screen rather than inside it.
 *
 * One debounced `search` per keystroke burst, same as the component it
 * replaces — a page of results, nothing cached, the empty term run on open so
 * a short master table (ekspedisi, a handful of rooms) is fully visible before
 * anybody types.
 */
export function RamahSearchSheet({
  visible,
  title,
  onClose,
  search,
  onPick,
  placeholder,
  emptyHint,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /**
   * Runs the query. **Must be memoized** (`useCallback`) — it is an effect
   * dependency, so a fresh closure every render would re-query on every render.
   */
  search: (term: string) => Promise<RamahSearchOption[]>;
  onPick: (option: RamahSearchOption) => void;
  placeholder: string;
  /** Shown in place of the results when the query came back empty. */
  emptyHint: string;
}) {
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<RamahSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  /**
   * Bumped by every query, so a slow answer to an older term cannot paint over
   * a newer one. The debounce alone does not cover this: two queries can be in
   * flight whenever the second is typed before the first returns.
   */
  const generation = useRef(0);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const mine = ++generation.current;
      setLoading(true);
      search(term.trim())
        .then((result) => {
          if (cancelled || generation.current !== mine) return;
          setOptions(result);
          setErr('');
        })
        .catch(() => {
          if (cancelled || generation.current !== mine) return;
          setOptions([]);
          setErr('Gagal memuat pilihan.');
        })
        .finally(() => {
          if (!cancelled && generation.current === mine) setLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, term, search]);

  // A closed sheet reopening on the previous query would show stale results
  // for a beat before the empty-term search above lands. Cleared at the one
  // place this component actually closes rather than reacted to afterwards in
  // an effect — every path to `visible: false` in this codebase's usage runs
  // through `onClose`, so there is no separate "the prop just changed" case to
  // catch.
  const close = () => {
    setTerm('');
    onClose();
  };

  const pick = (option: RamahSearchOption) => {
    onPick(option);
    close();
  };

  return (
    <RamahSheet visible={visible} title={title} onClose={close}>
      <View style={searchSheetStyles.wrap}>
        <RamahSearchField value={term} onChangeText={setTerm} placeholder={placeholder} />
        {loading && options.length === 0 ? (
          <View style={searchSheetStyles.center}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : err !== '' ? (
          <RamahInlineError message={err} />
        ) : options.length === 0 ? (
          <Text style={searchSheetStyles.empty}>{emptyHint}</Text>
        ) : (
          options.map((o) => (
            <RamahSheetOption
              key={o.value}
              label={o.label}
              sub={o.sub}
              selected={false}
              onPress={() => pick(o)}
            />
          ))
        )}
      </View>
    </RamahSheet>
  );
}

const searchSheetStyles = StyleSheet.create({
  wrap: { paddingHorizontal: L.gutter, gap: L.space3 },
  center: { paddingVertical: L.space6, alignItems: 'center' },
  empty: { ...T.bodySmall, color: C.textBody, paddingVertical: L.space3 },
});

/**
 * One shortcut tile in the feature grid (guide §4, §7, §8).
 *
 * **The art is a real 3D render**, from the packs §8 names: IconScout, Iqonic
 * Design, *Ulta Bizz* (with *Bizzy Vol.2* as the analytics fallback). The PNGs
 * live in `assets/icons-3d/`, pulled at 500px with a transparent background —
 * the guide asks for `png` explicitly because the default download format for a
 * 3D asset is `compressed-glb`, and for 500px on the grid, 1000px only on a
 * denser screen. One contributor means one render language: same camera angle,
 * same bevel weight, same light direction, so two of them sit in one grid
 * without looking borrowed.
 *
 * A concept the packs do not cover falls back to a line glyph on a tint — see
 * `RamahTileArt`, which is where the rule is written down.
 *
 * `badge` is the guide's count pill overlapping the top-left corner: one per
 * tile, and **gone at zero** rather than showing "0" — a badge is an
 * interruption, and there is nothing to interrupt anyone about.
 */
/**
 * What a tile draws above its label.
 *
 * Two shapes, and which one a tile gets is not a style choice — it is whether
 * the concept has a render at all. `art3d` is the normal case and, since the
 * beranda grid was completed, the only one in use: all nine features carry an
 * asset now, four of them from a second contributor whose selection is argued
 * out at `ART` in `app/(admin)/beranda.tsx`.
 *
 * `glyph` stays because the situation it answers will come back. It is guide
 * §8's own stopgap for a merchant concept with no render — "Sampai ikonnya
 * dirender dari `.blend`, petaknya memakai ikon garis Lucide di atas tint yang
 * sama" — and the tint is what marks a tile provisional rather than finished.
 * What the guide forbids, and what having no glyphs today does not license, is
 * closing a gap with one lookalike hunted out of an unrelated pack: a render
 * language is a whole pack's worth of camera angle, bevel weight and light
 * direction, so a *family* may be added, never a single orphan.
 */
export type RamahTileArt =
  | { kind: 'art3d'; source: ImageSourcePropType }
  | { kind: 'glyph'; icon: FeatherName; tone: RamahTileToneName };

export function RamahTile({
  label,
  art,
  badge,
  disabled = false,
  onPress,
}: {
  label: string;
  art: RamahTileArt;
  badge?: number;
  /**
   * A feature the app draws but cannot open yet: the render dims to 55% and the
   * label steps down to `textMuted`, exactly as `LayarGudang.dc.html` draws
   * "Stok opname" on the board.
   *
   * Drawn rather than dropped, because the grid is also a map of what this app
   * is going to be — a tile that appears the week its screen lands moves under
   * the eye, and a greyed one that lights up does not.
   * `accessibilityState.disabled` says the same thing to a screen reader, which
   * cannot see 55% opacity.
   */
  disabled?: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const showBadge = !disabled && badge !== undefined && badge > 0;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={
        disabled ? `${label}, belum tersedia` : showBadge ? `${label}, ${badge}` : label
      }
      style={[styles.tile, down && { transform: [{ scale: RamahMotion.pressScale }] }]}>
      {/*
        The art sits in a box of its own size — 52 for a render, 44 for the
        squircle — so the count pill can be hung off *its* top-left corner the
        way the board draws it, rather than off a centre line measured by hand
        for one of the two sizes.
      */}
      <View style={art.kind === 'art3d' ? styles.tileArtBox : styles.tileGlyphBox}>
        {art.kind === 'art3d' ? (
          /*
            52px, bare — no squircle behind it, and no tint.

            The guide contradicts itself here and this follows the newer
            drawing: §8 specs a 28px icon inside a 44px squircle, §4 draws the
            asset alone at 52px because "asetnya sudah punya bentuk sendiri,
            jadi squircle tint hanya menambah kotak", and `LayarGudang.dc.html`
            draws it §4's way. `resizeMode="contain"` and nothing else: the
            guide forbids masking or cropping a 3D asset, and it is never
            recoloured — what adapts to the palette is the tile beside it, not
            the render.
          */
          <Image
            source={art.source}
            style={[styles.tileArt, disabled && styles.tileOff]}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              styles.tileSquircle,
              { backgroundColor: RamahTileTone[art.tone].tint },
              disabled && styles.tileOff,
            ]}>
            <Feather name={art.icon} size={RamahIcon.row} color={RamahTileTone[art.tone].ink} />
          </View>
        )}
        {showBadge ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText} numberOfLines={1}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Two lines allowed and never truncated: the guide is explicit that a
          tile label wraps rather than becoming "Penerimaan…". */}
      <Text style={[styles.tileLabel, disabled && { color: C.textDisabled }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The score card (guide §4): one figure, "/ 100", one short blameless sentence,
 * and a chevron into whatever fixes it.
 *
 * **This card computes nothing.** It draws a figure a caller already measured,
 * in the band `scoreTone()` assigns — green at 80 and up, amber 60-79, red
 * below. No gradient and no progress ring; the guide rejects both, and the tint
 * plus the sentence carry the tone twice so it never rests on colour alone.
 *
 * `note` is required for that reason, and the guide's wording rule is short and
 * blameless — "Mantap! Skornya tinggi", "Perlu diperbaiki minggu ini" — never a
 * scolding, and never absent.
 */
export function RamahScoreCard({
  label,
  score,
  note,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  score: number;
  note: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const [down, setDown] = useState(false);
  const tone = scoreTone(score);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} ${score} dari 100. ${note}`}
      style={[
        styles.score,
        { backgroundColor: tone.tint, borderColor: tone.border },
        down && { transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      <View style={styles.grow}>
        <Text style={styles.scoreLabel}>{label}</Text>
        <View style={styles.scoreLine}>
          <Text style={[styles.scoreValue, { color: tone.ink }]}>{score}</Text>
          <Text style={styles.scoreOutOf}>/ 100</Text>
          <Text style={[styles.scoreNote, { color: tone.ink }]}>{note}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={RamahIcon.row} color={tone.ink} />
    </Pressable>
  );
}

/**
 * One row of a stacked list, as the design system's `StackListRow` draws it: a
 * 40pt tinted round glyph, a title with its subtitle under it, and a right-hand
 * column carrying a value over its metadata.
 *
 * **The leading glyph is the row's kind, not decoration** — it is tinted from
 * the same function map the shortcut tiles use, so a document row looks like a
 * document row on every screen that lists one.
 *
 * No chevron, which is the design system's own choice. A stack row is one of
 * three or four inside a card that already ends in "Semua", and a column of
 * chevrons beside a column of values is a column of noise.
 */
export function RamahStackRow({
  icon,
  tone = 'dokumen',
  title,
  subtitle,
  value,
  meta,
  muted = false,
  onPress,
  accessibilityLabel,
}: {
  icon: FeatherName;
  tone?: RamahTileToneName;
  title: string;
  subtitle?: string;
  value?: string;
  meta?: string;
  /** The design system's dimmed row: grey glyph, whole row at 55%. */
  muted?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const [down, setDown] = useState(false);
  const paint = RamahTileTone[tone];
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[styles.stackRow, down && { backgroundColor: C.grey100 }, muted && styles.tileOff]}>
      <View style={[styles.stackIcon, { backgroundColor: muted ? C.grey200 : paint.tint }]}>
        <Feather name={icon} size={RamahIcon.row} color={muted ? C.grey500 : paint.ink} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.stackTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.stackSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value !== undefined || meta ? (
        <View style={styles.stackRight}>
          {value !== undefined ? (
            <Text style={styles.stackValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {meta ? (
            <Text style={styles.stackMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A status pill — where a document is in its flow, in five words or fewer.
 *
 * The five tones are `LayarGudang.dc.html`'s own `STATUS_META` pills, and the
 * split between them is not decorative: two are **filled** (`success`, `danger`)
 * and three are **tinted**. A filled pill is a document that has moved something
 * it cannot take back — posted stock, a cancellation — and it is loud on purpose;
 * a tinted one is a document still in play. Somebody scanning thirty rows reads
 * the two filled colours without reading any words at all.
 *
 * `warn` has no status of its own in the four-state flow. It is for the things
 * only one document can be — a part-received invoice, an unpaid one — which is
 * why `DOKUMEN_RAMAH` in `components/shell/status-dokumen.ts` does not use it
 * and `TERIMA_META` does.
 */
export type RamahBadgeTone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';

export function RamahBadge({ label, tone }: { label: string; tone: RamahBadgeTone }) {
  const paint = BADGE_TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: paint.bg }]}>
      <Text style={[styles.badgeText, { color: paint.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const BADGE_TONE: Record<RamahBadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: C.grey200, fg: C.textTitle },
  info: { bg: C.accentBlueTint, fg: C.accentBlueInk },
  // amber700: a status pill is 12px text, and amber600 is 3.0:1 on its tint.
  warn: { bg: C.amber50, fg: C.amber700 },
  success: { bg: C.brand, fg: C.textOnBrand },
  danger: { bg: C.danger, fg: C.white },
};

/**
 * A flat caption line for something that went wrong, with the way to try again
 * beside it.
 *
 * The guide's error style is one flat line, not a tinted box with a heading of
 * its own: an error is a sentence, and the red already says what kind.
 */
export function RamahInlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.inlineError}>
      <Feather name="alert-circle" size={RamahIcon.meta} color={C.textDanger} />
      <Text style={styles.inlineErrorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.inlineErrorAction}>Coba lagi</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A form field, drawn upside down from the usual one.
 *
 * Revision 2 of the guide inverts the hierarchy every form library ships with:
 * the **label** is small, grey and semibold (`T.caption`) and the **value**
 * is large, dark and bold (`T.titleSmall`), sitting on a 1px underline rather
 * than inside a box.
 * The reason is what a filled form then looks like — a summary. A boxed field
 * makes every row the same weight whether it holds anything or not, so a form
 * somebody has finished reads exactly like a form nobody has started; this way
 * the answers are the loudest thing on the screen and the questions recede.
 *
 * Focus is 1.5px of `borderFocus` on that same line and nothing else — no outer
 * glow. A shadow in this system says a surface floats (`RamahElevation`), and a
 * field is part of the page.
 *
 * **Required is a red asterisk after the label, never the word "(wajib)".**
 * Three of those down a column is three lines of text nobody acts on, and the
 * asterisk is a convention that survives being read at arm's length in a
 * storeroom.
 *
 * `prefix` is the "Rp" that sits inside the line rather than floating above it
 * as a label would — it is part of the value, not a question about it — and
 * `trailing` is the slot the board hangs a barcode-scan button in.
 */
export function RamahField({
  label,
  value,
  onChangeText,
  required = false,
  placeholder,
  helper,
  error,
  prefix,
  trailing,
  keyboardType,
  autoCapitalize = 'sentences',
  autoFocus = false,
  editable = true,
  maxLength,
  multiline = false,
  secureTextEntry = false,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  error?: string;
  prefix?: string;
  trailing?: ReactNode;
  keyboardType?: 'default' | 'numeric' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoFocus?: boolean;
  editable?: boolean;
  maxLength?: number;
  /** A password field — the only field in this system that needs one. */
  secureTextEntry?: boolean;
  /**
   * Grows to three lines before it scrolls, for a value that is a sentence
   * rather than a word — a rejection reason, a note naming a delivery order.
   *
   * The underline stays: this is the same field, and a reason typed into a box
   * while every other answer on the screen sits on a line reads as a different
   * kind of question. `textAlignVertical` is what keeps Android from centring
   * the first line inside the taller box.
   */
  multiline?: boolean;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const line = error ? C.danger : focused ? C.borderFocus : C.borderHairline;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.fieldStar}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.fieldLine,
          { borderBottomColor: line, borderBottomWidth: focused || error ? 1.5 : 1 },
        ]}>
        {prefix ? <Text style={styles.fieldPrefix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={editable}
          maxLength={maxLength}
          multiline={multiline}
          secureTextEntry={secureTextEntry}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={accessibilityLabel ?? label}
          style={[
            styles.fieldInput,
            multiline && styles.fieldInputMulti,
            !editable && { color: C.textDisabled },
          ]}
        />
        {trailing}
      </View>
      {/* The error replaces the helper rather than stacking under it: two
          captions about the same field, one grey and one red, is the reader
          deciding which of them is current. */}
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helper ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * The same field, when the value is *chosen* rather than typed.
 *
 * It exists because the board draws satuan dasar as a free-text box ("pcs") and
 * the contract cannot accept one: `POST /product` wants `id_satuan_dasar`, a
 * foreign key into the `satuan` master, and an unknown id answers 400. So the
 * drawing's line is kept and what sits on it opens a sheet.
 *
 * A chevron and no caret, so the difference is visible before it is pressed.
 */
export function RamahPickerField({
  label,
  value,
  placeholder,
  required = false,
  helper,
  error,
  locked = false,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  helper?: string;
  error?: string;
  /** Immutable by contract — drawn, greyed, and not pressable. */
  locked?: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.fieldStar}> *</Text> : null}
      </Text>
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
        accessibilityLabel={`${label}. ${value || placeholder}`}
        style={[
          styles.fieldLine,
          { borderBottomColor: error ? C.danger : C.borderHairline },
          down && { opacity: RamahMotion.pressDim },
        ]}>
        <Text
          style={[
            styles.fieldInput,
            !value && { color: C.textMuted },
            locked && { color: C.textDisabled },
          ]}
          numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Feather
          name={locked ? 'lock' : 'chevron-down'}
          size={RamahIcon.row}
          color={C.iconMuted}
        />
      </Pressable>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helper ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * "Langkah 2 dari 3 · Satuan", over three 4px bars.
 *
 * The bars are the whole progress indicator the system has — no percentage, no
 * ring, no number inside a circle. A three-step form does not need to be told
 * it is 67% finished; it needs to say which of three questions is on screen,
 * and the filled bars say it without being read.
 */
export function RamahSteps({
  step,
  total,
  label,
}: {
  /** 1-based. */
  step: number;
  total: number;
  label: string;
}) {
  return (
    <View
      style={styles.steps}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: step }}>
      <Text style={styles.stepsLabel}>{`Langkah ${step} dari ${total} · ${label}`}</Text>
      <View style={styles.stepsBars}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.stepsBar, { backgroundColor: i < step ? C.brand : C.grey200 }]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The white card a group of rows sits in — the design system's `StackList`.
 *
 * The hairline between rows is inserted **here** rather than drawn by each row,
 * for the reason the divider is inset by the card's own padding: it has to
 * separate the text, not cut the card in half, and only the container knows
 * which row is last. Every screen that hand-rolled `first`/`last` edge styles
 * was re-deriving one rounded rectangle per screen.
 */
export function RamahStackCard({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.stackCard}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 ? <View style={styles.stackCardDivider} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/**
 * The grey recap block: label on the left, value on the right, one pair a line.
 *
 * `grey50` and no border, which is what separates it from a `StackList` — this
 * is not a list of records you can act on, it is the same facts you have just
 * entered, read back. The board uses it as the foot of the last wizard step and
 * again on the confirmation screen, and the sameness is the point: what you
 * were shown before saving is what you are shown after.
 */
export function RamahSummaryCard({
  rows,
}: {
  rows: readonly { label: string; value: string }[];
}) {
  return (
    <View style={styles.summary}>
      {rows.map((r) => (
        <View key={r.label} style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{r.label}</Text>
          <Text style={styles.summaryValue} numberOfLines={2}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A grey aside — a rule of the system explained where it bites.
 *
 * Not an error and not a warning: it is why a field is locked, or what a number
 * on this screen is counted in. The lock glyph is the usual one, and the copy
 * stays at micro because it is read once and then never again.
 */
export function RamahNote({
  icon = 'lock',
  children,
}: {
  icon?: FeatherName;
  children: ReactNode;
}) {
  return (
    <View style={styles.note}>
      <Feather name={icon} size={RamahIcon.meta} color={C.iconMuted} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/**
 * One of a pair of dense figure cards — the two numbers the board puts at the
 * top of a product, side by side.
 *
 * `tone` is the *card's* tint, never the figure's colour. Guide §3 is flat
 * about that and this is the case it was written for: a stock balance under its
 * reorder point is worth marking, and marking it by painting the number orange
 * reads as an alarm a bare count does not justify. So the block tints and the
 * figure stays `textTitle`; what turns orange is the short note underneath,
 * which is the part that actually says something is wrong.
 */
export function RamahStatCard({
  label,
  value,
  note,
  tone = 'plain',
  accessibilityLabel,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'plain' | 'warn';
  accessibilityLabel?: string;
}) {
  const warn = tone === 'warn';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? (note ? `${label} ${value}. ${note}` : `${label} ${value}`)}
      style={[
        styles.stat,
        warn
          ? { backgroundColor: C.orange50, borderColor: C.orange50 }
          : { backgroundColor: C.surfaceCard, borderColor: C.borderHairline },
      ]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
      {note ? (
        <Text style={[styles.statNote, warn && { color: C.textWarning }]} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The "kartu penghalang" — one card for one thing standing between the reader
 * and moving a document forward: a rejection reason, cartons that do not add
 * up, a draft with nothing in it to submit. `alasanBox` and `warnBox` used to
 * be near-identical local style blocks on `app/pembelian/[id].tsx` and
 * `app/penerimaan-susulan/[id].tsx`; issue #26 asks for the one copy, so both
 * document screens render every blocker off this shape rather than drifting
 * apart wording by wording.
 *
 * The fix, when there is one, is a `RamahSecondaryButton` at the card's own
 * foot (`actionLabel` / `onAction`) — never a solid pill, and never placed
 * anywhere else on the screen: the guide's one-solid-pill rule is spent on the
 * dock, and an action that only makes sense once its card is understood
 * belongs where that understanding just happened.
 */
export function RamahBarrierCard({
  tone,
  title,
  description,
  note,
  error,
  actionLabel,
  onAction,
}: {
  tone: 'danger' | 'warn';
  title: string;
  description: string;
  /** A second, quieter line under the description — why a reversal is dated today, say. */
  note?: string;
  error?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const paint =
    tone === 'danger' ? { bg: C.red50, ink: C.textDanger } : { bg: C.orange50, ink: C.textWarning };
  return (
    <View style={[styles.barrier, { backgroundColor: paint.bg }]}>
      <Text style={[styles.barrierLabel, { color: paint.ink }]}>{title}</Text>
      <Text style={styles.barrierText}>{description}</Text>
      {note ? <Text style={styles.barrierNote}>{note}</Text> : null}
      {error ? <RamahInlineError message={error} /> : null}
      {actionLabel && onAction ? (
        <View style={styles.barrierAction}>
          <RamahSecondaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },

  header: {
    height: L.headerH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingHorizontal: L.gutter,
  },
  headerTitle: { ...T.titleSmall, color: C.textTitle, flexShrink: 1 },

  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: R.pill },
  // Half of what the 44pt tap box is wider than the 24pt glyph inside it, so
  // the glyph lands on the gutter rather than the box around it. Derived, not
  // a spacing choice: it is the glyph's own offset and moves with either size.
  iconButtonInset: { marginLeft: -(L.tapMin - RamahIcon.header) / 2 },

  search: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    // 16, the card padding: the glyph sits on the same vertical line as the
    // text in every card underneath the field.
    paddingHorizontal: L.space4,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
  },
  searchInput: { flex: 1, minWidth: 0, padding: 0, ...T.bodyModerate, color: C.textTitle },

  chip: {
    height: L.controlHSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingHorizontal: L.space3,
    borderRadius: R.pill,
    borderWidth: 1.5,
  },
  chipLabel: { ...T.caption },

  /*
    No padding of its own, above or below. It used to carry 20 over and 8
    under, which only came out right in the one container it was first drawn
    in: dropped into a body with a 16pt gap it sat 24 from its own card and 36
    from the group before — nearly as far from what it names as from what it
    does not. Distance is a relationship between two neighbours, so the
    container that holds both owns it: a heading sits in a group
    (`gap: L.related` or `L.stack`), and groups sit `L.group` apart.
  */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: L.space3,
  },
  sectionHeaderText: { ...T.caption, color: C.textMuted },
  sectionHeaderAction: { ...T.caption, color: C.textLink },

  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    // A pill is full-width almost everywhere, where this padding costs nothing.
    // It earns its place in the two narrow homes a pill has: the till's keypad
    // column, which is pinned to its 300pt minimum at the tablet breakpoint,
    // and any pill whose label has been enlarged by the system font setting.
    // Without it the label simply drew past the green.
    paddingHorizontal: L.space4,
    borderRadius: R.pill,
  },
  primaryOff: { opacity: 0.4 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingHorizontal: L.space4,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.brand,
  },
  // All three button labels are Title Tiny: a control's label is text that
  // matters, and the three differ by colour and border, not by size.
  secondaryLabel: { ...T.titleTiny, color: C.brandInk },
  tertiary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingHorizontal: L.space5,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
  },
  tertiaryLabel: { ...T.titleTiny, color: C.textTitle },
  // Shrinks, so a label too long for its pill wraps inside it rather than
  // running out of both ends of it.
  primaryLabel: {
    flexShrink: 1,
    ...T.titleTiny,
    color: C.textOnBrand,
    textAlign: 'center',
  },

  /*
    The sheet's own root, scrim, card and body are **gone**, not moved: the
    library owns all four now. `backgroundStyle` is the card, `backdropComponent`
    is the scrim, the root is the portal the provider renders into, and
    `BottomSheetScrollView` is the body. They lived here while the sheet was
    hand-drawn, and leaving them behind would be four plausible-looking keys for
    the next person to rebuild it on.

    The grabber is gone with them, and deliberately not replaced: the native
    sheet draws its own drag indicator, and a hand-drawn one underneath it would
    be two. All that is left of the old handle is the title, which now sits at
    the top of the body — see the note above `RamahSheet`.
  */
  sheetTitle: {
    ...T.titleSmall,
    color: C.textTitle,
    paddingHorizontal: L.gutter,
    // A little more above than the handle needed: the platform's indicator sits
    // over this, not around it, so the title has to clear it itself.
    paddingTop: L.space4,
    paddingBottom: L.space4,
  },
  sheetOption: {
    minHeight: L.controlH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    paddingHorizontal: L.gutter,
    paddingVertical: L.space3,
  },
  sheetOptionLabel: { ...T.titleTiny, color: C.textTitle },
  sheetOptionSub: { ...T.bodySmall, color: C.textMuted },

  // 4 columns, 16 vertical / 8 horizontal — the guide's grid snapped to 4 (see
  // `tileGapY`), and it is never five columns.
  tile: { width: `${100 / L.tileColumns}%`, alignItems: 'center', gap: L.space2, paddingHorizontal: L.tileGapX / 2 },
  // 52, bare. `RamahLayout.tileIcon` exists for exactly this number.
  tileArt: { width: L.tileIcon, height: L.tileIcon },
  tileSquircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    // 14, the guide's number for a tile squircle — not the token file's 20.
    borderRadius: R.tileSquircle,
  },
  tileArtBox: {
    width: L.tileIcon,
    height: L.tileIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyphBox: { width: 44, height: 44 },
  tileBadge: {
    position: 'absolute',
    // Overlapping the art's own top-left corner, as guide §4 specs the count
    // pill and as `LayarGudang.dc.html` draws it.
    top: -6,
    left: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: L.space1,
    borderRadius: R.pill,
    backgroundColor: C.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Centred by the pill's own `justifyContent`, not by a line height stretched
  // to the pill's height — the bundle's 16 stays on the grid.
  tileBadgeText: { ...T.caption, color: C.white },
  tileLabel: { ...T.caption, color: C.textTitle, textAlign: 'center' },
  // The system's one dimming value, shared by a disabled tile and a muted stack
  // row. Not a colour change: a 3D render is never recoloured, only dimmed.
  tileOff: { opacity: 0.55 },

  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    borderRadius: R.card,
    borderWidth: 1,
  },
  scoreLabel: { ...T.bodySmall, color: C.textBody },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    // "94" and "/ 100" are one figure read in two sizes.
    gap: L.inline,
    marginTop: L.space1,
  },
  // `metric`, the scale's top tier: on this card the score is the entire
  // subject rather than one of a pair, which is the same reasoning a stat
  // card's own figure gets.
  scoreValue: { ...T.titleLarge },
  scoreOutOf: { ...T.titleTiny, color: C.textMuted },
  scoreNote: { ...T.caption },

  stackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  stackIcon: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackTitle: { ...T.titleTiny, color: C.textTitle },
  stackSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  stackRight: { flexShrink: 0, maxWidth: 140, alignItems: 'flex-end' },
  stackValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right' },
  stackMeta: { ...T.bodySmall, color: C.textMuted, textAlign: 'right', marginTop: L.inline },

  badge: {
    alignSelf: 'flex-start',
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: L.space2,
    borderRadius: R.pill,
  },
  // 11px is allowed here for the reason the guide allows it on a tile label: the
  // eye lands on a status pill because it already knows where it is, not because
  // it is reading a sentence.
  badgeText: { ...T.caption },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingVertical: L.space2,
  },
  inlineErrorText: { ...T.bodySmall, color: C.textDanger, flex: 1, minWidth: 0 },
  inlineErrorAction: { ...T.caption, color: C.textLink },

  // Label over value over helper: three parts of one answer, so `inline`.
  field: { gap: L.inline },
  fieldLabel: { ...T.caption, color: C.textBody },
  // The asterisk is text too, so it takes the text red, not the fill red.
  fieldStar: { color: C.textDanger },
  fieldLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    // 8 under the value and nothing above it: the label's own line height is
    // what separates the two, so a boxed field's symmetric padding would open a
    // gap the underline no longer looks attached to.
    paddingBottom: L.space2,
  },
  // `minHeight` rather than `height`, so a raised system font size grows the
  // row instead of clipping the value inside it.
  fieldInput: { flex: 1, minWidth: 0, padding: 0, minHeight: T.titleSmall.lineHeight, ...T.titleSmall, color: C.textTitle },
  // Three lines of the 23pt value, then it scrolls. `maxHeight` rather than a
  // fixed height so a one-line answer still sits on the line like every other
  // field on the screen.
  fieldInputMulti: { maxHeight: T.titleSmall.lineHeight * 3 },
  fieldPrefix: { ...T.titleSmall, color: C.textMuted, flexShrink: 0 },
  fieldHelper: { ...T.bodySmall, color: C.textBody },
  fieldError: { ...T.bodySmall, color: C.textDanger },

  steps: { gap: L.related },
  stepsLabel: { ...T.caption, color: C.textMuted },
  // The bars are one indicator in N pieces, not N things.
  stepsBars: { flexDirection: 'row', gap: L.inline },
  stepsBar: { height: 4, flex: 1, borderRadius: R.pill },

  stackCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    overflow: 'hidden',
  },
  // Inset by the card's own padding: a divider that reaches both edges cuts the
  // card into two cards.
  stackCardDivider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  summary: {
    backgroundColor: C.grey50,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space3,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: L.space3 },
  summaryLabel: { ...T.bodySmall, color: C.textBody, flexShrink: 1 },
  summaryValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', flexShrink: 1 },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: L.space3,
    backgroundColor: C.grey50,
    borderRadius: R.card,
    paddingVertical: L.cardPadDense,
    paddingHorizontal: L.cardPad,
  },
  noteText: { ...T.bodySmall, color: C.textBody, flex: 1, minWidth: 0 },

  stat: {
    flex: 1,
    minWidth: 0,
    gap: L.inline,
    padding: L.cardPadDense,
    borderRadius: R.cardSm,
    borderWidth: 1,
  },
  statLabel: { ...T.bodySmall, color: C.textBody },
  // The figure, and it is never toned — see the note on the component.
  statValue: { ...T.titleSmall, color: C.textTitle },
  statNote: { ...T.bodySmall, color: C.textMuted },

  barrier: { borderRadius: R.card, padding: L.cardPad, gap: L.space1 },
  barrierLabel: { ...T.titleTiny },
  barrierText: { ...T.bodySmall, color: C.textTitle },
  barrierNote: { ...T.bodySmall, color: C.textBody, marginTop: L.space2 },
  barrierAction: { paddingTop: L.space2, flexDirection: 'row' },
});
