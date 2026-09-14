/**
 * Kasir — `LayarKasir.dc.html`, both of the layouts it draws.
 *
 * This replaces the blue "POS Kasir.dc.html" screen wholesale: the old palette
 * block (`const K`), the landscape lock, the pelanggan/kredit flow, the PIN
 * gate, the F-key action strip, the diskon-nota and pembulatan modes and the
 * transaction-history overlay are all gone, because the new board draws none of
 * them. What is on screen now is what that file draws and nothing else.
 *
 * ## Two layouts, chosen by width
 *
 * The board draws a **tablet** frame at 1194×820 — cart, product list, keypad
 * side by side — and a **phone** frame at 390×844, where the same three things
 * become a list with a cart docked under it and a keypad that rises as a sheet.
 * `hooks/use-breakpoint.ts` picks between them at `large` (905pt), not at
 * `tablet` (600pt): the three columns are 352 + flexible + 392 in the drawing,
 * and below about 900 the middle column has nothing left to be.
 *
 * **The width class is necessary and not sufficient here, and this screen is
 * the reason that sentence exists.** The three-column frame is 1194 x 820, and
 * a window can clear 905 on width while having nothing like 820 of height: a
 * 20:9 phone turned sideways is 936 x 432. It drew three columns — each pinned
 * to its minimum width, the product names cut to "Kertas H…", the keypad
 * clipped after its second row and its third column off the right edge of the
 * screen — because the only question asked was how wide the window was. `wide`
 * asks about the height too now, and the three columns **bend to meet it**: at
 * anything under 640 the keypad drops its caption, steps its readout down and
 * sizes its keys from what is left, so a 936 x 432 landscape phone gets the
 * three columns after all. `POS_COLUMNS_MIN_H` is the floor where that runs out
 * of give. A tablet is unaffected in either orientation.
 *
 * **The landscape lock is gone**, and that is the point of having a phone
 * layout at all. `expo-screen-orientation` is no longer imported here; a tablet
 * that is turned gets the layout its new width earns.
 *
 * ### Neither layout may carry a height off the drawing
 *
 * Both frames the board draws are generous — 820pt tall on the tablet, 844 on
 * the phone — and every fixed height taken off them overran on the sizes people
 * actually stand at a counter with. This screen shipped with three of them and
 * all three are gone:
 *
 * - The docked cart's 320pt cap, which capped the *box* while its head, list
 *   and totals foot were all at React Native's default `flexShrink: 0` and so
 *   kept their full height and ran out of the bottom of it. On Android that is
 *   not a cosmetic overflow — the platform's hit test stops at the parent's
 *   rect — so the pay button and the lowest cart rows were drawn and dead.
 *   `cartListMax` now caps the scrolling list *inside* the cart instead.
 * - The keypad's twelve `width: '31%'` keys in one `flexWrap` row, which at the
 *   905pt breakpoint came to 261.8pt of key in 260pt of column and silently
 *   became six rows of two. `KEY_ROWS` draws four rows of three `flex: 1` keys.
 * - The 54pt phone key, four of which plus the display, the chips and the two
 *   buttons are more than a 640pt phone sheet has. `keyH` derives it from the
 *   window and never goes under the guide's 44pt `tapMin`.
 * - The three columns' own minimum widths, which added up to 840 against a
 *   window that is only ever `width - insets.left - insets.right` wide by the
 *   time this screen sees it. A flex row does not wrap when its minimums do not
 *   fit; it overflows to the right, and on a screen there is nothing to the
 *   right. They add up to 820 now.
 *
 * The rule the three share: **when a column can run out of room, name the thing
 * that gives way.** A sibling with `flex: 1` will not volunteer — its flex
 * basis is already 0, so there is nothing in it left to take.
 *
 * ## What is not on screen, and why
 *
 * - **The "Umum / Langganan" tier chips.** The board draws them and fakes the
 *   second tier with a hardcoded 7% discount. `product_harga_jual_no_overlap`
 *   in the contract guarantees exactly one active price per (product, satuan)
 *   per date, so there is no second tier to read and no endpoint that would
 *   accept one. Katalog already shipped without the board's "Urut nama" chip
 *   for the same reason: a control that cannot change what the server answers
 *   is a promise the till would break at the counter.
 * - **PPN is here and is real**, which is the change since that rule was
 *   written: `POST /penjualan` takes a `ppn` **rupiah amount** exclusive of the
 *   price, so the client computes 11% and sends the money. The receipt carries
 *   the same figure.
 *
 * ## Where this screen sits, and why it has one button the board does not draw
 *
 * **Kasir is the middle tab, and the tab bar is hidden while it is open.** It
 * lives under `(admin)` so the bar can offer it at all, and
 * `app/(admin)/_layout.tsx` passes `hidden` to `NativeTabs` whenever the
 * segments say we are here — the container prop, which hides the *bar* and
 * leaves every tab reachable, not the trigger prop, which would make this route
 * unreachable. The reason is the bottom row: a 96pt pay button and a keypad
 * cannot share an edge with a tab bar, and a POS that shows the rest of the app
 * along its bottom is a POS somebody leaves by accident mid-sale.
 *
 * That is also why the `more-vertical` button exists. With the bar hidden it
 * is the only way out, and it has to be. **It carries two or three entries
 * now, not four — issue #25 moved "ganti wewenang", "printer struk" and
 * "keluar akun" to Profil**, the fifth tab: none of the three is about the
 * till itself, and once every tab is a thumb's reach away regardless of which
 * one is open, they no longer need to squat in this screen's overflow just to
 * stay reachable. What the sheet keeps is "Kembali" (the way out — the bar is
 * hidden, so this is what un-hides it), "Gudang" (only when there is a second
 * one to pick), and PPN, a setting this screen alone owns.
 *
 * **Insets: this screen owns its bottom edge and nothing else.** The group
 * layout pads top, left and right outside the navigator, so those are already
 * spent by the time this renders. The bottom is this screen's own because the
 * bar it would normally be padding for is not on screen — which is what
 * `ownsBottomInset` on the tab registry entry (`disableAutomaticContentInsets`
 * on the trigger) switches off. It is spent three times, each by whatever owns
 * that edge: the cart's totals foot, the keypad's CTA foot, and the product
 * list's `contentContainerStyle` on the tablet.
 *
 * ## Wired, and what it talks to
 *
 * The catalogue is `GET /pos/product` — the one read that answers product +
 * satuan + harga + `stok_akhir` for a whole page in three queries, which is why
 * the till uses it rather than `GET /product` (that payload carries no stock, no
 * satuan and no harga at all). It **requires** `id_ruang`, answers active
 * products only, never carries HPP, and sorts an exact `kode_barang` match to
 * the top — which is what the scanner path leans on.
 *
 * Finishing a sale is **two calls, and the order matters**. `POST /penjualan`
 * writes a `DRAFT`; `POST /penjualan/{id}/posting` is what actually moves stock,
 * fills every line's harga pokok from `kartu_stok`, and settles the note. If the
 * first succeeds and the second does not, the document exists — so `draftId`
 * remembers it and pressing the button again **posts that draft** rather than
 * writing a second one. A dropped connection must not become two sales.
 *
 * Three consequences of the contract that shape what is on screen:
 *
 * - **The nota number is the server's.** `nomor` is generated at creation
 *   (`PJ/KODE/2026/08/0001`, reset monthly by the document's own `tanggal`), so
 *   the board's "Nota TRX-2609-018" was a number this app invented. The header
 *   says "Nota baru" until there is a real one.
 * - **`id_harga_jual` travels with every line.** It names *which version of the
 *   price list* the amount came off, not the amount — which is the only way to
 *   tell a negotiated price from a stale one afterwards. `null` is allowed and
 *   means the figure was typed rather than looked up.
 * - **QRIS is posted `TUNAI`.** The contract knows TUNAI and KREDIT, and the
 *   difference between them is whether the shop is still owed money — not which
 *   instrument the money arrived by. A QRIS transfer has settled by the time the
 *   buyer leaves. The receipt still prints QRIS, because that is the word the
 *   person holding it needs.
 *
 * The printer is the other thing that is real: "Cetak struk" talks to a Bluetooth
 * Classic printer through `services/bluetooth-printer.ts`. It needs a dev build —
 * the native module is absent in Expo Go, where `isPrinterSupported()` answers
 * false and the sheet says so instead of failing silently.
 *
 * ## PPN is a setting, not a constant
 *
 * It can be switched off entirely and its rate can be changed, both from the
 * `more-vertical` menu, and the choice is remembered per device. Two reasons it
 * is not a number in this file: plenty of counters do not collect output VAT at
 * all, and the national rate has moved inside the working life of the shops this
 * is for. What crosses the wire is **rupiah, never the rate** — `penjualan.ppn`
 * is money, mirroring `pembelian.ppn`, so a posted note keeps telling the truth
 * after the rate changes. Exclusive: the price in `product_harga_jual` is the
 * DPP and this sits on top, so `total = subtotal + ppn`.
 *
 * Nothing on this screen is a mock any more. What is still *absent* is anything
 * the contract cannot serve from a till: no price tier (the "Umum / Langganan"
 * chips above), no pelanggan and therefore no KREDIT — a nota KREDIT needs an
 * `id_pelanggan` the counter has not asked for — and no diskon.
 */
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  useWindowDimensions,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahChip,
  RamahField,
  RamahIconButton,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSheet,
  RamahSheetOption,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahMotion,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import { atLeast, useBreakpoint } from '@/hooks/use-breakpoint';
import { messageOf } from '@/services/api';
import * as printer from '@/services/bluetooth-printer';
import { decimalToNumber, rupiahToDecimal } from '@/services/decimal';
import {
  AKSI,
  createPenjualan,
  jalankanAksi,
  penjualanBus,
} from '@/services/penjualan';
import { homeRouteFor, useActiveRole } from '@/services/permissions';
import {
  listPosProducts,
  type PosProductRow,
  type PosSatuanRow,
} from '@/services/produk';
import { listRuang, type RuangRow } from '@/services/ruang';
import {
  PAPER_LABEL,
  PAPER_OPTIONS,
  encodeReceipt,
  encodeTestReceipt,
  receiptDateTime,
  type PaperColumns,
  type ReceiptData,
} from '@/services/receipt';
import { useSession } from '@/services/session';

/**
 * The rate PPN starts at, as a percentage.
 *
 * A **default, not a constant** — the till can change it and can switch the tax
 * off entirely, and both live in `PpnPref` below. Indonesia's rate has moved
 * inside the life of shops this app is for, and plenty of counters do not charge
 * output VAT at all, so a hardcoded 11 was a number the screen would eventually
 * be wrong about with no way for anyone standing at it to say so.
 *
 * What crosses the wire is never this. `penjualan.ppn` is a **rupiah amount**,
 * mirroring `pembelian.ppn`: the client computes the percentage and sends the
 * money, because money is the figure a document has to keep telling the truth
 * about after the national rate changes. It is exclusive — the price in
 * `product_harga_jual` is the DPP and this sits on top — so
 * `total = subtotal + ppn` here.
 */
const PPN_DEFAULT_PERSEN = 11;

/** What the till remembers between shifts. Both are per-device preferences. */
const PPN_KEY = 'kasir.ppn';
const RUANG_KEY = 'kasir.ruang';

/** Matching `app/produk/index.tsx`: 20 a page, appended, de-duplicated by id. */
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Whether PPN is charged, and at what rate.
 *
 * Stored as one object under one key so a half-written preference cannot leave
 * the till charging 11% of nothing or 0% of something.
 */
interface PpnPref {
  aktif: boolean;
  persen: number;
}

/**
 * The two rates worth one tap. 11 is the standing rate and 12 the one several
 * categories moved to; anything else is typed, which is the field under them.
 */
const PPN_TARIF = [11, 12] as const;
const PPN_AWAL: PpnPref = { aktif: true, persen: PPN_DEFAULT_PERSEN };

/**
 * One row of the cart.
 *
 * It holds **ids, not copies**: the product and the unit are looked up in what
 * the catalogue answered, so a re-read that moves a price moves it here too. The
 * one thing that is not looked up is `qty`, which is the only thing the cashier
 * typed.
 */
interface Line {
  key: string;
  /** `PosProductRow.id`. */
  id: number;
  /** `PosSatuanRow.idSatuan` — unique within a product, unlike its name. */
  idSatuan: number;
  qty: number;
}

type Stage = 'jual' | 'bayar' | 'sukses';
type Metode = 'tunai' | 'qris';
interface ScanMsg {
  ok: boolean;
  text: string;
}

/**
 * How tall a window has to be before the till is drawn as three columns.
 *
 * **400, and the three columns get shorter to meet it.** The first version of
 * this gate was 640, counted off the keypad column drawn at its full size — a
 * 60pt readout under two lines of heading, four 78pt key rows, a 96pt pay button
 * — which came to about 612 and correctly sent a 20:9 phone in landscape (936 x
 * 432) to the phone layout.
 *
 * That was the right fix for a layout that could not bend. This one bends: at
 * anything under 640 the keypad column drops its "Keypad jumlah" caption, the
 * readout steps down, the keys are sized from what is actually left, and the pay
 * button gives back the 24pt it does not need at 432. See `compact`. What is
 * left is a floor rather than a target — under 400 the keys reach the guide's
 * 44pt `tapMin` and there is nothing further to give, so the phone layout, which
 * puts the keypad in a sheet with the whole window to itself, is the better
 * answer and takes over.
 */
const POS_COLUMNS_MIN_H = 400;

/**
 * The one transition this screen runs, taken from the document module rather
 * than written out here.
 *
 * `penjualan` runs two — `DRAFT -> POSTED -> BATAL` — and the till only ever
 * does the first. The second, `batal`, is `SUPERADMIN` only and belongs on the
 * nota screen: the person who wrote a note must not be able to quietly unwrite
 * it, which is the same guarantee pembelian gets by splitting its posting.
 */
const POSTING = AKSI.find((a) => a.key === 'posting') ?? AKSI[0];

/**
 * Today, as the contract wants `tanggal`: a plain `YYYY-MM-DD` date.
 *
 * Built from the device's own calendar rather than from an ISO string sliced at
 * the T, because `toISOString` is UTC — a sale rung up after 7pm in WIB would
 * be dated tomorrow, and `nomor` is reset monthly by this very field.
 */
function tanggalHariIni(): string {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
/** The keypad, in the board's order: three columns, C and Del either side of 0. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'Del'] as const;

/**
 * The same twelve keys, cut into the four rows they are drawn in.
 *
 * **The rows are explicit rather than `flexWrap` over a `width: '31%'` key**,
 * which is what this was and which broke at the narrow end of both layouts.
 * Three keys at 31% plus two gaps only fit while the gaps are small relative to
 * the column, and at the tablet breakpoint they are not: at 905pt the keypad
 * column is pinned to its own 300pt minimum, which leaves 260 of content for
 * 3 x 80.6 + 2 x 10 = 261.8. One and a half points over, so the third key
 * wrapped and the pad silently became six rows of two — taller than the column,
 * with "Del" alone on the last line. A row holding exactly three `flex: 1` keys
 * cannot do that at any width, and the keys still divide whatever they are
 * given.
 */
const KEY_ROWS: readonly (readonly string[])[] = [
  KEYS.slice(0, 3),
  KEYS.slice(3, 6),
  KEYS.slice(6, 9),
  KEYS.slice(9, 12),
];

// ---- font scaling ----
// This screen is the densest in the app — on a tablet three columns have to
// stay on screen at once — so the usual blanket 1.4 cap on the system font size
// is more than it can absorb. The cap is derived from the text's own size
// instead, and it goes *down* as the text gets bigger: an 11px column header is
// what somebody who enlarged their system font actually needs enlarged, while
// the 28px keypad readout is already legible from across the counter and
// growing it only pushes the columns apart.
function fontCap(size: number | undefined): number {
  if (size === undefined) return 1.3; // inherits from a parent Text, already capped
  if (size >= 20) return 1; // the readouts: total, keypad, kembalian
  if (size >= 15) return 1.15; // row names and key labels — text in a sized box
  return 1.3; // labels, hints, captions
}

/**
 * `Text` with that cap applied, shadowing the react-native import for the rest
 * of this file so every call site gets it without a prop.
 */
function Text({ style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const size = (StyleSheet.flatten(style) as TextStyle | undefined)?.fontSize;
  return (
    <RNText style={style} maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontCap(size)} {...rest} />
  );
}

/**
 * The unit a line is priced in, by id.
 *
 * By **id and not by name**: `product_satuan` is keyed on `id_satuan`, two
 * products can register units with the same word, and `penjualan_detail` wants
 * the id anyway. The fallback to the base unit is for a catalogue re-read that
 * dropped a unit while it sat in the cart — a line still has a quantity and has
 * to price it as something.
 */
function satuanOf(p: PosProductRow, idSatuan: number): PosSatuanRow | null {
  return p.satuan.find((s) => s.idSatuan === idSatuan) ?? p.dasar;
}

/**
 * Which unit a tap on the catalogue adds.
 *
 * `is_default_input` is the contract's own answer to "which unit does this shop
 * sell this in", and it is not always the base unit — a shop that stocks in rim
 * and sells in rim marks rim, one that stocks in pcs and sells by the dus marks
 * the dus. Falling back to the base unit keeps a product with nothing marked
 * sellable.
 */
function satuanInput(p: PosProductRow): PosSatuanRow | null {
  return p.satuan.find((s) => s.def) ?? p.dasar ?? p.satuan[0] ?? null;
}

/**
 * A unit's price as a number, for arithmetic on screen only.
 *
 * Money crosses the wire as a decimal string and `services/decimal.ts` is the
 * only place that boundary is crossed. A unit with no price version in force
 * answers `null` for both `harga` and `idHarga`, and reads as 0 here — the row
 * is still drawn, because "this has no price today" is something the person at
 * the counter needs to see rather than a product that has vanished.
 */
function hargaOf(s: PosSatuanRow | null): number {
  return decimalToNumber(s?.harga);
}

export default function KasirScreen() {
  const router = useRouter();
  const session = useSession();
  // Only `insets.bottom` is read here. Top, left and right are spent by
  // `app/(admin)/_layout.tsx` outside the navigator — see the file header.

  const role = useActiveRole();
  const bp = useBreakpoint();
  const insets = useSafeAreaInsets();
  /**
   * The window's height, read with the hook rather than `Dimensions.get` — it
   * is a runtime value like an inset, and a rotation does not itself cause the
   * render a one-shot read would be sampled in.
   */
  const winH = useWindowDimensions().height;

  /**
   * The three-column frame — **wide enough _and_ tall enough**, not
   * `atLeast(bp, 'large')` on its own.
   *
   * The width half is the board's: its columns are 352 + flexible + 392, and
   * below about 900 the middle one has nothing left to be. The height half is
   * the correction, and it is worth the paragraph because the first version of
   * this line was wrong in a way that only one shape of device shows.
   *
   * `hooks/use-breakpoint.ts` classifies the *window*, and it is right to do
   * that on width alone — a tablet held upright is 820pt wide and a phone
   * turned sideways used to be about 660, so width sorted them and orientation
   * would have got both backwards. What that reasoning was written against is a
   * 16:9 phone. A 20:9 one turned sideways is **936 x 432**: past the 905
   * threshold on width, and with 432pt of height for a column whose own stack
   * is a 60pt readout, four 78pt key rows and a 96pt pay button — about 610
   * before anything is spare. So it drew three columns, each pinned to its
   * minimum width, over a keypad clipped after its second row.
   *
   * Hence `POS_COLUMNS_MIN_H`. A real tablet clears it in landscape (820) and
   * falls to the phone layout in portrait on width (820 < 905), which is the
   * same answer as before; the landscape phone now gets the phone layout, which
   * is what it could always hold.
   */
  const wide = atLeast(bp, 'large') && winH >= POS_COLUMNS_MIN_H;

  /**
   * The two heights on this screen that a short window cannot absorb.
   *
   * Both were fixed numbers taken off the board's 844pt-tall phone frame, and
   * both overran on the sizes people actually stand at a counter with: a 640pt
   * Android phone, and any phone held sideways, where the whole window is ~430
   * tall. A fixed 54pt key times four rows plus the display, the chips and two
   * buttons is more than such a sheet has, and a 320pt cart on a 430pt window
   * leaves the product list nothing at all.
   */
  /** Never below the guide's 44pt `tapMin`, and never above the board's 54. */
  const keyH = Math.round(Math.max(L.tapMin, Math.min(54, winH * 0.075)));
  /**
   * How tall the docked cart's *scrollable* region may grow.
   *
   * The cap moved off the cart as a whole and onto the list inside it, which is
   * the fix for the bug this screen shipped with: with the cap on the
   * container, its head, list and totals foot were all `flexShrink: 0` (React
   * Native's default, unlike CSS) and simply overran the 320, so the third cart
   * row down and the Bayar button under it were drawn outside the container's
   * own bounds. On Android that is not a cosmetic overflow — the platform hit
   * test stops at the parent's rect, so those rows were visible and could not
   * be tapped. Capping only the list means the totals and the pay button are
   * always inside the box, and the rows above them scroll.
   */
  const cartListMax = Math.round(Math.max(88, Math.min(196, winH * 0.24)));

  const cashierName = session?.user.nama_lengkap || session?.user.username || 'Kasir';

  const [lines, setLines] = useState<Line[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [seq, setSeq] = useState(1);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<Stage>('jual');
  const [metode, setMetode] = useState<Metode>('tunai');
  const [uang, setUang] = useState(0);
  /** What the keypad has typed since the last commit; empty means "untouched". */
  const [buf, setBuf] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [scanMsg, setScanMsg] = useState<ScanMsg | null>(null);
  const [printed, setPrinted] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [ppnOpen, setPpnOpen] = useState(false);
  const [ruangOpen, setRuangOpen] = useState(false);

  const [dev, setDev] = useState<printer.PrinterDevice | null>(null);
  const [paired, setPaired] = useState<printer.PrinterDevice[]>([]);
  const [paper, setPaper] = useState<PaperColumns>(32);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerErr, setPrinterErr] = useState('');

  const searchRef = useRef<TextInput>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- PPN, remembered per device -----------------------------------------

  /**
   * Starts **on at the default rate** rather than off, because a till that
   * silently stops charging tax after a reinstall is the expensive direction of
   * the two mistakes. A read that fails leaves this exactly as it is; the
   * setting is one sheet away and the rate is printed on the totals line either
   * way, so nothing about it is hidden.
   */
  const [ppnPref, setPpnPref] = useState<PpnPref>(PPN_AWAL);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PPN_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw) as Partial<PpnPref>;
        // Validated rather than trusted: this is a file on the device, and a
        // persen of NaN would put a NaN on every nota from then on.
        const persen = Number(saved.persen);
        setPpnPref({
          aktif: saved.aktif === true,
          persen:
            Number.isFinite(persen) && persen >= 0 && persen <= 100
              ? persen
              : PPN_DEFAULT_PERSEN,
        });
      })
      .catch(() => {
        /* a device with no preference file is a device on the default */
      });
    return () => {
      alive = false;
    };
  }, []);

  function simpanPpn(next: PpnPref) {
    setPpnPref(next);
    // Fire and forget: the till must not wait on a disk write between customers,
    // and the worst a failed write costs is the default coming back next launch.
    void AsyncStorage.setItem(PPN_KEY, JSON.stringify(next)).catch(() => {});
  }

  // ---- which gudang this till sells out of --------------------------------

  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [ruangErr, setRuangErr] = useState('');
  /** False until `GET /ruang` has answered — before that there is nothing to read *from*. */
  const [ruangReady, setRuangReady] = useState(false);

  /**
   * The gudang list, once, exactly as `app/produk/index.tsx` does it.
   *
   * `GET /ruang` already answers only the rooms inside the session's active unit
   * kerja, so whatever comes back is the set that may be chosen. A remembered
   * choice is honoured only if it is still in that set: switching grant changes
   * the unit kerja, and a room from the old one answers 404 on every read.
   *
   * The till needs this more than the catalogue does. `GET /pos/product`
   * **requires** `id_ruang`, every balance and price on this screen belongs to
   * it, and so does the nota — `penjualan.id_ruang` is where the stock actually
   * leaves from.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [answer, saved] = await Promise.all([
          listRuang({ size: 100, is_aktif: true }),
          AsyncStorage.getItem(RUANG_KEY).catch(() => null),
        ]);
        if (!alive) return;
        setRuangList(answer.data);
        const remembered = answer.data.find((r) => r.id === Number(saved));
        const pick = remembered ?? answer.data[0];
        if (pick) {
          setRuangId(pick.id);
          setRuangErr('');
        } else {
          setRuangErr('Tidak ada gudang di unit kerja ini, jadi kasir tidak bisa menjual.');
        }
      } catch (e) {
        if (!alive) return;
        setRuangErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      } finally {
        if (alive) setRuangReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function pilihRuang(r: RuangRow) {
    setRuangOpen(false);
    if (r.id === ruangId) return;
    setRuangId(r.id);
    // The cart belongs to the room it was picked from: every line's stock guard
    // and every price was read against that `id_ruang`, and a nota can only draw
    // from one. Carrying it across would be a nota priced against a room it does
    // not come out of.
    setLines([]);
    setSel(null);
    setBuf('');
    void AsyncStorage.setItem(RUANG_KEY, String(r.id)).catch(() => {});
  }

  const ruang = ruangList.find((r) => r.id === ruangId) ?? null;

  // ---- the catalogue ------------------------------------------------------

  const [katalog, setKatalog] = useState<PosProductRow[]>([]);
  /**
   * Every product the till has seen this session, by id.
   *
   * The cart holds ids, and the catalogue underneath it moves: a search narrows
   * it, the next page appends to it. Without this, typing into the search field
   * would blank the name and the price of everything already in the basket. It
   * only grows, and it is bounded by how many distinct products one shift
   * actually touches.
   */
  const [kenal, setKenal] = useState<Record<number, PosProductRow>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [katalogErr, setKatalogErr] = useState('');
  const [search, setSearch] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * The two halves of "is the list loading", written the way
   * `app/produk/index.tsx` writes them and for the same reason: the key the
   * screen *wants* loaded, built during render from the inputs, and the key it
   * *has* loaded, written once when a read settles. Loading is the two
   * disagreeing. Nothing is set on the way in, so a stale response cannot un-set
   * a flag the next request just set.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = ruangId === null ? '' : `${ruangId}|${search}|${reloadToken}`;
  const katalogLoading = !ruangReady || (ruangId !== null && loadedKey !== requestKey);

  // Search is server-side on `GET /pos/product`, so the field is debounced
  // rather than filtering the pages in hand — that is the lie a paged list must
  // not tell, because it hides rows that exist and simply have not been fetched.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  function ingat(rows: PosProductRow[]) {
    setKenal((cur) => {
      const next = { ...cur };
      for (const r of rows) next[r.id] = r;
      return next;
    });
  }

  useEffect(() => {
    if (ruangId === null) return;
    let alive = true;
    (async () => {
      try {
        const answer = await listPosProducts({
          id_ruang: ruangId,
          page: 1,
          size: PAGE_SIZE,
          search,
        });
        if (!alive) return;
        setKatalog(answer.data);
        ingat(answer.data);
        setPage(1);
        setHasMore((answer.paging.page ?? 1) < (answer.paging.total_page ?? 1));
        setKatalogErr('');
        setMoreErr('');
      } catch (e) {
        if (!alive) return;
        setKatalog([]);
        setHasMore(false);
        setKatalogErr(messageOf(e, 'Katalog kasir gagal dimuat.'));
      } finally {
        // Answered either way: a failed read is still an answer, and it is what
        // stops the spinner so the error line can be the thing on screen.
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestKey, ruangId, search]);

  /**
   * The next page, appended and de-duplicated by id.
   *
   * `onEndReached` fires repeatedly on one approach — the threshold is not a
   * guard — so the in-flight boolean is. A failed page halts the loop behind a
   * "Coba lagi" rather than a spinner that never ends.
   */
  const loadMore = useCallback(async () => {
    if (ruangId === null || loadingMore || katalogLoading || !hasMore || moreErr) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const answer = await listPosProducts({
        id_ruang: ruangId,
        page: next,
        size: PAGE_SIZE,
        search,
      });
      setKatalog((cur) => {
        const seen = new Set(cur.map((r) => r.id));
        return [...cur, ...answer.data.filter((r) => !seen.has(r.id))];
      });
      ingat(answer.data);
      setPage(next);
      setHasMore((answer.paging.page ?? 1) < (answer.paging.total_page ?? 1));
      setMoreErr('');
    } catch (e) {
      setMoreErr(messageOf(e, 'Halaman berikutnya gagal dimuat.'));
    } finally {
      setLoadingMore(false);
    }
  }, [ruangId, loadingMore, katalogLoading, hasMore, moreErr, page, search]);

  const reloadKatalog = useCallback(() => setReloadToken((n) => n + 1), []);

  // The cashier's printer is remembered across restarts; the socket itself is
  // only opened when something is actually printed.
  useEffect(() => {
    let alive = true;
    printer.loadSavedPrinter().then((saved) => {
      if (alive && saved) setDev((cur) => cur ?? saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => {
    if (msgTimer.current) clearTimeout(msgTimer.current);
  }, []);

  function flash(ok: boolean, text: string) {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setScanMsg({ ok, text });
    msgTimer.current = setTimeout(() => setScanMsg(null), 2200);
  }

  // ---- cart arithmetic -----------------------------------------------------

  /** The catalogue row behind a cart line, or `null` if it has fallen out. */
  function itemOf(id: number): PosProductRow | null {
    return kenal[id] ?? null;
  }

  /**
   * Base units of one product already spoken for by the cart, optionally
   * ignoring one line — which is what lets that line be re-measured against a
   * stock figure that does not count itself.
   */
  function usedBase(id: number, skipKey?: string): number {
    return lines.reduce((n, l) => {
      if (l.id !== id || l.key === skipKey) return n;
      const it = itemOf(l.id);
      const s = it ? satuanOf(it, l.idSatuan) : null;
      return n + l.qty * (s?.faktor ?? 1);
    }, 0);
  }

  /**
   * The most of this unit the line may hold.
   *
   * `stokAkhir` is **a reading, not a guarantee** — it is what the catalogue was
   * told when its page was fetched, and another till may have sold off the same
   * shelf since. The real check is posting, which writes `kartu_stok` and
   * refuses to take it negative. This guard exists so the common case is caught
   * at the counter rather than at the end of the sale.
   */
  function maxFor(l: Line): number {
    const it = itemOf(l.id);
    const s = it ? satuanOf(it, l.idSatuan) : null;
    if (!it || !s) return l.qty;
    return Math.floor((it.stokAkhir - usedBase(l.id, l.key)) / s.faktor);
  }

  function add(p: PosProductRow) {
    const sat = satuanInput(p);
    if (!sat) return;
    if (p.stokAkhir - usedBase(p.id) < sat.faktor) return;
    const found = lines.find((l) => l.id === p.id && l.idSatuan === sat.idSatuan);
    if (found) {
      setLines(lines.map((l) => (l.key === found.key ? { ...l, qty: l.qty + 1 } : l)));
      setSel(found.key);
    } else {
      const key = `L${seq}`;
      setLines([...lines, { key, id: p.id, idSatuan: sat.idSatuan, qty: 1 }]);
      setSeq(seq + 1);
      setSel(key);
    }
    setBuf('');
  }

  function setQty(key: string, next: number) {
    const l = lines.find((x) => x.key === key);
    if (!l) return;
    const qty = Math.max(0, Math.min(next, maxFor(l)));
    // Zero is a removal, not a quantity: a line reading "0 pcs" is a row that
    // has to be explained, and the x beside it already means the same thing.
    if (qty === 0) {
      setLines(lines.filter((x) => x.key !== key));
      setSel(null);
      setBuf('');
      return;
    }
    setLines(lines.map((x) => (x.key === key ? { ...x, qty } : x)));
  }

  function setSatuan(key: string, idSatuan: number) {
    const l = lines.find((x) => x.key === key);
    if (!l) return;
    const it = itemOf(l.id);
    const s = it ? satuanOf(it, idSatuan) : null;
    if (!it || !s) return;
    const max = Math.floor((it.stokAkhir - usedBase(l.id, key)) / s.faktor);
    // Switching to a unit there is not one whole of would put the line into a
    // state the stepper could not get out of, so the switch simply does not
    // happen — the chip stays where it was.
    if (max < 1) return;
    setLines(
      lines.map((x) => (x.key === key ? { ...x, idSatuan, qty: Math.min(l.qty, max) } : x))
    );
    setSel(key);
    setBuf('');
  }

  function removeLine(key: string) {
    setLines(lines.filter((x) => x.key !== key));
    setSel(null);
    setBuf('');
  }

  /**
   * The cart, resolved against the catalogue once per render.
   *
   * A line whose product is no longer known is dropped rather than drawn blank:
   * it cannot be priced, so it cannot be sold, and a nameless row beside a total
   * is worse than one row fewer.
   */
  const cartRows = lines.flatMap((l) => {
    const it = itemOf(l.id);
    const s = it ? satuanOf(it, l.idSatuan) : null;
    if (!it || !s) return [];
    const harga = hargaOf(s);
    return [{ l, it, s, harga, sub: l.qty * harga, max: maxFor(l) }];
  });

  const sub = cartRows.reduce((n, r) => n + r.sub, 0);
  /**
   * Rupiah, rounded to whole money, and **zero when the tax is switched off**.
   *
   * `Math.round` rather than a decimal library because this is the last step
   * before `rupiahToDecimal`, the smallest unit the contract deals in here is
   * the rupiah, and the server re-checks `total` against `subtotal -
   * diskon_nota + ppn + pembulatan`: a fraction of a rupiah would fail that
   * check rather than disagree quietly.
   */
  const ppn = ppnPref.aktif ? Math.round((sub * ppnPref.persen) / 100) : 0;
  const total = sub + ppn;

  const isBayar = stage === 'bayar';
  const isSukses = stage === 'sukses';
  const isQris = metode === 'qris';
  const kurang = !isQris && uang < total;
  const kembali = isQris ? 0 : Math.max(0, uang - total);
  const selRow = cartRows.find((r) => r.l.key === sel) ?? null;

  // ---- keypad --------------------------------------------------------------

  function press(d: string) {
    if (isBayar) {
      const next = (buf + d).replace(/^0+/, '').slice(0, 9);
      setBuf(next);
      setUang(parseInt(next || '0', 10));
      return;
    }
    if (!sel) return;
    const next = (buf + d).replace(/^0+/, '').slice(0, 4);
    setBuf(next);
    setQty(sel, parseInt(next || '0', 10));
  }

  function clearEntry() {
    if (isBayar) {
      setBuf('');
      setUang(0);
      return;
    }
    if (!sel) return;
    setBuf('');
    setQty(sel, 1);
  }

  function backspace() {
    const next = buf.slice(0, -1);
    if (isBayar) {
      setBuf(next);
      setUang(parseInt(next || '0', 10));
      return;
    }
    if (!sel) return;
    setBuf(next);
    setQty(sel, parseInt(next || '0', 10));
  }

  function pressKey(k: string) {
    if (k === 'C') clearEntry();
    else if (k === 'Del') backspace();
    else press(k);
  }

  // ---- scanning ------------------------------------------------------------

  /**
   * A scanner is a keyboard that types a code and presses Enter, which is why
   * this hangs off the search field's submit rather than off a camera.
   *
   * The lookup is **server-side now**: `GET /pos/product` sorts an exact
   * `kode_barang` match to the top, which is exactly what a scan needs, and it
   * reaches a product the till has not paged to yet — which searching the pages
   * in hand could never do. The exact-match test is repeated here because that
   * endpoint *sorts* rather than filters: a code matching nothing still answers
   * rows, and adding the first of them would put the wrong product in the
   * basket.
   */
  async function scan(raw: string) {
    const code = raw.trim();
    if (!code || ruangId === null) return;
    setQ('');
    try {
      const answer = await listPosProducts({
        id_ruang: ruangId,
        page: 1,
        size: 5,
        search: code,
      });
      const key = code.toLowerCase();
      const hit =
        answer.data.find((i) => i.kode.toLowerCase() === key) ??
        answer.data.find((i) => i.nama.toLowerCase() === key);
      if (!hit) {
        flash(false, `Kode "${code}" tidak ditemukan.`);
        return;
      }
      ingat([hit]);
      const sat = satuanInput(hit);
      if (!sat || hit.stokAkhir - usedBase(hit.id) < sat.faktor) {
        flash(false, `${hit.nama} — stok habis.`);
        return;
      }
      add(hit);
      flash(true, `+1 ${sat.nama} · ${hit.nama}`);
    } catch (e) {
      flash(false, messageOf(e, 'Pencarian kode gagal.'));
    }
  }

  function toggleFocus() {
    const next = !focus;
    setFocus(next);
    setScanMsg(null);
    if (next) setTimeout(() => searchRef.current?.focus(), 0);
  }
  // ---- stages --------------------------------------------------------------

  /**
   * The nota being written, once the server has given it a number.
   *
   * There is nothing to show before that. `nomor` is generated server-side
   * (`PJ/KODE/2026/08/0001`, reset monthly by the document's own `tanggal`), so
   * the board's "Nota TRX-2609-018" was a number this app invented and the
   * server would never have agreed with. Until the sale is written the header
   * says "Nota baru", which is true.
   */
  const [nota, setNota] = useState('');
  /**
   * The id of a nota that was created but **not** posted.
   *
   * This is the one piece of bookkeeping the two-step sale needs. `POST
   * /penjualan` writes a `DRAFT` and `POST /penjualan/{id}/posting` is what
   * moves the stock; if the first succeeds and the second fails — a lost
   * network, a line that has gone short since the page was read — the document
   * exists. Pressing the button again must **post that draft**, never create a
   * second one, or a failed connection turns into a duplicate sale.
   */
  const [draftId, setDraftId] = useState<number | null>(null);
  const [jualBusy, setJualBusy] = useState(false);
  const [jualErr, setJualErr] = useState('');

  function goBayar() {
    if (!cartRows.length) return;
    setStage('bayar');
    setUang(0);
    setBuf('');
    setJualErr('');
    if (!wide) setSheetOpen(true);
  }

  function batalBayar() {
    setStage('jual');
    setUang(0);
    setBuf('');
    setSheetOpen(false);
  }

  /**
   * Writes the sale, then posts it.
   *
   * **`jenis_pembayaran` is `TUNAI` for both methods on this screen.** The
   * contract knows two kinds of nota, TUNAI and KREDIT, and the difference is
   * whether the shop is owed money afterwards — not which instrument the money
   * arrived by. A QRIS transfer has settled by the time the buyer walks away, so
   * it is a cash note; calling it KREDIT would open a receivable against a
   * customer record that does not exist, which the contract refuses anyway. The
   * receipt still prints QRIS, because that is what the person at the counter
   * needs to recognise.
   *
   * `id_harga_jual` travels with every line and is the reason this is wired the
   * long way round rather than sending a price. It names **which version of the
   * price list** the amount came off, so a negotiated figure can afterwards be
   * told from a stale one. It is `null` when the unit has no version in force,
   * which the contract allows — the number is then simply what was charged.
   */
  async function selesai() {
    if (!isQris && uang < total) return;
    if (!cartRows.length || ruangId === null || jualBusy) return;
    setJualBusy(true);
    setJualErr('');
    // Declared outside the try so the catch can tell the two failures apart: a
    // create that never happened, and a create that happened and was not posted.
    let id = draftId;
    let nomor = nota;
    try {
      if (id === null) {
        const doc = await createPenjualan({
          tanggal: tanggalHariIni(),
          id_ruang: ruangId,
          jenis_pembayaran: 'TUNAI',
          ppn: rupiahToDecimal(ppn),
          detail: cartRows.map((r) => ({
            id_product: r.it.id,
            id_satuan_input: r.s.idSatuan,
            qty_input: String(r.l.qty),
            id_harga_jual: r.s.idHarga,
            harga_satuan_input: rupiahToDecimal(r.harga),
          })),
        });
        id = doc.id;
        nomor = doc.nomor;
        setDraftId(doc.id);
        setNota(doc.nomor);
      }
      const posted = await jalankanAksi(id, POSTING, '');
      setNota(posted.nomor || nomor);
      // The nota list, if it is mounted behind the tabs, is now out of date.
      penjualanBus.publish({ kind: 'reload' });
      setStage('sukses');
      setSheetOpen(false);
      // The balances this screen showed were read before the sale; the next
      // customer must not be quoted stock this one just took.
      reloadKatalog();
    } catch (e) {
      const pesan = messageOf(e, 'Nota gagal disimpan.');
      // Which half failed is the whole of what the cashier needs to know. If the
      // document exists, saying so — and saying that the stock has *not* moved —
      // is the difference between pressing the button again and typing the
      // basket a second time.
      setJualErr(
        id === null
          ? pesan
          : `Nota ${nomor} sudah tersimpan tapi belum diposting — stok belum keluar. ${pesan}`
      );
    } finally {
      setJualBusy(false);
    }
  }

  function notaBaru() {
    setLines([]);
    setSel(null);
    setBuf('');
    setUang(0);
    setQ('');
    setMetode('tunai');
    setStage('jual');
    setPrinted(false);
    setNota('');
    setDraftId(null);
    setJualErr('');
  }
  // ---- printing ------------------------------------------------------------

  /**
   * Printing never blocks the till. The sale is already finished by the time
   * this runs, so a slow or absent printer costs the queue nothing and a
   * failure is reported where the button is rather than by refusing the sale.
   */
  async function cetak() {
    if (!dev) {
      openPrinter();
      return;
    }
    const data: ReceiptData = {
      nota,
      datetime: receiptDateTime(),
      kasir: cashierName,
      ruang: ruang?.nama ?? '',
      // The paper says how the money arrived; the document says whether the shop
      // is still owed anything. Different questions — see the note on selesai().
      jenis: isQris ? 'QRIS' : 'TUNAI',
      pelanggan: null,
      items: cartRows.map((r) => ({
        name: r.it.nama,
        qty: r.l.qty,
        unit: r.s.nama,
        price: r.harga,
        disc: 0,
      })),
      sub,
      notaDisc: 0,
      ppn,
      bulat: 0,
      total,
      paid: isQris ? total : uang,
      change: isQris ? 0 : kembali,
    };
    setPrinterErr('');
    try {
      await printer.ensureConnected(dev.address);
      await printer.write(dev.address, encodeReceipt(data, paper));
      setPrinted(true);
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Struk gagal dicetak.');
      openPrinter();
    }
  }

  async function loadPaired() {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureReady();
      setPaired(await printer.listBonded());
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Daftar printer tidak terbaca.');
    } finally {
      setPrinterBusy(false);
    }
  }

  /**
   * Opens the printer sheet with the paired-device list already loading.
   *
   * Issue #25 moved proactive printer management to Profil's own "Printer
   * Bluetooth" entry — the menu below no longer links here on its own — but
   * this screen still opens the same sheet twice: `cetak()` when no device is
   * chosen yet, and the success card's printer line to switch mid-shift.
   * `setMenuOpen(false)` is a harmless no-op from either call site; it only
   * ever did anything when this was also the menu's own handler.
   */
  function openPrinter() {
    setMenuOpen(false);
    setPrinterOpen(true);
    if (printer.isPrinterSupported() && !paired.length) void loadPaired();
  }

  async function choose(d: printer.PrinterDevice) {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureConnected(d.address);
      await printer.saveSelectedPrinter(d);
      setDev(d);
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Printer tidak bisa disambungkan.');
    } finally {
      setPrinterBusy(false);
    }
  }

  async function tesCetak() {
    if (!dev) return;
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureConnected(dev.address);
      await printer.write(dev.address, encodeTestReceipt(dev.name, paper));
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Tes cetak gagal.');
    } finally {
      setPrinterBusy(false);
    }
  }

  /**
   * The way out, and the only one: with the tab bar hidden there is nothing
   * else to press.
   *
   * `replace`, not `back()` — this is a tab root, so there is usually nothing
   * to pop, and "back" from a tab means whatever the navigator feels like.
   * `homeRouteFor` is asked rather than hardcoding `/beranda` because it is the
   * one place that knows where a grant belongs, and for a cashier that answer is
   * this very screen: staying put is the correct outcome for the one person who
   * has nowhere else to be.
   */
  function keluarKasir() {
    setMenuOpen(false);
    router.replace(homeRouteFor(role));
  }

  // ---- derived view data ---------------------------------------------------

  /**
   * The catalogue as rows, with what the cart has already claimed subtracted.
   *
   * No client-side filter any more: `search` went to the server, so what
   * `katalog` holds is already the answer to what was typed. Filtering it here
   * as well would hide rows that exist on a page not yet fetched, which is the
   * same lie a client-side search over a paged list always tells.
   */
  const produkRows = katalog.map((item) => {
    const sat = satuanInput(item);
    const sisa = item.stokAkhir - usedBase(item.id);
    return { item, sat, harga: hargaOf(sat), habis: !sat || sisa < sat.faktor };
  });

  /**
   * Uang pas, then the next 50k and 100k note above the total. Deduplicated,
   * because when the total is already a round 100.000 all three collapse into
   * one chip and three identical chips is worse than one.
   */
  const cepat = [...new Set([total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000])]
    .filter((v) => v > 0)
    .map((v, i) => ({ label: i === 0 ? 'Uang pas' : formatRupiah(v), value: v }));

  const padValue = isBayar
    ? uang
      ? formatNumber(uang)
      : '0'
    : selRow
      ? formatNumber(selRow.l.qty)
      : '0';
  const padContext = isBayar
    ? isQris
      ? 'Nominal QRIS terkunci'
      : 'Uang diterima'
    : selRow
      ? selRow.it.nama
      : 'Pilih barang di keranjang dulu';

  const printerLabel = !printer.isPrinterSupported()
    ? 'Printer bluetooth butuh dev build'
    : printed
      ? `Struk terkirim ke ${dev?.name ?? 'printer'}`
      : dev
        ? `Printer ${dev.name} · ${PAPER_LABEL[paper]}`
        : 'Printer belum dipilih';

  /** What the ⋮ menu says about the tax without opening the sheet. */
  const ppnLabel = ppnPref.aktif ? `Dikenakan ${formatNumber(ppnPref.persen)}%` : 'Tidak dikenakan';

  /**
   * The header's nota line.
   *
   * "Nota baru" until the server has issued a number, because it issues them —
   * `nomor` is generated at `POST /penjualan` and reset monthly by the
   * document's own `tanggal`, so anything shown before that is a guess the
   * server never agreed to.
   */
  const notaLabel = nota ? `Nota ${nota}` : 'Nota baru';

  /**
   * What the pay button says at the moment it is pressed.
   *
   * The third wording is the one that matters: after a nota has been created
   * but its posting has failed, the button must not read "Selesaikan
   * pembayaran" as though nothing had happened. `draftId` is what remembers
   * that, and pressing again posts that draft rather than writing a second
   * one — a lost connection turning into two sales is the failure this whole
   * two-step is arranged around.
   */
  const simpanLabel =
    draftId !== null
      ? 'Coba posting lagi'
      : isQris
        ? 'Sudah dibayar'
        : 'Selesaikan pembayaran';

  /**
   * How short the window is, and what the three columns give back to fit it.
   *
   * See `POS_COLUMNS_MIN_H`. A 20:9 phone in landscape is 936 x 432: wide enough
   * for the columns and nowhere near tall enough for the keypad drawn at the
   * board's tablet sizes. Rather than refuse the layout, the keypad column drops
   * its caption, steps the readout down, sizes its keys from what is actually
   * left, and gives the pay button back the height it does not need — a 96pt
   * button is for a cashier hitting it without looking on a tablet standing on a
   * counter, not for a phone held sideways.
   */
  const compact = wide && winH < 640;
  const padDisplayH = compact ? 44 : 60;
  const payH = compact ? 64 : 96;
  /**
   * Four rows of keys and three gaps, out of what the column has left after its
   * head and its foot. Never under the guide's 44pt `tapMin`; if the arithmetic
   * asks for less, `padBody` scrolls instead — which is survivable, where a key
   * too small to hit is not.
   */
  const wideKeyH = compact
    ? Math.max(
        L.tapMin,
        Math.min(78, Math.floor((winH - 120 - (payH + 30 + insets.bottom) - 24 - 30) / 4))
      )
    : 78;

  // ---- pieces --------------------------------------------------------------

  const searchField = (
    <View style={[styles.search, focus && { borderColor: C.brand }]}>
      <Feather
        name={focus ? 'maximize' : 'search'}
        size={RamahIcon.row}
        color={focus ? C.brand : C.iconMuted}
      />
      <TextInput
        ref={searchRef}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={(e) => scan(e.nativeEvent.text)}
        placeholder={
          focus ? 'Scan atau ketik kode barang, lalu Enter' : wide ? 'Cari nama barang' : 'Cari barang'
        }
        placeholderTextColor={C.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        // A scanner sends its whole code and then Enter; without this the field
        // closes the keyboard on the first Enter and the next scan types into
        // nothing.
        blurOnSubmit={false}
        style={styles.searchInput}
      />
      {focus ? <Text style={styles.searchHint}>Enter untuk tambah</Text> : null}
    </View>
  );

  const scanBanner = scanMsg ? (
    <View style={[styles.scanMsg, { backgroundColor: scanMsg.ok ? C.green50 : C.red50 }]}>
      <Feather
        name={scanMsg.ok ? 'check' : 'alert-circle'}
        size={RamahIcon.row}
        color={scanMsg.ok ? C.brand : C.textDanger}
      />
      <Text style={styles.scanMsgText}>{scanMsg.text}</Text>
    </View>
  ) : null;

  /**
   * The catalogue.
   *
   * **A `FlatList`, not a `ScrollView`.** It was a ScrollView while the
   * catalogue was eleven hard-coded items; wiring it to `GET /pos/product` made
   * it an appending list with no ceiling, and a ScrollView mounts every row it
   * has ever been given and keeps them all mounted. Four pages in, that is
   * eighty `Pressable`s re-rendering on every keystroke in the search field and
   * on every tap in the cart — which is what made the till feel heavy.
   *
   * `onEndReached` is also the real thing now rather than an `onScroll`
   * threshold computed by hand. It fires repeatedly on one approach, which is
   * why `loadMore` carries its own in-flight flag — the threshold is not a
   * guard.
   *
   * No `getItemLayout` and no `removeClippedSubviews`: the rows are a uniform
   * 56 here, but the repo's rule is to measure before claiming that, and the
   * name is allowed two lines.
   */
  const productList = (
    <FlatList
      data={produkRows}
      keyExtractor={(r) => String(r.item.id)}
      style={styles.produkScroll}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      // Only on the tablet: there the list runs to the bottom edge of the
      // window, while on the phone the docked cart sits under it and owns that
      // inset already.
      contentContainerStyle={wide ? { paddingBottom: insets.bottom } : undefined}
      renderItem={({ item: { item, sat, harga, habis } }) => (
        <ProdukRow
          nama={item.nama}
          harga={sat ? `${formatRupiah(harga)} / ${sat.nama}` : 'Belum ada harga'}
          habis={habis}
          wide={wide}
          onPress={() => {
            if (!isSukses && !habis) add(item);
          }}
        />
      )}
      ListEmptyComponent={
        /*
          No gudang is not an empty catalogue, it is a till that cannot sell:
          every read here needs an `id_ruang` and so does the nota. It is said
          where the products would have been, because that is where somebody is
          looking.
        */
        ruangErr ? (
          <View style={[styles.listNote, styles.listNoteGap]}>
            <RamahInlineError message={ruangErr} />
            {/* Issue #23: a unit kerja with no ruang used to strand the till
                here permanently, with nothing on screen to fix it. */}
            <RamahSecondaryButton
              label="Atur gudang"
              icon="settings"
              onPress={() => router.push('/pengaturan')}
            />
          </View>
        ) : katalogLoading ? (
          <View style={styles.listNote}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : katalogErr ? (
          <View style={styles.listNote}>
            <RamahInlineError message={katalogErr} onRetry={reloadKatalog} />
          </View>
        ) : (
          <Text style={styles.kosongCari}>
            {search
              ? `Tidak ada barang yang cocok dengan "${search}".`
              : 'Belum ada barang aktif di gudang ini.'}
          </Text>
        )
      }
      ListFooterComponent={
        /*
          A failed page halts the loop behind a button rather than a spinner that
          never ends — the same rule the catalogue screen follows. Without it a
          list that cannot fetch page 3 retries forever, silently, on every
          scroll.
        */
        moreErr ? (
          <View style={styles.listNote}>
            <RamahInlineError message={moreErr} onRetry={() => setMoreErr('')} />
          </View>
        ) : loadingMore ? (
          <View style={styles.listNote}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : null
      }
    />
  );

  const keypad = (
    <View style={wide ? styles.padGrid : styles.padGridPhone}>
      {KEY_ROWS.map((row) => (
        <View key={row[0]} style={wide ? styles.padRow : styles.padRowPhone}>
          {row.map((k) => (
            <PadKey
              key={k}
              label={k}
              wide={wide}
              height={wide ? wideKeyH : keyH}
              onPress={() => pressKey(k)}
            />
          ))}
        </View>
      ))}
    </View>
  );

  const metodeChips = (
    <View style={styles.chipRow}>
      <RamahChip
        label="Tunai"
        iconLeft="dollar-sign"
        selected={!isQris}
        onPress={() => setMetode('tunai')}
      />
      <RamahChip
        label="QRIS"
        iconLeft="grid"
        selected={isQris}
        onPress={() => {
          setMetode('qris');
          setUang(0);
          setBuf('');
        }}
      />
    </View>
  );

  const cepatChips = (
    <View style={styles.chipRow}>
      {cepat.map((c) => (
        <RamahChip
          key={c.value}
          label={c.label}
          onPress={() => {
            setUang(c.value);
            setBuf(String(c.value));
          }}
        />
      ))}
    </View>
  );

  const menu = (
    <RamahIconButton
      icon="more-vertical"
      label="Menu kasir"
      variant="plain"
      size={36}
      onPress={() => setMenuOpen(true)}
    />
  );

  // ---- layouts -------------------------------------------------------------

  return (
    <View style={styles.screen}>
      {wide ? (
        <View style={styles.columns}>
          {/* kolom 1 · keranjang */}
          <View style={styles.colCart}>
            <View style={styles.cartHead}>
              <View style={styles.headRow}>
                <Text style={styles.h3}>Keranjang</Text>
                <View style={styles.grow} />
                <Text style={styles.nota} numberOfLines={1}>
                  {notaLabel}
                </Text>
              </View>
            </View>

            <ScrollView style={styles.cartScroll} contentContainerStyle={styles.cartScrollPad}>
              {cartRows.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Belum ada barang</Text>
                  <Text style={styles.emptyBody}>
                    Ketuk barang di daftar tengah, lalu ketik jumlahnya langsung di kolom jumlah.
                  </Text>
                </View>
              ) : (
                <View style={styles.cartStack}>
                  {cartRows.map(({ l, it, s, harga, sub: barisSub, max }) => {
                    const selected = l.key === sel;
                    return (
                      <Pressable
                        key={l.key}
                        onPress={() => {
                          setSel(l.key);
                          setBuf('');
                        }}
                        style={[styles.cartLine, selected && { backgroundColor: C.green50 }]}>
                        <View style={styles.cartLineTop}>
                          <View style={styles.grow}>
                            <Text style={styles.lineName}>{it.nama}</Text>
                            <Text style={styles.lineSub}>
                              {formatRupiah(harga)} / {s.nama}
                            </Text>
                          </View>
                          <Text style={styles.lineTotal}>{formatRupiah(barisSub)}</Text>
                          <RamahIconButton
                            icon="x"
                            label={`Hapus ${it.nama}`}
                            variant="plain"
                            size={36}
                            onPress={() => removeLine(l.key)}
                          />
                        </View>

                        {selected && it.satuan.length > 1 ? (
                          <View style={styles.chipRow}>
                            {it.satuan.map((o) => (
                              <RamahChip
                                key={o.idSatuan}
                                label={`${o.nama} · ${formatRupiah(hargaOf(o))}`}
                                selected={o.idSatuan === l.idSatuan}
                                onPress={() => setSatuan(l.key, o.idSatuan)}
                              />
                            ))}
                          </View>
                        ) : null}

                        <View style={styles.stepper}>
                          <RamahIconButton
                            icon="minus"
                            label="Kurangi"
                            variant="outline"
                            size={36}
                            onPress={() => setQty(l.key, l.qty - 1)}
                          />
                          <TextInput
                            value={String(l.qty)}
                            onChangeText={(v) => {
                              const digits = v.replace(/[^0-9]/g, '');
                              setBuf(digits);
                              setQty(l.key, Math.max(1, parseInt(digits || '1', 10)));
                            }}
                            onFocus={() => {
                              setSel(l.key);
                              setBuf('');
                            }}
                            keyboardType="number-pad"
                            accessibilityLabel={`Jumlah ${it.nama}`}
                            maxFontSizeMultiplier={1}
                            style={styles.qtyInput}
                          />
                          <Text style={styles.lineSub}>{s.nama}</Text>
                          <View style={styles.grow} />
                          <RamahIconButton
                            icon="plus"
                            label="Tambah"
                            variant="tint"
                            size={36}
                            disabled={l.qty >= max || isSukses}
                            onPress={() => setQty(l.key, l.qty + 1)}
                          />
                        </View>

                        {l.qty >= max && max > 0 ? (
                          <Text style={styles.limit}>
                            Sisa stok hanya {formatNumber(max)} {s.nama}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={[styles.cartFoot, { paddingBottom: L.cardPad + insets.bottom }]}>
              <TotalLine label="Subtotal" value={formatRupiah(sub)} />
              {/*
                Drawn only when it is charged. A line reading "PPN 0%  Rp 0" on
                every nota of a shop that does not collect output VAT is a row
                nobody acts on, and the rate is in the label because it is a
                setting now rather than a constant — a receipt and a screen
                disagreeing about which rate was applied is the one thing this
                must never allow.
              */}
              {ppn > 0 ? (
                <TotalLine
                  label={`PPN ${formatNumber(ppnPref.persen)}%`}
                  value={formatRupiah(ppn)}
                />
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatRupiah(total)}</Text>
              </View>
            </View>
          </View>

          {/* kolom 2 · daftar barang */}
          <View style={styles.colList}>
            <View style={styles.listHead}>
              <View style={styles.headRow}>
                {searchField}
                <RamahIconButton
                  icon="maximize"
                  label={focus ? 'Mode fokus aktif' : 'Mode fokus scanner'}
                  variant={focus ? 'solid' : 'outline'}
                  size={36}
                  onPress={toggleFocus}
                />
              </View>
              {scanBanner}
            </View>
            {productList}
          </View>

          {/* kolom 3 · keypad */}
          <View style={styles.colPad}>
            <View style={[styles.padHead, compact && styles.padHeadCompact]}>
              {/*
                The caption is the first thing a short window gives up. It names
                what the column is, which the readout and the product name under
                it already say — and on a 432pt frame those 18pt are a whole key
                row's worth of the difference between fitting and scrolling.
              */}
              {compact ? null : (
                <Text style={styles.padTitle}>{isBayar ? 'Langkah bayar' : 'Keypad jumlah'}</Text>
              )}
              <Text style={styles.padContext} numberOfLines={1}>
                {padContext}
              </Text>
              <View style={[styles.padDisplay, { height: padDisplayH }]}>
                <Text style={[styles.padValue, kurang && isBayar && { color: C.textDanger }]}>
                  {padValue}
                </Text>
              </View>
              {isBayar ? (
                <View style={styles.totalRow}>
                  <Text style={styles.lineSub}>{kurang ? 'Kurang' : 'Kembalian'}</Text>
                  <Text style={[styles.lineName, kurang && { color: C.textDanger }]}>
                    {formatRupiah(kurang ? total - uang : kembali)}
                  </Text>
                </View>
              ) : null}
            </View>

            <ScrollView style={styles.padBody} contentContainerStyle={styles.padBodyPad}>
              {isBayar ? metodeChips : null}
              {isBayar && !isQris ? cepatChips : null}
              {!isQris || !isBayar ? keypad : null}
              {isBayar && isQris ? (
                <View style={styles.qrisCard}>
                  <Text style={styles.lineName}>Tunjukkan QRIS ke pembeli</Text>
                  <Text style={styles.lineSub}>Nominal terkunci di {formatRupiah(total)}.</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.padFoot, { paddingBottom: L.cardPad + insets.bottom }]}>
              {jualErr ? <RamahInlineError message={jualErr} /> : null}
              {isBayar ? (
                <>
                  <RamahPrimaryButton
                    label={simpanLabel}
                    height={payH}
                    fontSize={compact ? 18 : 22}
                    busy={jualBusy}
                    disabled={!isQris && uang < total}
                    onPress={() => void selesai()}
                  />
                  <RamahTertiaryButton
                    label="Kembali ke keranjang"
                    height={48}
                    onPress={batalBayar}
                  />
                </>
              ) : (
                <RamahPrimaryButton
                  label={total > 0 ? `Bayar ${formatRupiah(total)}` : 'Bayar'}
                  height={payH}
                  fontSize={compact ? 18 : 22}
                  disabled={cartRows.length === 0}
                  onPress={goBayar}
                />
              )}
            </View>
          </View>

          <View style={styles.floatMenu}>{menu}</View>
        </View>
      ) : (
        <View style={styles.phone}>
          <View style={styles.phoneHead}>
            <View style={styles.headRow}>
              <Text style={styles.h3}>Kasir</Text>
              <View style={styles.grow} />
              <Text style={styles.nota} numberOfLines={1}>
                {notaLabel}
              </Text>
              {menu}
            </View>
            <View style={styles.headRow}>
              {searchField}
              <RamahIconButton
                icon="maximize"
                label={focus ? 'Mode fokus aktif' : 'Mode fokus scanner'}
                variant={focus ? 'solid' : 'outline'}
                size={36}
                onPress={toggleFocus}
              />
            </View>
            {scanBanner}
          </View>

          {productList}

          {/*
            The docked cart.

            **The cap is on the scrolling list inside it, not on the box.** The
            board draws the whole cart at 320 and that is what this was, but a
            `maxHeight` on a box whose children cannot shrink does not shorten
            anything — it just clips the box while the head, the list and the
            totals foot keep their full height and spill out of the bottom. See
            `cartListMax` for why that spill is a dead pay button on Android
            rather than a cosmetic overflow.
          */}
          <View style={styles.phoneCart}>
            <View style={styles.phoneCartHead}>
              <Text style={styles.lineName}>
                {lines.length ? `Keranjang · ${lines.length} barang` : 'Keranjang'}
              </Text>
            </View>
            <ScrollView
              style={[styles.phoneCartScroll, { maxHeight: cartListMax }]}
              contentContainerStyle={styles.phoneCartPad}>
              {cartRows.length === 0 ? (
                <Text style={styles.lineSub}>Ketuk barang di atas untuk menambahkannya.</Text>
              ) : (
                cartRows.map(({ l, it, s, harga, sub: barisSub }) => (
                  <KeranjangRow
                    key={l.key}
                    nama={it.nama}
                    sub={`${formatNumber(l.qty)} ${s.nama} · ${formatRupiah(harga)}`}
                    total={formatRupiah(barisSub)}
                    onPress={() => {
                      setSel(l.key);
                      setBuf('');
                      setSheetOpen(true);
                    }}
                  />
                ))
              )}
            </ScrollView>
            <View style={[styles.phoneFoot, { paddingBottom: 18 + insets.bottom }]}>
              <TotalLine
                label={ppn > 0 ? `Subtotal + PPN ${formatNumber(ppnPref.persen)}%` : 'Subtotal'}
                value={ppn > 0 ? `${formatRupiah(sub)} + ${formatRupiah(ppn)}` : formatRupiah(sub)}
              />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatRupiah(total)}</Text>
              </View>
              <RamahPrimaryButton
                label={total > 0 ? `Bayar ${formatRupiah(total)}` : 'Bayar'}
                disabled={cartRows.length === 0}
                onPress={goBayar}
              />
            </View>
          </View>
        </View>
      )}

      {/*
        The phone keypad is a sheet rather than a column, which is the board's
        own answer to 390pt: the same keys, the same quick-cash chips and the
        same satuan chips, over the cart it is editing.
      */}
      <RamahSheet visible={!wide && sheetOpen} title={padContext} onClose={() => setSheetOpen(false)}>
        <View style={styles.sheetBody}>
          <View style={styles.padDisplayPhone}>
            <Text style={[styles.padValuePhone, kurang && isBayar && { color: C.textDanger }]}>
              {padValue}
            </Text>
          </View>

          {isBayar ? (
            <View style={styles.headRow}>
              {metodeChips}
              <View style={styles.grow} />
              <Text style={[styles.lineSub, kurang && { color: C.textDanger }]}>
                {kurang
                  ? `Kurang ${formatRupiah(total - uang)}`
                  : `Kembali ${formatRupiah(kembali)}`}
              </Text>
            </View>
          ) : null}

          {!isBayar && selRow && selRow.it.satuan.length > 1 ? (
            <View style={styles.chipRow}>
              {selRow.it.satuan.map((o) => (
                <RamahChip
                  key={o.idSatuan}
                  label={`${o.nama} · ${formatRupiah(hargaOf(o))}`}
                  selected={o.idSatuan === selRow.l.idSatuan}
                  onPress={() => setSatuan(selRow.l.key, o.idSatuan)}
                />
              ))}
            </View>
          ) : null}

          {isBayar && !isQris ? cepatChips : null}
          {!isQris || !isBayar ? keypad : null}

          {isBayar && isQris ? (
            <View style={styles.qrisCard}>
              <Text style={styles.lineName}>Tunjukkan QRIS ke pembeli</Text>
              <Text style={styles.lineSub}>Nominal terkunci di {formatRupiah(total)}.</Text>
            </View>
          ) : null}

          {isBayar && jualErr ? <RamahInlineError message={jualErr} /> : null}
          <RamahPrimaryButton
            label={isBayar ? simpanLabel : 'Simpan jumlah'}
            busy={isBayar && jualBusy}
            disabled={isBayar && !isQris && uang < total}
            onPress={() => (isBayar ? void selesai() : setSheetOpen(false))}
          />
          {isBayar ? (
            <RamahTertiaryButton label="Kembali ke keranjang" height={48} onPress={batalBayar} />
          ) : null}
        </View>
      </RamahSheet>

      {/*
        The success screen. On the tablet the board draws it as a card over a
        scrim; on the phone it takes the whole frame. Both are the same content,
        so this is one block positioned two ways rather than two copies.
      */}
      {isSukses ? (
        <View style={[styles.suksesRoot, wide && styles.suksesScrim]}>
          {/*
            Scrollable, even though the card is short: at the largest system
            font size the mark, the two headings, the kembalian block and the
            two buttons are taller than a 640pt phone, and this layer is the one
            place on the screen with nothing behind it to scroll instead. It is
            also the last thing a cashier touches in a sale, so a "Transaksi
            baru" that has slid under the bottom edge strands the till.
          */}
          <ScrollView
            contentContainerStyle={[styles.suksesScroll, wide && styles.suksesScrollWide]}>
            <View
              style={[
                styles.suksesCard,
                wide && styles.suksesCardWide,
                // The phone card is the whole frame, so it pays the bottom inset
                // itself — on the tablet it is a floating card with the scrim's
                // own margin under it.
                !wide && { paddingBottom: 28 + insets.bottom },
              ]}>
              <View style={styles.suksesMark}>
                <Feather name="check" size={28} color={C.brand} />
              </View>
              <View>
                <Text style={styles.suksesTitle}>Pembayaran diterima</Text>
                <Text style={styles.suksesSub}>
                  {isQris ? 'QRIS' : 'Tunai'} · {formatRupiah(total)} · {cartRows.length} barang
                </Text>
                {/*
                  The number the server issued, on the one screen where somebody
                  might need to quote it — a nota that has to be found again is
                  found by this and nothing else.
                */}
                <Text style={styles.suksesSub}>
                  {notaLabel}
                </Text>
              </View>
              <View style={styles.kembaliCard}>
                <Text style={styles.lineSub}>Kembalian</Text>
                <Text style={styles.kembaliValue}>{formatRupiah(kembali)}</Text>
              </View>
              <View style={wide ? styles.suksesActionsWide : styles.suksesActions}>
                <View style={styles.grow}>
                  <RamahPrimaryButton label="Cetak struk" icon="printer" onPress={() => void cetak()} />
                </View>
                <View style={styles.grow}>
                  <RamahSecondaryButton label="Transaksi baru" onPress={notaBaru} />
                </View>
              </View>
              <Pressable
                onPress={openPrinter}
                accessibilityRole="button"
                accessibilityLabel={`${printerLabel}. Ganti printer`}>
                <Text style={styles.printerLabel}>{printerLabel}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/*
        The one piece of app chrome this screen carries — see the file header.
        `/kasir` sits outside the tab navigator, so without it the till is a
        room with no door.

        **Two entries, not five — issue #25.** "Ganti wewenang", "Printer
        struk" and "Keluar akun" moved to Profil, the fifth tab: none of the
        three is about the till itself, and now that every tab is a thumb's
        reach away regardless of which one is open, they no longer need to
        squat in this screen's overflow to be reachable. What is left is what
        actually belongs to this screen — the way out, the gudang this till
        sells out of, and PPN, a per-device setting owned by this screen and
        nowhere else.
      */}
      <RamahSheet visible={menuOpen} title="Menu kasir" onClose={() => setMenuOpen(false)}>
        <RamahSheetOption label="Kembali" sub="Tutup layar kasir" selected={false} onPress={keluarKasir} />
        {/*
          The gudang is not a preference, it is what every figure on this screen
          is *about*: `GET /pos/product` requires `id_ruang`, and the nota's own
          `id_ruang` is where the stock leaves from. It is offered only when
          there is a second one to pick — a shop with one storeroom does not need
          a menu entry telling it so.
        */}
        {ruangList.length > 1 ? (
          <RamahSheetOption
            label="Gudang"
            sub={ruang?.nama ?? 'Belum dipilih'}
            selected={false}
            onPress={() => {
              setMenuOpen(false);
              setRuangOpen(true);
            }}
          />
        ) : null}
        <RamahSheetOption
          label="PPN"
          sub={ppnLabel}
          selected={false}
          onPress={() => {
            setMenuOpen(false);
            setPpnOpen(true);
          }}
        />
      </RamahSheet>

      {/*
        PPN, which is a setting and not a constant.

        Two things are being decided and they are drawn as two things: whether
        the tax is charged at all, and at what rate. The first is the one that
        matters most often — plenty of counters do not collect output VAT — so it
        is two plain options rather than a switch hidden beside a number, and
        turning it off takes the rate field off screen instead of leaving a
        disabled box to wonder about.

        What is sent is never the rate. `penjualan.ppn` is a rupiah amount, so
        the note freezes the money; a document has to keep telling the truth
        after the national rate moves.
      */}
      <RamahSheet visible={ppnOpen} title="PPN" onClose={() => setPpnOpen(false)}>
        <RamahSheetOption
          label="Tidak dikenakan"
          sub="Total nota sama dengan subtotalnya"
          selected={!ppnPref.aktif}
          onPress={() => simpanPpn({ ...ppnPref, aktif: false })}
        />
        <RamahSheetOption
          label="Dikenakan di atas harga"
          sub={`Harga jual adalah DPP; pajaknya ditambahkan, bukan dipecah dari harga`}
          selected={ppnPref.aktif}
          onPress={() => simpanPpn({ ...ppnPref, aktif: true })}
        />
        {ppnPref.aktif ? (
          <View style={styles.sheetBody}>
            <View style={styles.chipRow}>
              {PPN_TARIF.map((t) => (
                <RamahChip
                  key={t}
                  label={`${formatNumber(t)}%`}
                  selected={ppnPref.persen === t}
                  onPress={() => simpanPpn({ ...ppnPref, persen: t })}
                />
              ))}
            </View>
            <RamahField
              label="Tarif lain"
              value={String(ppnPref.persen)}
              onChangeText={(v) => {
                // Digits and one separator only, and clamped: a rate outside
                // 0–100 is a typo, and the till would carry it onto every nota
                // until somebody noticed the totals.
                const angka = Number(v.replace(/[^0-9.]/g, ''));
                simpanPpn({
                  ...ppnPref,
                  persen: Number.isFinite(angka) ? Math.min(100, Math.max(0, angka)) : 0,
                });
              }}
              keyboardType="numeric"
              trailing={<Text style={styles.lineSub}>%</Text>}
              maxLength={6}
              accessibilityLabel="Tarif PPN dalam persen"
            />
          </View>
        ) : null}
      </RamahSheet>

      <RamahSheet visible={ruangOpen} title="Gudang" onClose={() => setRuangOpen(false)}>
        {ruangErr ? (
          <View style={styles.sheetBody}>
            <RamahInlineError message={ruangErr} />
          </View>
        ) : null}
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            sub={r.id === ruangId ? 'Sedang dipakai' : 'Keranjang akan dikosongkan'}
            selected={r.id === ruangId}
            onPress={() => pilihRuang(r)}
          />
        ))}
      </RamahSheet>

      <RamahSheet visible={printerOpen} title="Printer struk" onClose={() => setPrinterOpen(false)}>
        <View style={styles.sheetBody}>
          {!printer.isPrinterSupported() ? (
            <Text style={styles.lineSub}>
              Printer bluetooth hanya jalan di dev build — modul nativenya tidak ada di Expo Go.
            </Text>
          ) : (
            <>
              {printerErr ? <RamahInlineError message={printerErr} onRetry={() => void loadPaired()} /> : null}
              <Text style={styles.lineSub}>
                Perangkat yang sudah di-pair lewat Pengaturan Android. Tidak ada pemindaian di dalam
                app.
              </Text>
              {printerBusy ? <ActivityIndicator color={C.brand} /> : null}
              {paired.map((d) => (
                <RamahSheetOption
                  key={d.address}
                  label={d.name}
                  sub={d.address}
                  selected={dev?.address === d.address}
                  onPress={() => void choose(d)}
                />
              ))}
              <View style={styles.chipRow}>
                {PAPER_OPTIONS.map((cols) => (
                  <RamahChip
                    key={cols}
                    label={PAPER_LABEL[cols]}
                    selected={paper === cols}
                    onPress={() => setPaper(cols)}
                  />
                ))}
              </View>
              <View style={styles.headRow}>
                <View style={styles.grow}>
                  <RamahSecondaryButton
                    label="Buka Pengaturan Bluetooth"
                    onPress={() => printer.openBluetoothSettings()}
                  />
                </View>
                {dev ? (
                  <View style={styles.grow}>
                    <RamahSecondaryButton label="Tes cetak" onPress={() => void tesCetak()} />
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </RamahSheet>
    </View>
  );
}

// ---- small pieces ---------------------------------------------------------

/**
 * One "label … value" line above the total.
 *
 * Both halves shrink and neither wraps: the phone's docked foot prints
 * "Subtotal + PPN 11%" against two rupiah figures on ~328pt of width, and with
 * the row's children at their natural size a five-figure sale pushed the value
 * off the right edge instead of the label giving way.
 */
function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.lineSub, styles.grow]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.totalSmall, styles.shrink]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One row of the phone's docked cart: tap it to open the keypad on that line.
 *
 * A component rather than the inline `Pressable` it was, because press feedback
 * needs its own state and hooks cannot live in a `map`. It is not decoration
 * here — the row's only affordance was a chevron, and the sheet it raises takes
 * a moment to animate in, so without a pressed state a cashier who taps and
 * sees nothing move concludes the row does not respond and taps again.
 */
function KeranjangRow({
  nama,
  sub,
  total,
  onPress,
}: {
  nama: string;
  sub: string;
  total: string;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={`${nama}, ${sub}. Ubah jumlah`}
      style={[styles.phoneLine, down && { backgroundColor: C.grey50 }]}>
      <View style={styles.grow}>
        <Text style={styles.lineName}>{nama}</Text>
        <Text style={styles.lineSub}>{sub}</Text>
      </View>
      <Text style={styles.lineTotal}>{total}</Text>
      <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
    </Pressable>
  );
}

/**
 * One product row: 56pt, name on the left, price per default unit on the right.
 *
 * Out of stock is drawn at 45% and stops responding, which is the board's own
 * treatment. The row keeps its price rather than swapping in "Stok habis",
 * because what the cashier needs to tell the buyer is still the price — the
 * dimming already says it cannot go in the cart.
 */
function ProdukRow({
  nama,
  harga,
  habis,
  wide,
  onPress,
}: {
  nama: string;
  harga: string;
  habis: boolean;
  wide: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={habis}
      accessibilityRole="button"
      accessibilityState={{ disabled: habis }}
      accessibilityLabel={habis ? `${nama}, stok habis` : `${nama}, ${harga}`}
      style={[
        styles.produkRow,
        { paddingHorizontal: wide ? L.space5 : L.gutter },
        habis && { opacity: 0.45 },
        down && !habis && { backgroundColor: C.grey50 },
      ]}>
      {/*
        Two lines, not one. The row is `minHeight` rather than `height` so it
        can take the second, and "Kertas H…" beside a price is not a product
        anybody can pick off a list — the name is the whole of what this row is
        for. It stays on one line at any comfortable width; the second is what a
        squeezed middle column gets instead of an ellipsis three characters in.
      */}
      <Text style={styles.produkNama} numberOfLines={2}>
        {nama}
      </Text>
      <Text style={styles.produkHarga} numberOfLines={1}>
        {harga}
      </Text>
    </Pressable>
  );
}

/**
 * One keypad key. 78pt on the tablet; on the phone the caller derives the
 * height from the window, because the board's 54 is measured off an 844pt frame
 * and four rows of it do not fit a 640pt phone once the display, the chips and
 * the two buttons above and below have had their share.
 *
 * The width is not a number at all any more: the key is `flex: 1` inside a row
 * of exactly three, so it divides whatever the column or sheet gives it. See
 * `KEY_ROWS`.
 */
function PadKey({
  label,
  wide,
  height,
  onPress,
}: {
  label: string;
  wide: boolean;
  height: number;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const isDel = label === 'Del';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={isDel ? 'Hapus angka' : label === 'C' ? 'Kosongkan' : label}
      style={[
        wide ? styles.padKey : styles.padKeyPhone,
        { height },
        isDel && !wide && { backgroundColor: C.grey50 },
        down && { backgroundColor: C.grey100, transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      {isDel && !wide ? (
        <Feather name="delete" size={RamahIcon.header} color={C.iconDefault} />
      ) : (
        <Text style={wide ? styles.padKeyLabel : styles.padKeyLabelPhone}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceCard },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  // ---- tablet: three columns ----
  // The board's widths are 352 / flexible / 392 inside a 1194pt frame. Flex
  // ratios rather than fixed pixels, so a 1024 tablet and a 1366 one both get
  // the same proportions instead of one of them running out of middle column.
  columns: { flex: 1, flexDirection: 'row' },
  /*
    The minimums are 820 together, not 840, and the 20pt matters: they are what
    the columns fall back to when the window is only just wide enough, and the
    box they fall back inside is the window **minus its side insets**, which
    `app/(admin)/_layout.tsx` has already spent outside the navigator. A window
    of 905 with a 36pt cutout down one side leaves 869 of content; three columns
    adding up to 840 fit in that and three adding up to 869-and-one-more-pixel
    do not — and a flex row does not wrap, it overflows to the right, taking the
    keypad's third column off the edge of the screen with it.
  */
  colCart: { flex: 30, minWidth: 280, borderRightWidth: 1, borderRightColor: C.borderHairline },
  colList: { flex: 37, minWidth: 260, backgroundColor: C.grey100 },
  colPad: { flex: 33, minWidth: 280, borderLeftWidth: 1, borderLeftColor: C.borderHairline },

  cartHead: {
    paddingHorizontal: L.space5,
    paddingTop: L.cardPad,
    paddingBottom: L.cardGap,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
  },
  h3: { fontSize: 18, lineHeight: 24, ...W.semibold, color: C.textTitle },
  nota: { ...T.caption, color: C.textMuted },

  cartScroll: { flex: 1, backgroundColor: C.surfaceSunken },
  cartScrollPad: { padding: L.cardPad, paddingTop: L.cardGap },
  emptyCard: { padding: 18, borderRadius: R.card, backgroundColor: C.white, gap: 6 },
  emptyTitle: { ...T.rowTitle, color: C.textTitle },
  emptyBody: { ...T.caption, color: C.textBody },

  cartStack: { borderRadius: R.card, backgroundColor: C.surfaceStack, overflow: 'hidden' },
  cartLine: {
    paddingVertical: L.space3,
    paddingHorizontal: 14,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
    gap: L.space2,
  },
  cartLineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space2 },
  lineName: { ...T.rowTitle, color: C.textTitle },
  lineSub: { ...T.caption, color: C.textBody },
  lineTotal: { ...T.rowTitle, color: C.textTitle, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  qtyInput: {
    width: 64,
    height: 40,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
    backgroundColor: C.white,
    padding: 0,
    fontSize: 18,
    lineHeight: 24,
    ...W.bold,
    color: C.textTitle,
  },
  limit: { ...T.caption, color: C.textDanger },

  cartFoot: {
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
    paddingHorizontal: L.space5,
    paddingTop: L.space3,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: L.space2 },
  totalSmall: { ...T.caption, color: C.textTitle },
  totalLabel: { ...T.rowTitle, color: C.textTitle },
  totalValue: { fontSize: 24, lineHeight: 30, ...W.bold, color: C.textTitle },

  listHead: {
    paddingHorizontal: L.space5,
    paddingTop: 14,
    paddingBottom: L.space3,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
    gap: L.space2,
  },
  search: {
    flex: 1,
    minWidth: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingHorizontal: 14,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
  },
  searchInput: { flex: 1, minWidth: 0, padding: 0, ...T.body, color: C.textTitle },
  searchHint: { ...T.caption, color: C.brandInk },
  scanMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingVertical: L.space2,
    paddingHorizontal: L.space3,
    borderRadius: R.cardSm,
  },
  scanMsgText: { ...T.caption, color: C.textTitle, flex: 1, minWidth: 0 },

  produkScroll: { flex: 1, backgroundColor: C.white },
  produkRow: {
    // `minHeight`, not `height`: at a raised system font size the name and the
    // price per unit are both taller than the board's 56, and a fixed height
    // cuts the descenders off the row rather than growing it.
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
  },
  produkNama: { ...T.rowTitle, color: C.textTitle, flex: 1, minWidth: 0 },
  listNote: { paddingVertical: L.space5, paddingHorizontal: L.gutter, alignItems: 'center' },
  listNoteGap: { gap: L.space3 },
  produkHarga: { ...T.body, color: C.textBody, flexShrink: 1 },
  kosongCari: { ...T.caption, color: C.textMuted, padding: L.gutter },

  padHead: {
    paddingHorizontal: L.space5,
    paddingTop: L.cardPad,
    paddingBottom: L.cardGap,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
    gap: L.space2,
  },
  padHeadCompact: { paddingTop: L.space3, paddingBottom: L.space2, gap: 6 },
  padTitle: { ...T.micro, color: C.textMuted },
  padContext: { ...T.rowTitle, color: C.textTitle },
  padDisplay: {
    borderRadius: R.cardSm,
    backgroundColor: C.grey100,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: L.cardPad,
  },
  padValue: { fontSize: 28, lineHeight: 34, ...W.bold, color: C.textTitle },
  padDisplayPhone: {
    height: 64,
    borderRadius: R.cardSm,
    backgroundColor: C.grey100,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: L.cardPad,
  },
  padValuePhone: { fontSize: 30, lineHeight: 36, ...W.bold, color: C.textTitle },

  padBody: { flex: 1 },
  // `justifyContent: flex-end` is the board's: the keypad sits at the bottom of
  // its column, where a thumb reaches it, and grows upward when the payment
  // step adds chips above it.
  padBodyPad: { flexGrow: 1, justifyContent: 'flex-end', gap: L.cardGap, padding: L.space5, paddingVertical: L.space3 },
  padGrid: { gap: 10 },
  padRow: { flexDirection: 'row', gap: 10 },
  padKey: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.white,
  },
  padKeyLabel: { fontSize: 28, lineHeight: 34, ...W.semibold, color: C.textTitle },
  padGridPhone: { gap: L.space2 },
  padRowPhone: { flexDirection: 'row', gap: L.space2 },
  padKeyPhone: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.cardSm,
    borderWidth: 1,
    borderColor: C.borderHairline,
    backgroundColor: C.white,
  },
  padKeyLabelPhone: { fontSize: 21, lineHeight: 27, ...W.semibold, color: C.textTitle },
  qrisCard: { borderRadius: R.card, backgroundColor: C.sky50, padding: L.cardPad, gap: 6 },

  padFoot: {
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
    paddingHorizontal: L.space5,
    paddingTop: L.space3,
    gap: L.space2,
  },
  // The tablet frame has no header of its own, so the one chrome control hangs
  // in the top-right corner of the keypad column, clear of the columns' own
  // scrolls.
  floatMenu: { position: 'absolute', top: L.space2, right: L.space2 },

  // ---- phone: list over a docked cart ----
  phone: { flex: 1 },
  phoneHead: {
    paddingHorizontal: L.gutter,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
  },
  // `flexShrink: 1` is the last resort, and it is what keeps the pay button on
  // screen on a phone held sideways: there the window is ~360pt tall, the
  // product list above has already collapsed to its zero flex basis, and
  // something still has to give. The cart's own head and foot are unshrinkable,
  // so what gives is the list region between them — down to nothing if it has
  // to, which is survivable, where a totals foot drawn below the bottom edge is
  // not.
  phoneCart: { flexShrink: 1, borderTopWidth: 1, borderTopColor: C.borderHairline, backgroundColor: C.white },
  phoneCartHead: { paddingHorizontal: L.gutter, paddingTop: 10, paddingBottom: 6 },
  // `maxHeight` arrives per render from `cartListMax`. `flexShrink: 1` is the
  // half that was missing: React Native defaults it to 0, so this list held its
  // full content height and pushed the foot out of the cart.
  phoneCartScroll: { flexGrow: 0, flexShrink: 1 },
  phoneCartPad: { paddingHorizontal: L.gutter, paddingBottom: L.space2 },
  phoneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: L.tapMin,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderHairline,
  },
  phoneFoot: {
    paddingHorizontal: L.gutter,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
    gap: L.space2,
  },

  sheetBody: { paddingHorizontal: L.gutter, paddingBottom: L.cardPad, gap: 14 },

  // ---- success ----
  suksesRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: C.white,
  },
  suksesScrim: { backgroundColor: C.scrim },
  // The centring moved off the root and onto the scroll's content container:
  // `flexGrow: 1` keeps a short card centred in the frame, and a card taller
  // than the frame scrolls from the top instead of having its head cut off.
  suksesScroll: { flexGrow: 1, justifyContent: 'center' },
  suksesScrollWide: { alignItems: 'center' },
  suksesCard: { padding: 28, gap: L.cardPad },
  suksesCardWide: { width: 460, borderRadius: R.card, backgroundColor: C.white },
  suksesMark: {
    width: 56,
    height: 56,
    borderRadius: R.pill,
    backgroundColor: C.green100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suksesTitle: { fontSize: 22, lineHeight: 28, ...W.semibold, color: C.textTitle },
  suksesSub: { ...T.body, color: C.textBody, marginTop: 6 },
  kembaliCard: { borderRadius: R.card, backgroundColor: C.green50, padding: L.cardPad, gap: 4 },
  kembaliValue: { fontSize: 34, lineHeight: 40, ...W.bold, color: C.brandInk },
  suksesActions: { gap: 10 },
  suksesActionsWide: { flexDirection: 'row', gap: 10 },
  printerLabel: { ...T.caption, color: C.textMuted },
});
