import type { TextStyle } from 'react-native';

/**
 * The Ramah design system, revision 2 — "pola aplikasi merchant".
 *
 * This file is the codebase's copy of the style guide. Its source is the Claude
 * Design project `63350d41-2bd9-499b-bd3f-b77d1a040c45`, read with `DesignSync`:
 *
 *   - `Panduan Gaya.dc.html`                — the guide itself (nine sections)
 *   - `_ds/ramah-design-system-…/tokens/*`  — the raw token files
 *
 * **Why this exists.** The first two ported screens (`app/index.tsx`,
 * `app/pilih-peran.tsx`) each carry a local `const D` block of hand-copied hex.
 * That was right when there were two of them and the palette was still being
 * argued about; it stops being right the moment a third screen needs the same
 * green, because three copies drift and nobody can tell which one is the
 * mistake. Everything the guide fixes as a *value* lives here now, once.
 *
 * **What this file is deliberately NOT.** It is not a merge into
 * `constants/theme-erp.ts`, `tailwind.config.js`, or
 * `components/ui/gluestack-ui-provider/config.ts`. Those three hold the old
 * blue-and-gold palette three times over and are read by every screen that has
 * not been ported; changing a value there restyles lists, badges, dialogs and
 * status colours across the whole back office at once. This module sits beside
 * them and is imported only by screens that have actually moved. When the last
 * screen moves, the three old holders get deleted together — not edited one
 * value at a time.
 *
 * **Revision 2 changed the layout, not the palette.** Revision 1 was a consumer
 * app: 24pt gutters, one task per screen, a curved colour header. Revision 2
 * re-anchors the whole back office on daily *merchant* screens — the kind a
 * shop owner opens four times a day to check a number and fix a row. Denser
 * gutters, a stack of single-purpose cards on a grey canvas, and forms whose
 * hierarchy is inverted so a filled form reads as a summary. Where the guide
 * and the token files disagree, the guide wins and the disagreement is noted at
 * the constant.
 */

/**
 * Colours, flattened.
 *
 * The token file expresses these as two layers — a raw ramp, then semantic
 * aliases pointing into it (`--brand: var(--green-500)`). CSS variables do not
 * survive into React Native `StyleSheet`, so both layers are written out as
 * literal hex here. The ramp is kept rather than collapsed into the aliases
 * because the guide names ramp steps directly in its rules ("teks kecil di atas
 * jingga harus `--orange-600`"), and a rule that names a colour we do not have
 * is a rule nobody can follow.
 *
 * **Every value is opaque.** Tints are pre-composited against white and written
 * as hex, never left as `rgba(…, .1)` — a translucent tint is a different
 * colour over the page than over a card than over a pressed row, which is three
 * colours wearing one name. The single exception is `scrim`, where the
 * translucency *is* the effect.
 */
export const RamahColors = {
  // --- Brand green. Platform-level, and only for primary action. ---
  green50: '#F1FAF2',
  green100: '#E1F3E2',
  green200: '#B5E0B8',
  green400: '#22A32F',
  green500: '#008A0C',
  green600: '#006B09',
  green700: '#00530A',

  // --- Blue. Secondary accent from the brand artwork; not an action colour. ---
  blue50: '#F0F6FA',
  blue100: '#DCEAF3',
  blue200: '#A8CAE0',
  blue400: '#3E8CBB',
  blue500: '#2E74A0',
  blue600: '#1F5478',
  blue700: '#163F5C',

  // --- Category colours. One per kind of thing; never global chrome. ---
  sky50: '#EBF7FD',
  sky100: '#D3ECF9',
  sky500: '#48B0E0',
  sky600: '#2B8ABA',
  sky700: '#1E6A92',
  orange50: '#FDF1E5',
  orange100: '#FADFC4',
  orange500: '#EE9130',
  orange600: '#C46F17',
  amber50: '#FEF6E6',
  amber100: '#FCE9BF',
  amber500: '#F5B24A',
  amber600: '#B97C15',
  navy50: '#EDF1F5',
  navy100: '#D5DEE7',
  navy500: '#103352',
  navy600: '#0A2338',

  // --- Neutrals. Low-saturation canvas, near-black ink — never pure black. ---
  white: '#FFFFFF',
  grey50: '#FAFAFA',
  grey100: '#F5F5F5',
  grey200: '#EBEBEB',
  grey300: '#DCDCDC',
  grey400: '#B9B9B9',
  grey500: '#9B9B9B',
  grey600: '#6B6B6B',
  grey700: '#4A4A4A',
  grey900: '#2B2B2B',
  black: '#101010',

  red50: '#FDECEC',
  red500: '#E02020',
  red600: '#B31616',

  // ============ Semantic aliases ============
  //
  // Reach for these first. A screen naming `RamahColors.green500` has decided
  // the colour; a screen naming `RamahColors.brand` has decided the *role*, and
  // survives the day the green moves.

  brand: '#008A0C',
  brandInk: '#006B09',
  brandPress: '#00530A',
  brandTint: '#E1F3E2',
  brandTintSoft: '#F1FAF2',

  accentBlue: '#2E74A0',
  accentBlueInk: '#1F5478',
  accentBlueTint: '#F0F6FA',

  /**
   * `--surface-sunken` is the merchant canvas: the grey the card stack sits on.
   * In revision 1 the page was white and this grey barely appeared. In revision
   * 2 it is the default background of every operational screen, and white is
   * what a *card* is made of — which is the whole reason a stack of cards reads
   * as separate objects with no shadow under any of them.
   */
  surfacePage: '#FFFFFF',
  surfaceSunken: '#F5F5F5',
  surfaceCard: '#FFFFFF',
  /** `--surface-stack`, and also the pressed state of a list row. */
  surfaceStack: '#FAFAFA',
  surfaceField: '#F5F5F5',
  surfaceInverse: '#103352',
  /** The one translucent value in the system: 48% navy under a sheet. */
  scrim: 'rgba(16,51,82,.48)',

  textTitle: '#2B2B2B',
  textBody: '#6B6B6B',
  textMuted: '#9B9B9B',
  textOnBrand: '#FFFFFF',
  textOnInverse: '#FFFFFF',
  textLink: '#006B09',
  textDanger: '#E02020',

  /** 1px, and the only structural line in the system. Depth comes from this. */
  borderHairline: '#EBEBEB',
  borderStrong: '#DCDCDC',
  borderBrand: '#008A0C',
  /** A focused field draws 1.5px of this and nothing else — no outer glow. */
  borderFocus: '#006B09',

  iconDefault: '#103352',
  iconMuted: '#9B9B9B',
  iconBrand: '#008A0C',

  success: '#008A0C',
  warning: '#F5B24A',
  danger: '#E02020',
  info: '#48B0E0',
} as const;

/**
 * What each hue is allowed to mean (guide §6).
 *
 * Written down because the failure mode is not picking an ugly colour — it is
 * picking a *correct-looking* one that already means something else. Navy as a
 * button reads as a second primary action; orange as body text is 2.2:1 on
 * white and simply cannot be read.
 *
 *   green  — action. Exactly one solid green pill per screen. Also an upward
 *            delta and the field info button.
 *   navy   — structure. Chrome icons, dark headers, documents. Never a button.
 *   orange — stock. Group markers and the running-low warning. Small text over
 *            it steps down to `orange600`.
 *   red    — required and wrong. The asterisk, the error line, the location
 *            pin, a downward delta. Not a brand colour.
 */

/**
 * Poppins, in the four weights the system uses — and why it is four *families*
 * rather than one family and a `fontWeight`.
 *
 * `tokens/fonts.css` sets `--font-display` and `--font-body` to Poppins (a
 * documented substitution upstream, made when no binaries came with the brief),
 * and `tokens/typography.css` spends exactly four weights on it: 400, 500, 600
 * and 700. Those are the four faces bundled here, from
 * `@expo-google-fonts/poppins`.
 *
 * **React Native does not synthesise a weight for a custom font.** Android in
 * particular resolves `fontFamily` to one registered face and then ignores
 * `fontWeight` entirely, so a single "Poppins" family plus `fontWeight: '700'`
 * renders regular — silently, and only on that platform. The fix is to name the
 * face: `expo-font`'s `useFonts` registers each file under its own family name,
 * and the same name then works on both platforms. That is the whole reason the
 * runtime loader is used here rather than the `expo-font` config plugin, which
 * takes the family from the file on iOS and from the file *name* on Android and
 * so would need a `Platform.select` at every call site.
 *
 * `fontWeight` is kept beside each family anyway. It costs nothing where the
 * face resolves, and it is the difference between "the fonts failed to load and
 * the app is plain but legible" and "every heading went thin".
 *
 * The names are exactly the export names of `@expo-google-fonts/poppins`, which
 * is what `app/_layout.tsx` hands to `useFonts`. Changing one here without
 * changing the load map there leaves a family nothing resolves — which falls
 * back to the platform font with no error anywhere.
 */
export const RamahWeight = {
  regular: { fontFamily: 'Poppins_400Regular', fontWeight: '400' },
  medium: { fontFamily: 'Poppins_500Medium', fontWeight: '500' },
  semibold: { fontFamily: 'Poppins_600SemiBold', fontWeight: '600' },
  bold: { fontFamily: 'Poppins_700Bold', fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

/**
 * The merchant type scale (guide §7).
 *
 * This is a *different scale* from `tokens/typography.css`, on purpose. That
 * file's bundles (`--type-display` at 34/40, `--type-h1` at 28/34) size a
 * consumer onboarding screen where one question fills the viewport. A merchant
 * home shows six cards at once, so the top of the scale comes down to 22/26 and
 * the contrast is carried by weight and colour instead of by size.
 *
 * **The floor is 13px for anything you are meant to read.** 11px exists only
 * for a tile label and a character counter — two strings the eye lands on
 * because it already knows where they are, not because it is reading them.
 *
 * Poppins is the guide's family, and the binaries are bundled now — every
 * bundle below carries one of `RamahWeight`'s four named faces, so a style
 * spread from here is already in the right family and the right weight. A
 * screen that writes a raw `fontSize`/`fontWeight` pair of its own is a screen
 * rendering in the platform font; spread a bundle, or at minimum spread the
 * matching `RamahWeight` entry beside the size.
 *
 * **Tracking.** `tokens/typography.css` asks for −0.01em on titles and 0 on
 * body, and Poppins is a geometric grotesque that needs it: at 22px its default
 * fit reads airy next to the rest of the card. React Native's `letterSpacing`
 * is in points rather than ems, so the em figure is multiplied out per size and
 * rounded to a tenth. Nothing at or below 15px is tracked at all — that is the
 * token file's `--tracking-body`, and negative tracking on a 13px caption is
 * where legibility starts to go.
 */
export const RamahType = {
  /** A money figure or a headline count on a card. The top of the scale. */
  metric: { fontSize: 22, lineHeight: 26, letterSpacing: -0.2, ...RamahWeight.bold },
  /** The business name in the identity block. */
  identity: { fontSize: 20, lineHeight: 26, letterSpacing: -0.2, ...RamahWeight.bold },
  /** A group heading, and the *value* of a form field — they are the same size. */
  groupTitle: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, ...RamahWeight.bold },
  fieldValue: { fontSize: 17, lineHeight: 23, letterSpacing: -0.2, ...RamahWeight.bold },
  /** A list row's title. */
  rowTitle: { fontSize: 15, lineHeight: 22, ...RamahWeight.semibold },
  body: { fontSize: 15, lineHeight: 22, ...RamahWeight.regular },
  /** Explanation and metadata. The smallest size a sentence may be set in. */
  caption: { fontSize: 13, lineHeight: 18, ...RamahWeight.regular },
  /** A field's label — small and grey, above a value that is large and dark. */
  fieldLabel: { fontSize: 12, lineHeight: 16, ...RamahWeight.semibold },
  /** A delta chip: arrow glyph plus a percentage. */
  delta: { fontSize: 12, lineHeight: 16, ...RamahWeight.semibold },
  /** Tile labels and character counters. Nothing else may be this small. */
  micro: { fontSize: 11, lineHeight: 14, ...RamahWeight.semibold },
} as const satisfies Record<string, TextStyle>;

/**
 * Spacing and the sizes of things (guide §2, §7).
 *
 * The 4px base scale is unchanged from `tokens/spacing.css`; what revision 2
 * changes is the screen-level geometry, and two of these contradict the token
 * file outright. The token file is a consumer-app default, the guide is what
 * these screens are drawn at, so the guide wins.
 */
export const RamahLayout = {
  // 4px base scale, straight from the token file.
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,
  space12: 48,
  space16: 64,

  /**
   * The screen's left/right margin — and the width a docked button is inset by.
   *
   * **16, not the token file's 24.** A merchant screen carries more per row
   * than a consumer screen does, and a phone in portrait has ~354pt of content
   * width to begin with; the 8pt reclaimed on each side goes to the card
   * interior, where it is the difference between a two-metric row fitting and
   * wrapping. The 24pt gutter survives only on the two revision-1 screens that
   * are already ported (login, pilih-peran), which are consumer-shaped screens
   * and correctly stay wide.
   */
  gutter: 16,

  /** Between cards in a stack. */
  cardGap: 12,
  /** Between two *groups* of cards that are about different things. */
  groupGap: 16,

  /** A card's own padding. 14 when the card is dense, 16 when it is not. */
  cardPadDense: 14,
  cardPad: 16,

  /** `--tap-min`, annotated "never smaller" in the token file. */
  tapMin: 44,
  /** A primary pill, and a text field, share this height. */
  controlH: 52,
  /** A tertiary chip. */
  controlHSm: 36,
  /** A list row. */
  rowH: 56,
  headerH: 56,

  /** The gap between two metrics either side of the hairline divider. */
  metricGap: 14,

  /** The feature shortcut grid: four columns, and never a fifth. */
  tileColumns: 4,
  tileGapY: 14,
  tileGapX: 8,
  /** A 3D tile glyph stands alone at this size — see `RamahIcon` for why. */
  tileIcon: 52,
} as const;

/**
 * Corner radii (guide §7).
 *
 * Nothing below 12: a 4px corner reads as foreign in this system. Note
 * `tileSquircle` — the token file calls a squircle 20, the guide draws the
 * feature tile at 14, and the guide is what the tile is measured against.
 */
export const RamahRadius = {
  pill: 999,
  /** The default card. */
  card: 16,
  /** A dense card, and a field. */
  cardSm: 12,
  field: 12,
  sheet: 20,
  /** The feature tile's squircle. 14 per the guide, not the token file's 20. */
  tileSquircle: 14,
} as const;

/**
 * Icon sizes (guide §7).
 *
 * Four sizes, each with a job. Anything else is a size somebody eyeballed.
 */
export const RamahIcon = {
  /** Inside a counter or a delta chip. */
  counter: 14,
  /** Beside metadata — a timestamp, a refresh affordance. */
  meta: 16,
  /** A list row's leading glyph, a trailing chevron, a tile's fallback glyph. */
  row: 20,
  /** Header chrome. */
  header: 24,
} as const;

/**
 * Motion (guide §7, `tokens/motion.css`).
 *
 * Fades and slides only. No bounce, no spring, no parallax, no ambient loop.
 *
 * These are exported as plain numbers rather than as `Animated` configs because
 * most of what they drive is not animated at all in React Native — a press
 * scale of 0.98 is a transform held in state via `onPressIn`/`onPressOut`, not
 * a CSS transition. See the `Pressable` warning in CLAUDE.md: the
 * `style={({ pressed }) => …}` callback silently does nothing in this app.
 */
export const RamahMotion = {
  /** A press: the scale change, and a list row's tint. */
  instant: 90,
  /** A colour transition. */
  fast: 160,
  base: 220,
  /** A bottom sheet rising over its scrim. */
  sheet: 280,
  /** What a pressed control scales to. */
  pressScale: 0.98,
  /** What a pressed icon button dims to. */
  pressDim: 0.92,
} as const;

/**
 * Which tint a shortcut tile wears (guide §4, §8).
 *
 * "Warna mengikuti kelompok fungsi, bukan selera." The point of fixing this in
 * code is that a tile's colour is a second, non-textual way to find it: someone
 * who opens this app forty times a week stops reading the labels and goes to
 * the orange one. That only works if orange means stock on every screen and on
 * every future screen, which a per-screen choice cannot guarantee.
 *
 * `tint` is the squircle behind the glyph; `ink` is the glyph itself, and is
 * always the darker ramp step so a line icon holds contrast on its own tint.
 */
export const RamahTileTone = {
  stok: { tint: RamahColors.orange50, ink: RamahColors.orange600 },
  katalog: { tint: RamahColors.blue50, ink: RamahColors.accentBlueInk },
  dokumen: { tint: RamahColors.navy50, ink: RamahColors.navy500 },
  laporan: { tint: RamahColors.sky50, ink: RamahColors.sky700 },
  pemasok: { tint: RamahColors.amber50, ink: RamahColors.amber600 },
  akun: { tint: RamahColors.grey100, ink: RamahColors.grey700 },
  /**
   * **Not in the guide's list of six**, which runs stok / katalog / dokumen /
   * laporan / pemasok / akun. The guide's merchant home never had a till on it,
   * so there was no function to name; this app's does.
   *
   * Green, and this is the one place a green *tint* is allowed that is not a
   * button. The rule the guide actually writes is "satu pil hijau **padat** per
   * layar" — one solid green pill — and a 44pt tinted squircle is neither solid
   * nor a pill. It earns the colour on the same grounds every other entry here
   * does: the tile's hue is a second, non-textual way to find it, and the till
   * is the one destination on this screen where money changes hands rather than
   * where a number is read.
   */
  kasir: { tint: RamahColors.green50, ink: RamahColors.brandInk },
} as const;

export type RamahTileToneName = keyof typeof RamahTileTone;

/**
 * The score card's tint band (guide §4).
 *
 * **This function does not produce a score, and nothing in
 * `contracts/openapi.yaml` does either.** The guide draws a "skor kesehatan
 * stok 94/100" and that number has no endpoint behind it — see the
 * "Layout economy" rule in CLAUDE.md about not inventing a number to fill a
 * card. What is encoded here is only the mapping from a score somebody
 * genuinely computed to the colour it is drawn in, so that when such a number
 * does exist, the three bands are not re-guessed per screen.
 *
 * Tone is carried by tint *and* by the sentence beside it, never by colour
 * alone — the guide requires a short, blameless line at every band.
 */
export function scoreTone(score: number): { tint: string; ink: string; border: string } {
  if (score >= 80) {
    return { tint: RamahColors.green50, ink: RamahColors.brandInk, border: RamahColors.green200 };
  }
  if (score >= 60) {
    return { tint: RamahColors.amber50, ink: RamahColors.amber600, border: RamahColors.amber100 };
  }
  return { tint: RamahColors.red50, ink: RamahColors.red600, border: RamahColors.red50 };
}

/**
 * "Hari ini, 12:00" / "12 Agu, 11:02" — the update stamp in a card's footer
 * (guide §3).
 *
 * Every operational number on a merchant screen carries one of these. The guide
 * is blunt about why: "Angka tanpa jam tidak dipercaya pengguna." A number with
 * no time on it cannot be told apart from a stale one, so the reader reloads
 * anyway, or worse, does not.
 *
 * Takes a `Date` rather than the contract's ISO strings because what it stamps
 * is when *this device* last read the value, which no payload carries.
 */
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function stempelPembaruan(at: Date, now: Date = new Date()): string {
  const jam = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return `Hari ini, ${jam}`;
  return `${at.getDate()} ${BULAN[at.getMonth()]}, ${jam}`;
}
