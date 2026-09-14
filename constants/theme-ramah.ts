import { Platform, type TextStyle, type ViewStyle } from 'react-native';

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
 * colours wearing one name. The exceptions are `scrim` and the shadow ink in
 * `RamahElevation`, where the translucency *is* the effect.
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
  /** The darkest orange that clears 4.5:1 on every light surface. Small orange text. */
  orange700: '#9E5913',
  amber50: '#FEF6E6',
  amber100: '#FCE9BF',
  amber500: '#F5B24A',
  amber600: '#B97C15',
  /** The darkest amber that clears 4.5:1 on every light surface. Small amber text. */
  amber700: '#906110',
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
   * as separate objects with no shadow under any of them. A card is part of the
   * page; only what floats over the page takes a `RamahElevation` token.
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

  /*
    Text colours are tested against WCAG 2.0 AA (issue #33): 4.5:1 for normal
    text, 3:1 for large (≥ 24px, or ≥ 18.7px bold — Title Small and up), on
    every light surface a line of text can sit on. Test a new text colour the
    same way before adding it; the table is what the numbers were.

    | text colour        | card #FFF | sunken #F5F5F5 | grey200 #EBEBEB | brandTint #E1F3E2 | red50 #FDECEC |
    |--------------------|-----------|----------------|-----------------|-------------------|---------------|
    | textTitle #2B2B2B  | 14.16     | 12.99          | 11.88           | 12.22             | 12.40         |
    | textBody  #6A6A6A  |  5.41     |  4.96          |  4.54           |  4.67             |  4.73         |
    | textLink  #006B09  |  6.76     |  6.20          |  5.67           |  5.83             |  5.92         |
    | textDanger #D01E1E |  5.40     |  4.96          |  4.53           |  4.61             |  4.73         |
    | textWarning #9E5913|  5.44     |  4.99          |  4.53           |  4.70             |  4.77         |
    | amber700  #906110  |  5.40     |  4.95          |  4.51           |  4.66             |  4.73         |
    | white on brand #008A0C: 4.53 · white on danger #E02020: 4.78            |

    Three colours failed and moved: `textMuted` (#9B9B9B, 2.33–2.78 — failed
    everywhere), `textDanger` (#E02020, 4.01 on grey200 and 4.12 on
    brandTint), and orange600/amber600 as small text (3.0–3.7). The raw
    orange500, amber500 (`warning`) and sky500 (`info`) are 1.85–2.45 and are
    **never** a text colour. Icons, hairlines and fills are not text and keep
    their lighter values — WCAG 2.0 sets no ratio for them.
  */
  textTitle: '#2B2B2B',
  textBody: '#6A6A6A',
  /**
   * The same ink as `textBody`, and that is the cost of AA rather than a slip.
   * Muted used to be #9B9B9B, a step lighter than body, at 2.78:1 on white; the
   * lightest grey that clears 4.5:1 on grey200 is #6A6A6A, which is body. The
   * name stays for the *role* — metadata, a stamp, a count — so the day body
   * darkens, muted can take a real step again. Hierarchy between the two is
   * carried by size and weight now, not by a paler grey nobody could read.
   */
  textMuted: '#6A6A6A',
  /**
   * The only grey text allowed under 4.5:1, because WCAG exempts text on a
   * control that cannot be used: a disabled tile, a locked field. Never for
   * anything a reader is meant to act on.
   */
  textDisabled: '#9B9B9B',
  textOnBrand: '#FFFFFF',
  textOnInverse: '#FFFFFF',
  textLink: '#006B09',
  /** Darker than `danger` (#E02020), which stays the fill and border colour. */
  textDanger: '#D01E1E',
  /** Small warning text: orange600 only clears 4.5:1 as Title Small and up. */
  textWarning: '#9E5913',

  /**
   * 1px, and the only structural line in the system: it separates things that
   * sit on the same plane. Something *over* the page — a dock, a floating sheet —
   * is separated by `RamahElevation` instead, never by both.
   */
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
 * Poppins, in the three weights the system uses — and why it is three
 * *families* rather than one family and a `fontWeight`.
 *
 * **Three, named for the hierarchy they serve (issue #33): Book, Demi, Bold**,
 * Aloha's three mapped onto Poppins' 400, 600 and 700. Medium (500) is gone: it
 * was used six times, always as a half-step nobody could see from arm's length,
 * and dropping it took a whole font file out of the bundle. There is no italic —
 * none is loaded, and emphasis in this system is weight and colour.
 *
 * `tokens/fonts.css` sets `--font-display` and `--font-body` to Poppins (a
 * documented substitution upstream, made when no binaries came with the brief),
 * and the three faces are bundled from `@expo-google-fonts/poppins`.
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
  /** Aloha's Book: sentences and metadata. */
  book: { fontFamily: 'Poppins_400Regular', fontWeight: '400' },
  /** Aloha's Demi: a row's title, a button, a caption. */
  demi: { fontFamily: 'Poppins_600SemiBold', fontWeight: '600' },
  /** Aloha's Bold: every Title from Small up. */
  bold: { fontFamily: 'Poppins_700Bold', fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

/**
 * The type scale (issue #33): one formula, three weights, line heights on the
 * 4px grid, and names that say where a line sits in the hierarchy.
 *
 * **Every size is derived, not picked.** The ramp is Aloha's (Gojek's design
 * system): a 9pt base times 1.3 per step, rounded to a whole point, and a line
 * height of that size times 1.3 rounded to the **nearest multiple of 4** — so
 * a line of text lands on the same grid as every gap around it (issue #31).
 *
 *   | n | 9 × 1.3ⁿ | size | × 1.3 | line height |
 *   |---|----------|------|-------|-------------|
 *   | 1 |   11.7   |  12  |  15.6 |     16      |
 *   | 2 |   15.2   |  15  |  19.5 |     20      |
 *   | 3 |   19.8   |  20  |  26.0 |     24      |
 *   | 4 |   25.7   |  26  |  33.8 |     32      |
 *   | 5 |   33.4   |  34  |  44.2 |     44      |
 *   | 6 |   43.4   |  44  |  57.2 |     56      |
 *
 * A new size is the next n, never a number between two of these — 12.5, 18,
 * 21 and 28 were all on screens before this, each one somebody's eye. n=3 is
 * the one tie (26 is as far from 24 as from 28) and takes **24**: it is the
 * size of a form field's value and a group heading, both of which stack in
 * dense forms, and 28 would open every one of those rows by four points.
 *
 * **The names are the hierarchy, shared with the guide, not a screen's role**:
 *
 * - **Title** — Hero, Large, Moderate, Small, Tiny — for text or numbers that
 *   matter: a metric, a business name, a group heading, a row's title, a
 *   field's value, a button. Bold, except Tiny, which is Demi.
 * - **Body** — Moderate, Small — for sentences. Book.
 * - **Caption** — the smallest, Demi, and used sparingly: a field's label, a
 *   tile's label, a status pill, a counter. A line of metadata or a short
 *   explanation is Body Small, not Caption.
 *
 * **12pt is the floor, with no exception.** The old 11px tier for tile labels
 * and counters is gone; both are Caption now. **No italic, anywhere** — Poppins
 * is not loaded in one, and emphasis in this system is weight and colour.
 *
 * **The family stays Poppins.** Aloha's own principle is that the typeface is
 * chosen with the brand team, and its face, Maison Neue, is Gojek's licensed
 * brand identity; this app adopts the system — weights, ramp, rounding, names,
 * contrast — and keeps its own brand's face. Every bundle below carries one of
 * `RamahWeight`'s three named faces, so a style spread from here is already in
 * the right family. A screen writing its own `fontSize` is a line in the
 * platform font on Android and a number off the ramp everywhere; spread a
 * bundle instead.
 *
 * **Tracking.** −0.01em from Title Small (20) up, because a geometric
 * grotesque reads airy at heading sizes without it. React Native's
 * `letterSpacing` is in points, so the em figure is multiplied out per size and
 * rounded to a tenth. Nothing at 15 or below is tracked.
 *
 * **Scaling.** Nothing here disables the system's own font-size setting —
 * there is no blanket `allowFontScaling={false}` anywhere in the app, which is
 * what actually answers the guide's "pakai sp/Dynamic Type, jangan ukuran
 * fixed" rule on React Native: an unadorned `Text` already grows with the
 * user's chosen size. `app/(admin)/kasir.tsx` is the one deliberate exception,
 * capping growth on the till's own dense numeric chrome with a size-derived
 * `maxFontSizeMultiplier` — documented there, not a rule to copy elsewhere.
 */
export const RamahType = {
  /** n=6. One number with a screen to itself. Merchant screens rarely need it. */
  titleHero: { fontSize: 44, lineHeight: 56, letterSpacing: -0.4, ...RamahWeight.bold },
  /** n=5. A money figure or a headline count on a card; the till's readout. */
  titleLarge: { fontSize: 34, lineHeight: 44, letterSpacing: -0.3, ...RamahWeight.bold },
  /** n=4. A business name, a screen's page heading, a sale's total. */
  titleModerate: { fontSize: 26, lineHeight: 32, letterSpacing: -0.3, ...RamahWeight.bold },
  /** n=3. A group heading, and the *value* of a form field — the same size on purpose. */
  titleSmall: { fontSize: 20, lineHeight: 24, letterSpacing: -0.2, ...RamahWeight.bold },
  /** n=2. A list row's title, a button's label. */
  titleTiny: { fontSize: 15, lineHeight: 20, ...RamahWeight.demi },
  /** n=2. A sentence. */
  bodyModerate: { fontSize: 15, lineHeight: 20, ...RamahWeight.book },
  /** n=1. A short sentence, or the metadata line under a title. */
  bodySmall: { fontSize: 12, lineHeight: 16, ...RamahWeight.book },
  /** n=1. A field's label, a tile's label, a status pill, a counter. Sparingly. */
  caption: { fontSize: 12, lineHeight: 16, ...RamahWeight.demi },
} as const satisfies Record<string, TextStyle>;

export type RamahTypeName = keyof typeof RamahType;

/**
 * Spacing and the sizes of things (guide §2, §7; issue #31).
 *
 * The 4px base scale is unchanged from `tokens/spacing.css`; what revision 2
 * changes is the screen-level geometry, and two of these contradict the token
 * file outright. The token file is a consumer-app default, the guide is what
 * these screens are drawn at, so the guide wins.
 *
 * ### One grid, and every gap on it is a statement
 *
 * **Every spacing value in a Ramah screen is a multiple of 4**, inside a
 * component and between components alike. The gap between two things is how a
 * reader tells whether they belong together — nearer is related, further is
 * not, and two things with the same gap pattern read as equal in weight — so a
 * 10 next to a 12 next to a 14 is not three slightly different choices, it is
 * noise that blurs which things are grouped.
 *
 * The five **semantic tiers** below name those relationships, and a screen
 * reaches for them first. The `space*` scale stays as the raw ruler for a
 * component's own interior geometry — a pill's side padding, a row's icon gap —
 * where the question is "how big" rather than "how related".
 *
 * **The one rule the tiers exist to keep: the gap between groups is clearly
 * larger than any gap inside one.** `stack` 12 against `group` 24 is a 2:1
 * step; the 12/16 pair revision 2 drew was 4pt apart, which on a phone reads as
 * the same distance twice. That is a deliberate departure from the guide — see
 * "Spacing" in `CLAUDE.md`.
 *
 * **What may sit off the grid, and nothing else:** a hairline (1px, 1.5px); a
 * size rather than a gap (`controlH`, `rowH`, `tapMin`, an icon); a radius
 * (`RamahRadius`); and a 1–3px optical nudge that centres a drawn glyph or a
 * checkbox against a line of text, where the number is the glyph's own shape
 * and not a distance between two things.
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

  // ---- semantic tiers: how related two neighbours are ----
  /** Two parts of one fact: a label and its value, a title and its subtitle. */
  inline: 4,
  /** Equal items in one group: chips in a row, buttons side by side, an icon and its label, a heading and the one card it names. */
  related: 8,
  /** Cards stacked in one group, and the controls stacked over a list. */
  stack: 12,
  /** Between groups that are about different things. Always clearly more than anything inside a group. */
  group: 24,
  /** Around the one thing a screen is for, and between the large parts of a page. */
  section: 32,

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

  /**
   * A card's own padding. 16, and 12 when the card is dense.
   *
   * The dense value was 14, off the grid. It went **down** rather than up
   * because dense is the point of it: these are the list rows and stat cards a
   * reader scans thirty of, and the 4pt that snapping them to 16 would have
   * cost each row is what a phone in portrait runs out of first. The two
   * pixels it gives back come home as the 4pt `inline` gap between a row's
   * title and its subtitle, which used to be 2.
   */
  cardPadDense: 12,
  cardPad: 16,

  /**
   * Above and below a docked action — the green pill, the transition buttons.
   *
   * 16 where it used to be 10 or 12 depending on the screen. The docked pill is
   * the most important control on every screen that has one, and the space
   * around a thing is what tells the eye it matters; it is also the one control
   * with a hairline right above it, which a 10pt gap crowded.
   */
  dockPad: 16,

  /** `--tap-min`, annotated "never smaller" in the token file. */
  tapMin: 44,
  /** A primary pill, and a text field, share this height. */
  controlH: 52,
  /** A tertiary chip. */
  controlHSm: 36,
  /** A list row. */
  rowH: 56,
  headerH: 56,

  /**
   * The gap between two metrics either side of the hairline divider. 16, up
   * from 14: a metric card is what a screen is for, so it takes the roomier
   * side of the grid.
   */
  metricGap: 16,

  /**
   * The feature shortcut grid: four columns, and never a fifth.
   *
   * `tileGapY` is 16, up from the guide's 14. Vertical is the free direction —
   * the four columns are sized by width, and a taller gap between rows costs a
   * phone in portrait nothing across — and each tile is an icon over a label,
   * so the space between rows is what keeps a label from reading as the caption
   * of the icon underneath it.
   */
  tileColumns: 4,
  tileGapY: 16,
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
 * Elevation: exactly two shadows, and nothing else in the app may cast one
 * (issue #32).
 *
 * Revision 2 banned shadows outright, and it cost one real thing: a surface
 * that sits *over* the content could not be told from one that sits *in* it. A
 * docked "Simpan" pill was separated from the list scrolling behind it by one
 * `#EBEBEB` hairline, which disappears the moment a white row passes under it.
 *
 * **A shadow says where a surface is on the z-axis, never how important it
 * is.** The green pill is not given one to stand out — colour does that. A
 * card on the grey canvas is not given one either: white on `surfaceSunken`
 * already separates it, and a card does not float, it is the page.
 *
 * - **The light falls straight onto the screen**, so the shadow spreads evenly
 *   on every side: offset 0,0, never pushed downward as if lit from above.
 * - **Elevation is measured from base to top**, like a mountain from sea
 *   level, so the only thing that differs between the two is size: `low` is a
 *   surface one layer up and casts a narrow shadow, `high` floats clear of the
 *   layout and casts a wider, spread one.
 * - **The ink is navy, not black** — `surfaceInverse` at low opacity, the same
 *   hue as `scrim`, so a shadow reads as the same material as a dimmed page.
 *
 * | Surface | Token |
 * |---|---|
 * | Every bottom dock (the green pill, the transition buttons) | `low` |
 * | Kasir's totals foot, keypad foot and docked phone cart | `low` |
 * | A hand-drawn floating sheet (`role-switcher.tsx`) | `high` |
 * | Cards, rows, chips, tiles, fields | none |
 * | `RamahSheet` | none — the native sheet draws the platform's own |
 *
 * **It is `boxShadow`, not `elevation` and not the iOS `shadow*` quartet.**
 * `boxShadow` is the CSS model with spread and colour, drawn the same on both
 * platforms under the New Architecture; Android's `elevation` ignores colour on
 * most devices and has no spread, and `shadowOffset`/`shadowRadius` do nothing
 * on Android. Two things about it bite:
 *
 * - **It needs an opaque `backgroundColor`** on the surface that carries it, or
 *   nothing is drawn. Every dock here already has `surfacePage`.
 * - **Android draws an outset `boxShadow` only from Android 9 (API 28)**, and
 *   this app's `minSdk` is 24. Below 9 each token falls back to the hairline it
 *   replaced — a top line for `low`, whose surfaces all sit on the bottom edge,
 *   and a ring for `high` — so an old phone keeps today's look rather than
 *   losing the separation entirely.
 *
 * When a surface takes a token, its hairline on that edge goes: two depth cues
 * for one edge is one too many. And a shadow is never animated on its own; it
 * moves only with the surface that casts it.
 */
const boxShadowDrawn =
  Platform.OS !== 'android' || (typeof Platform.Version === 'number' && Platform.Version >= 28);

export const RamahElevation = {
  /** One layer over the content: a dock, a docked foot. */
  low: boxShadowDrawn
    ? { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 12, spreadDistance: 0, color: 'rgba(16,51,82,0.12)' }] }
    : { borderTopWidth: 1, borderTopColor: RamahColors.borderHairline },
  /** Clear of the layout, over everything: a floating sheet, a menu, a toast. */
  high: boxShadowDrawn
    ? { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 32, spreadDistance: 4, color: 'rgba(16,51,82,0.16)' }] }
    : { borderWidth: 1, borderColor: RamahColors.borderHairline },
} as const satisfies Record<string, ViewStyle>;

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
    // amber700, not amber600: `ink` also colours the score's one-line note,
    // which is small text and needs 4.5:1.
    return { tint: RamahColors.amber50, ink: RamahColors.amber700, border: RamahColors.amber100 };
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
