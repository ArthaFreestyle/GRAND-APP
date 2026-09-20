/**
 * Beranda — screen B1/D1 of `Papan Layar.dc.html`, drawn as
 * `LayarGudang.dc.html` draws its `home` branch.
 *
 * **The board's own stack, in the board's own order**: the identity block with
 * the konteks pill under it, the two-metric card with its update stamp, the
 * stock-health score card, the eight-tile feature grid, and a three-row preview
 * of the latest purchase invoices. Nothing is added to that list and nothing is
 * reordered.
 *
 * Two things about it are *not* the board's, and both were asked for directly:
 * the identity block is a white surface carrying `RamahElevation.low` rather
 * than a flat `orange50` tint, and re-reading the screen is a pull-to-refresh
 * rather than a button in the metric card's foot. The reasoning for each is at
 * the JSX that draws it.
 *
 * **One Beranda, identical for every role — with one deliberate exception.**
 * The board draws B1 (staf gudang) and D1 (supervisor) as separate screens and
 * gives each a different pair of metrics, but says in the same breath that the
 * layout deliberately does not change between them — "supaya peran terasa
 * sebagai isi, bukan aplikasi lain". This screen mostly takes that to its
 * conclusion: both metric-card counts are real for everyone (whoever types the
 * invoices wants to know how many of theirs are waiting; whoever approves them
 * still works in a shop that runs out of things), and every tile leads
 * somewhere every grant may open. Guide §1 does permit a card to be hidden per
 * role, and until now that permission sat unused.
 *
 * **The presensi card is the one card that spends it.** A superadmin is not a
 * shift worker clocking in and out at a counter — the card and its jam masuk /
 * jam pulang buttons are for `INVENTARIS` and `CASHIER` only, and
 * `SUPERADMIN` neither reads nor fetches it. This is a product decision, not a
 * contract one: nothing in `services/presensi.ts` refuses a superadmin's
 * `POST /presensi/masuk`, the app simply never offers the button.
 *
 * **The feature grid now spends it too — its second and last exception.**
 * "Pengguna" moved here from Profil's own "Administrasi" group, on direct
 * request, and it is filtered out of both the grid and the "Lihat semua"
 * sheet for anyone who is not `SUPERADMIN`, the same reasoning Profil's
 * version of this row carried: `app/pengguna/` is the one section where
 * reading itself is role-gated (`GET /user` answers 403 for INVENTARIS and
 * CASHIER), so a tile that opened for them would be a door onto a page that
 * fails. It sits after Pemakaian in `FITUR`, behind "Lihat semua" like
 * susulan/mutasi/pemakaian, so the first eight tiles are unchanged.
 *
 * ## Where the numbers come from
 *
 * Four reads, all real, none narrowed to a single ruang: `GET
 * /product/stok-minimum` without `id_ruang` compares each product against its
 * reorder point across the whole active unit kerja, which is the question a
 * home screen asks ("what does this business need to buy"). Katalog narrows to
 * a room because it answers a different one ("what is on this shelf"), and the
 * board's endpoint note draws the same distinction.
 *
 * **The score card used to be the one figure this screen computed rather than
 * read — `docs/endpoint-api.md` #15, closed by issue #37.** `GET
 * /laporan/kesehatan-stok` now answers the score itself, weighing four
 * components (availability, dead stock, opname accuracy, minimum coverage) the
 * client has no way to reconstruct from list counts alone. `skor` and `status`
 * come back `null` when nothing in scope could be scored — a fresh unit kerja
 * with no opname history yet, say — and that is drawn the same way a failed
 * read is: no card, rather than a card built from half the data or a
 * fabricated zero.
 *
 * ## What the board draws that this screen still cannot
 *
 * - **The delta chip** ("↑ 12%") beside the first metric. Guide §3 requires a
 *   delta to be "selalu relatif terhadap periode yang sama", and no read here
 *   carries a previous period. A grey "0%" would be a claim, not a placeholder.
 * - **The bell's contents.** There is no notifications endpoint, so the control
 *   is drawn and says so when pressed rather than being silently dead.
 * - **Four of the eight tiles.** Stok opname, pemasok, laporan and utang
 *   pemasok have no screens in this repo. They are drawn *disabled* — 55%, the
 *   board's own treatment for a tile that does not open — rather than dropped,
 *   because the grid is also a map of what this app is going to be.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter, type Href } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahInlineError,
  RamahPrimaryButton,
  RamahScoreCard,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahStackRow,
  RamahTile,
  type RamahTileArt,
} from '@/components/shell/ramah';
import { RoleSwitcherSheet } from '@/components/shell/role-switcher';
import { DOKUMEN_META } from '@/components/shell/status-dokumen';
import { formatNumber, formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { ApiError, messageOf } from '@/services/api';
import { logout } from '@/services/auth';
import { laporanKesehatanStok } from '@/services/laporan';
import {
  getPembelianCounts,
  listPembelian,
  pembelianBus,
  type PembelianRow,
} from '@/services/pembelian';
import { roleLabel, useActiveRole } from '@/services/permissions';
import {
  formatDurasi,
  formatJam,
  getPresensiHariIni,
  presensiBus,
  presensiMasuk,
  presensiPulang,
  SHIFT_LABEL,
  type PresensiHariIni,
  type Shift,
  type ShiftHariIni,
} from '@/services/presensi';
import { listStokMinimum, produkBus } from '@/services/produk';
import { useSession } from '@/services/session';

/**
 * The feature grid's 3D art, from IconScout — Iqonic Design, *Ulta Bizz*, free
 * for commercial use, 500px PNG on a transparent ground.
 *
 * `require`d at module scope rather than inline in the JSX because Metro
 * resolves a static `require` of an asset at build time; a path assembled at
 * render time is not an asset reference at all, it is a string.
 *
 * Each is the render the board picked for that tile. The guide's rules that bit
 * while choosing them: square 2000×2000 sources only (the 3000×2000 "B 2 C" and
 * one of the two "Bank" renders would go flat or need hand-cropping in a
 * uniform grid), and one concept per icon — the pack ships four *report*
 * variants and two each of *bank* and *B2C*, and two features wearing near-twins
 * is worse than one of them going without.
 */
const ART = {
  kasir: require('@/assets/icons-3d/edc-machine.png'),
  katalog: require('@/assets/icons-3d/shop.png'),
  nota: require('@/assets/icons-3d/finance-report.png'),
  laporan: require('@/assets/icons-3d/growth-graph.png'),
  utang: require('@/assets/icons-3d/deposit-box.png'),
  // The four below are the second family — see the note under this block.
  opname: require('@/assets/icons-3d/package-scale.png'),
  pemasok: require('@/assets/icons-3d/fast-delivery.png'),
  unitKerja: require('@/assets/icons-3d/warehouse.png'),
  susulan: require('@/assets/icons-3d/delivery-schedule.png'),
  // Same logistics pack as the four above: boxes moving onto a crate for a
  // transfer, a plain stack for goods taken out for use.
  mutasi: require('@/assets/icons-3d/mutasi-boxes.png'),
  pemakaian: require('@/assets/icons-3d/pemakaian-boxes.png'),
  // The one orphan: no logistics render draws a person, and this is a grey clay
  // "Users" from another contributor (Hesam Sanei). Swap it when a family match exists.
  pengguna: require('@/assets/icons-3d/pengguna-users.png'),
} as const;

/**
 * ### The second contributor, and why there is one
 *
 * Guide §8 restricts the grid to Iqonic Design and, having checked both of its
 * packs, names three merchant concepts neither covers — it tells you to hold
 * those on a Lucide line glyph until somebody re-renders them from the packs'
 * `.blend` files. That is what the four tiles below were, and this is the
 * ruling that changed it.
 *
 * `LayarGudang.dc.html` draws all eight of its tiles with a 3D render, and
 * three of them are **not** from Iqonic: `ai-analysis` on Stok opname,
 * `ai-network` on Pemasok, `package-list` on Persetujuan (a beranda tile this
 * app no longer draws — see below). So the board has already spent the
 * exception; what was left to decide was how to spend it well.
 *
 * **Two of the board's three are unusable as drawn.** `ai-analysis` is a bar
 * chart and `ai-network` a node graph, and both carry a literal "AI" plate in
 * the render — a tile reading "Stok opname" under a badge saying AI is worse
 * than the line glyph it replaces, and neither is the concept anyway. The
 * third, `package-list`, is a clipboard with a parcel and a check, and reads as
 * well on "Persetujuan" as the board intended.
 *
 * **The rest come from that same asset's pack** — Semusim Kreatif's ten-item
 * logistics set, the one `package-list` itself belongs to. Taking them all
 * from one pack is §8's own rule applied rather than abandoned: one
 * contributor is one render language, so what the grid holds is two coherent
 * families (Iqonic's matte blue-and-orange, Semusim's glossy red-and-yellow)
 * instead of the board's three. The pack also happens to be about exactly the
 * concepts this app was missing — counting stock, the van a supplier's goods
 * arrive in, the gudang stock sits in, a delivery that comes on a later date —
 * which is why nothing here is a lookalike standing in for something else.
 *
 * ### Unit kerja, the last tile to get one
 *
 * Unit kerja sat on a Feather `settings` glyph because it read as a settings
 * screen, and a gear is what neither family draws in its own style: Iqonic's
 * free `Setting` is a glossy cyan cog from a third pack, and *Bizzy Vol.2*'s
 * management cogs are purple and pink — both a different language from the
 * grid beside them. What changed is the question: every `ruang` that section
 * manages is a gudang, so a **warehouse is its subject**, not a picture
 * standing in for "settings". That render was Pemasok's, so the three tiles
 * moved together to keep one concept per icon — Pemasok onto the delivery van
 * (whoever brings the stock is what a supplier *is* to this shop), and
 * Kiriman susulan off the van onto `delivery-schedule`, a calendar beside a
 * parcel, which is precisely what a susulan is.
 *
 * All four are 3000×3000 square, free for commercial use, no attribution
 * required, pulled as 500px PNG on a transparent ground (`png` asked for
 * explicitly — the default download format for a 3D asset is `compressed-glb`,
 * which is a model, not an image).
 *
 * The rule §8 states that still holds, and is the reason this is a note and not
 * a free hand: **a 3D asset is never recoloured**, and a gap is never closed by
 * hunting a *single* lookalike out of a random pack. What adapts to the palette
 * is the tile's surroundings.
 *
 * ### `package-list.png`, unreferenced but kept
 *
 * Issue #24 replaced the Persetujuan tile with Unit kerja, because Persetujuan
 * opened the same screen as the Pembelian tile beside it (`/pembelian`, with no
 * filter ever actually sent) and the slot was worth more as this section's
 * front door. That render is not deleted from `assets/icons-3d/` even though
 * nothing `require`s it any more: the issue explicitly leaves a real entry
 * point for the persetujuan *queue* — `/pembelian?status=DIAJUKAN` — for later,
 * and re-sourcing a clipboard-and-check render that already fits the guide's
 * every rule would be wasted work. Delete it only alongside the decision that
 * queue is never getting its own tile.
 */

/**
 * One shortcut, and whether it goes anywhere yet.
 *
 * The grid is a table rather than eight hand-written tiles because the guide
 * caps the *beranda* at eight and puts the remainder behind "Lihat semua": with
 * one list, the cap is `slice(0, 8)` and the sheet is the same list unsliced,
 * and the two can never drift into showing different things.
 */
interface Fitur {
  key: string;
  label: string;
  art: RamahTileArt;
  /** `undefined` while the screen behind it does not exist. */
  route?: Href;
  /**
   * The second role branch on this screen (the first is the presensi card,
   * above). `app/pengguna/` is the one section where reading itself is
   * role-gated — `GET /user` answers 403 for INVENTARIS and CASHIER — so
   * this tile is filtered out for both rather than opening a door onto a
   * page that fails for them.
   */
  superadminOnly?: boolean;
}

const FITUR: readonly Fitur[] = [
  { key: 'katalog', label: 'Katalog', art: { kind: 'art3d', source: ART.katalog }, route: '/produk' },
  // A parcel on a weighing platform: opname is the count you take of what is
  // physically on the shelf, and the scale is what says "measured", where a
  // plain stack of boxes would only repeat Katalog.
  {
    key: 'opname',
    label: 'Stok opname',
    art: { kind: 'art3d', source: ART.opname },
    route: '/stok-opname',
  },
  {
    key: 'pembelian',
    label: 'Pembelian',
    art: { kind: 'art3d', source: ART.nota },
    route: '/pembelian',
  },
  // The delivery van: to this shop a supplier is whoever brings the stock. The
  // warehouse it used to wear is Unit kerja's now — see `ART`.
  {
    key: 'pemasok',
    label: 'Pemasok',
    art: { kind: 'art3d', source: ART.pemasok },
    route: '/pemasok',
  },
  // Issue #24: this slot used to be "Persetujuan", which opened the exact
  // same route as the Pembelian tile above it — the filter it promised
  // ("Diajukan") was never actually sent, so two of the eight tiles led to one
  // screen. Persetujuan is still one tap away as the "Diajukan" chip on that
  // list; what earns the freed slot is the section #23 built and gave no tile
  // at all — `app/pengaturan/_layout.tsx` names the five dead ends that used
  // to be its only doors in.
  {
    key: 'unit-kerja',
    label: 'Unit kerja',
    // A gudang, because every ruang this section manages is one — the
    // section's subject rather than a gear standing in for "settings".
    art: { kind: 'art3d', source: ART.unitKerja },
    route: '/pengaturan',
  },
  {
    key: 'laporan',
    label: 'Laporan',
    art: { kind: 'art3d', source: ART.laporan },
    route: '/laporan',
  },
  /*
    The same list as the tile above, entered in a different mode — not a
    duplicate, and not laziness.

    There is no cross-supplier debt read in the contract: `Supplier` carries no
    outstanding total and `GET /supplier/{id}/utang` answers one supplier at a
    time, so a screen ranking suppliers by what is owed would be one request per
    supplier over the whole master. `?utang=1` sends every row of the list
    straight to that supplier's open invoices instead, and the list says so at
    the top rather than leaving it to be discovered.
  */
  {
    key: 'utang',
    label: 'Utang pemasok',
    art: { kind: 'art3d', source: ART.utang },
    route: '/pemasok?utang=1',
  },
  /*
    The board labels this one "Penjualan"; here it is the till, and "Kasir" is
    what everyone in the shop calls it.

    The till is also a tab now, so this tile is no longer the only way in — it
    stays because the grid is a map of what the app does, and a feature that is
    missing from the map because it happens to be one tap away elsewhere is a
    feature somebody stops looking for. The same is true in reverse of Katalog
    and Pembelian, which have no tab at all and are reached only from here (and,
    for Katalog, the reorder metric above).
  */
  { key: 'kasir', label: 'Kasir', art: { kind: 'art3d', source: ART.kasir }, route: '/kasir' },
  // The ninth, and the reason "Lihat semua" has something to show: a susulan is
  // normally started from the invoice that recorded the shortfall, so it does
  // not earn one of the eight slots on the home screen.
  {
    key: 'susulan',
    label: 'Kiriman susulan',
    // The board draws no tile for this one at all — it is the ninth, and lives
    // behind "Lihat semua" — so the render is this app's choice: a calendar
    // beside a parcel, the part of a delivery that arrives on a later date.
    art: { kind: 'art3d', source: ART.susulan },
    route: '/penerimaan-susulan',
  },
  /*
    Issue #10: the tenth and eleventh, behind "Lihat semua" like the susulan —
    a transfer and an internal request are errands somebody arrives at, not what
    the shop opens the app for, so neither takes one of the eight slots.

    **Both are on a line glyph, on purpose.** Neither family on this grid draws a
    transfer between rooms or goods used in-house, and §8's rule is that a gap is
    held on a glyph over the matching tone rather than closed with a lookalike
    from an unrelated pack. Stock-orange, because both move stock. The next step
    is a render from the same Semusim Kreatif logistics pack as the four above,
    not a stranger.
  */
  {
    key: 'mutasi',
    label: 'Mutasi gudang',
    art: { kind: 'art3d', source: ART.mutasi },
    route: '/mutasi',
  },
  {
    key: 'pemakaian',
    label: 'Pemakaian',
    art: { kind: 'art3d', source: ART.pemakaian },
    route: '/pemakaian',
  },
  /*
    Moved off Profil (was its "Administrasi" group) onto this grid, on
    direct request. It stays out of the first eight rather than displacing
    one of them — an account-management errand belongs beside susulan,
    mutasi and pemakaian behind "Lihat semua", not among the things a shop
    opens the app to check. No render exists for it in either 3D family, so
    it holds a glyph on `akun` grey, the same tone the row wore on Profil.
  */
  {
    key: 'pengguna',
    label: 'Pengguna',
    art: { kind: 'art3d', source: ART.pengguna },
    route: '/pengguna',
    superadminOnly: true,
  },
];

/** Guide §4: "Maksimal 8 petak di beranda; sisanya di balik 'Lihat semua'". */
const GRID_MAX = 8;

/** How many recent invoices. Three is what the board draws, and enough to recognise one. */
const DOC_PREVIEW = 3;

/**
 * The guide's tone bands, worded its way: short, and never blaming the reader
 * for a shop that has things to reorder.
 */
function catatanSkor(score: number): string {
  if (score >= 80) return 'Mantap! Stok terjaga';
  if (score >= 60) return 'Perlu dirapikan minggu ini';
  return 'Banyak barang perlu dipesan';
}

export default function BerandaScreen() {
  const router = useRouter();
  const session = useSession();
  /** The one role branch on this screen — see the file header's presensi note. */
  const isSuperadmin = useActiveRole() === 'SUPERADMIN';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fiturOpen, setFiturOpen] = useState(false);
  const [belOpen, setBelOpen] = useState(false);

  /** `-1` while unread or unreadable, the same convention `waiting` below
   *  uses — "none to reorder" and "could not ask" are different facts. */
  const [lowTotal, setLowTotal] = useState(-1);

  /** `null` while unread, while the read failed, or while the server itself
   *  found nothing in scope to score — the card draws the same way for all
   *  three: not drawn. `skorErr` is what tells the first two apart from the
   *  third for the retry line. */
  const [skor, setSkor] = useState<number | null>(null);
  const [skorErr, setSkorErr] = useState('');

  const [docs, setDocs] = useState<PembelianRow[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [docErr, setDocErr] = useState('');

  // ---- presensi (issue #45) --------------------------------------------
  const [hariIni, setHariIni] = useState<PresensiHariIni | null>(null);
  const [presensiErr, setPresensiErr] = useState('');
  const [presensiBusy, setPresensiBusy] = useState(false);
  /** The shift `onPressMasuk` is about to open, once the reader confirms closing the other one. */
  const [confirmMasuk, setConfirmMasuk] = useState<Shift | null>(null);
  const [confirmPulang, setConfirmPulang] = useState(false);

  const [readAt, setReadAt] = useState<Date | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * Loading is derived, the same way `app/(admin)/produk/index.tsx` derives it:
   * the token this screen wants read against the token it has read. Setting a
   * flag at the top of a fetch effect is a render cascade, and from
   * `eslint-config-expo` 57 it is also an error.
   */
  const [loadedToken, setLoadedToken] = useState(-1);
  const loading = loadedToken !== reloadToken;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // `getPembelianCounts()` (issue #26) is one function that Nota's own
      // "Perlu diurus" card reads too, so this metric and that card cannot
      // quietly disagree about what "menunggu persetujuan" means — it never
      // rejects, using the same `-1`-means-unreadable convention as `lowTotal`
      // below, so it sits outside the `allSettled` below.
      const [[reorder, kesehatan, recent, presensi], counts] = await Promise.all([
        Promise.allSettled([
          // `size: 1` throughout where only `paging.total_item` is wanted: the
          // rows themselves belong to the screens those counts link into.
          listStokMinimum({ page: 1, size: 1 }),
          laporanKesehatanStok(),
          listPembelian({ page: 1, size: DOC_PREVIEW }),
          // The one extra light read issue #45 allows on launch. Every native
          // tab mounts eagerly, so this rides the same batch rather than
          // adding a second round trip of its own — and the same
          // pull-to-refresh that re-reads the rest of the screen re-reads this.
          // A superadmin never sees the card this answers, so it is never
          // asked for one — not just discarded once it comes back.
          isSuperadmin ? Promise.resolve(null) : getPresensiHariIni(),
        ]),
        getPembelianCounts(),
      ]);
      if (!alive) return;

      setLowTotal(reorder.status === 'fulfilled' ? (reorder.value.paging.total_item ?? 0) : -1);

      if (kesehatan.status === 'fulfilled') {
        setSkor(kesehatan.value.skor ?? null);
        setSkorErr('');
      } else {
        setSkor(null);
        setSkorErr(messageOf(kesehatan.reason, 'Skor kesehatan stok tidak terbaca.'));
      }

      if (recent.status === 'fulfilled') {
        setDocs(recent.value.data);
        setDocErr('');
      } else {
        setDocs([]);
        setDocErr(messageOf(recent.reason, 'Pembelian terakhir tidak terbaca.'));
      }

      // A failed count is shown as an em dash rather than as a zero: "none
      // waiting" and "could not ask" are different facts, and only one of them
      // means there is nothing to do.
      setWaiting(counts.menungguPosting);

      if (presensi.status === 'fulfilled') {
        setHariIni(presensi.value);
        setPresensiErr('');
      } else {
        setHariIni(null);
        setPresensiErr(messageOf(presensi.reason, 'Presensi tidak terbaca.'));
      }

      setReadAt(new Date());
      setLoadedToken(reloadToken);
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken, isSuperadmin]);

  // A product archived or a nota posted somewhere else changes these counts, and
  // none of them is a figure this screen can patch: `total_item` is the
  // server's. So a change means re-read, not repair.
  useRecordBus(produkBus, reload);
  useRecordBus(pembelianBus, reload);
  // A correction made from `app/presensi/[id]/ubah.tsx` has nothing on this
  // card to patch in place — it publishes `PresensiRow`, this card draws
  // `PresensiHariIni` — so a full reload is the only honest answer either way.
  useRecordBus(presensiBus, reload);

  /**
   * Re-reads just the presensi card after a tombol write, without touching
   * every other figure on the screen — `reload()` bumps `reloadToken` and
   * would restart the whole page's reads for one button press.
   */
  const refetchPresensi = useCallback(async () => {
    try {
      setHariIni(await getPresensiHariIni());
      setPresensiErr('');
    } catch (e) {
      setPresensiErr(messageOf(e, 'Presensi tidak terbaca.'));
    }
  }, []);

  const jalankanMasuk = useCallback(async () => {
    if (presensiBusy) return;
    setPresensiBusy(true);
    setConfirmMasuk(null);
    try {
      await presensiMasuk();
      await refetchPresensi();
      // Announces to any mounted `app/presensi/index.tsx` that its history
      // gained a row it cannot patch in place.
      presensiBus.publish({ kind: 'reload' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // A duplicate tap, or (per the contract's own inconsistency the file
        // header for `services/presensi.ts` flags — issue #45 §7) a shift the
        // server sees as already resolved. Either way the honest fix is
        // redrawing what is actually true now, not the raw server sentence.
        await refetchPresensi();
      } else {
        setPresensiErr(messageOf(e, 'Gagal mencatat jam masuk.'));
      }
    } finally {
      setPresensiBusy(false);
    }
  }, [presensiBusy, refetchPresensi]);

  const jalankanPulang = useCallback(async () => {
    if (presensiBusy) return;
    setPresensiBusy(true);
    setConfirmPulang(false);
    try {
      await presensiPulang();
      await refetchPresensi();
      presensiBus.publish({ kind: 'reload' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await refetchPresensi();
      } else {
        setPresensiErr(messageOf(e, 'Gagal mencatat jam pulang.'));
      }
    } finally {
      setPresensiBusy(false);
    }
  }, [presensiBusy, refetchPresensi]);

  /**
   * "Catat jam masuk" writes immediately in the ordinary case — speed is the
   * whole point, and an accidental extra tap costs nobody anything. The one
   * exception the contract forces: the *other* shift is still `BUKA`, and a
   * tap here marks that row `LUPA_PULANG` forever with no undo. That has to be
   * said in words before it happens, never discovered after.
   */
  const onPressMasuk = useCallback(() => {
    if (!hariIni) return;
    const lain = hariIni.shiftSekarang === 'PAGI' ? hariIni.malam : hariIni.pagi;
    if (lain.status === 'BUKA') {
      setConfirmMasuk(lain.shift);
      return;
    }
    void jalankanMasuk();
  }, [hariIni, jalankanMasuk]);

  const activeUnit = session?.grants.find(
    (g) => g.id_user_role === session.active?.id_user_role
  )?.nama_unit_kerja;

  const konteks = `${roleLabel(session?.active?.role)}${activeUnit ? ` · ${activeUnit}` : ''}`;

  /**
   * `navigate`, not `push`.
   *
   * One of these destinations is a *tab root* — Kasir — and a tab root is not
   * something to stack a second copy of: `navigate` switches to the tab that
   * already exists. Every other tile is a root-stack section beside the tabs
   * (Katalog, Pembelian, Kiriman susulan, …), and `navigate` only pushes those
   * when the route is not already in the navigator, which is what keeps a
   * double-tap on the Pembelian tile from quietly growing a second Nota under
   * the first.
   */
  const openFitur = (f: Fitur) => {
    setFiturOpen(false);
    if (f.route) router.navigate(f.route);
  };

  // Pengguna is `superadminOnly`; everyone else's grid and "Lihat semua"
  // sheet are drawn from the same filtered list so the two can never
  // disagree about what the count is capped from.
  const fitur = isSuperadmin ? FITUR : FITUR.filter((f) => !f.superadminOnly);

  const tile = (f: Fitur) => (
    <RamahTile
      key={f.key}
      label={f.label}
      art={f.art}
      // The guide's count pill marks a backlog somebody owes an answer to, and
      // on this grid the catalogue is where that backlog is worked off.
      badge={f.key === 'katalog' && !loading ? lowTotal : undefined}
      disabled={!f.route}
      onPress={() => openFitur(f)}
    />
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        /*
          Pull to refresh, and it is the *only* way to re-read this screen now.
          The metric card's foot used to carry a `refresh-cw` button, which was
          a control that existed here and nowhere else in the app while every
          other list already answered to the gesture. The stamp under the
          numbers still says when they were read; the gesture says how to read
          them again.

          `readAt` guards the spinner. On a cold mount `loading` is already
          true, and a pull spinner nobody pulled reads as a screen stuck
          half-way rather than as one still loading.
        */
        refreshControl={
          <RefreshControl
            refreshing={readAt !== null && loading}
            onRefresh={reload}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }>
        {/*
          The identity block: a white surface flush to the top edge, carrying
          `RamahElevation.low`, with 24 of air above the shop name.

          It was a flat `orange50` tint - the board's own drawing, and revision
          2's replacement for the curved colour header it retired from
          operational screens (`CurvedHeader` is still legal on a wallet surface
          and in onboarding, nowhere else; gradients stay banned outright). What
          changed, and why: the tint was a wash of colour carrying no
          information, it sat 8pt under the status bar so the shop name read as
          pinned to the clock, and it was the one full-width block on the screen
          with nothing separating it from the canvas underneath. White plus a
          shadow says what the tint was there to say - this is the layer you are
          looking at, the page passes beneath it - in the language the rest of
          the system already separates surfaces with.

          It is the one non-docked surface in the app carrying a shadow (issue
          #32 reserves the tokens for docks and the floating sheet), and it
          earns it on that issue's own rule rather than against it: the token
          states position on the z-axis, and this block is a header the content
          scrolls under, not a card sitting in the content.
        */}
        <View style={styles.identity}>
          <View style={styles.identityRow}>
            <View style={styles.grow}>
              <Text style={styles.shopName} numberOfLines={1}>
                {activeUnit ?? 'Unit kerja'}
              </Text>
              <Text style={styles.shopSub} numberOfLines={1}>
                {session?.user.nama_lengkap || session?.user.username || '—'}
              </Text>
            </View>
            <View style={styles.identityActions}>
              <Pressable
                onPress={() => setBelOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
                style={styles.iconBtn}>
                <Feather name="bell" size={RamahIcon.header} color={C.iconDefault} />
              </Pressable>
              {/* Nothing signs out by navigating: dropping the session closes
                  the `Stack.Protected` guard this whole group sits behind, and
                  the navigator falls back to the login anchor by itself. */}
              <Pressable
                onPress={() => void logout()}
                accessibilityRole="button"
                accessibilityLabel="Keluar akun"
                style={styles.iconBtn}>
                <Feather name="log-out" size={RamahIcon.header} color={C.iconDefault} />
              </Pressable>
            </View>
          </View>

          {/* The konteks pill. The board draws the pin in `--danger`, which is
              the one place red is not "required and wrong": it is a location
              marker, and the guide lists that use explicitly. */}
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Bertindak sebagai ${konteks}. Ganti wewenang`}
            style={styles.konteks}>
            <Feather name="map-pin" size={RamahIcon.row} color={C.danger} />
            <Text style={styles.konteksText} numberOfLines={1}>
              {konteks}
            </Text>
            <Feather name="chevron-down" size={RamahIcon.row} color={C.iconMuted} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {/*
            Presensi (issue #45), tepat di bawah blok identitas — the first
            thing this screen asks of whoever opened it today. Its pill is the
            only solid green one anywhere on Beranda; nothing else here should
            grow one.
          */}
          {isSuperadmin ? null : presensiErr ? (
            <RamahInlineError message={presensiErr} onRetry={refetchPresensi} />
          ) : hariIni && readAt ? (
            <PresensiCard
              hariIni={hariIni}
              now={readAt}
              busy={presensiBusy}
              onMasuk={onPressMasuk}
              onPulang={() => setConfirmPulang(true)}
            />
          ) : null}

          {/* Two metrics either side of a hairline, and both are real reads.
              The guide's rule for this card is blunt: two real numbers, or one
              card, and a third metric means a second card. */}
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Pressable
                style={styles.metric}
                onPress={() => router.navigate('/produk')}
                accessibilityRole="button"
                accessibilityLabel={`Perlu dipesan ulang, ${lowTotal < 0 ? 'tidak terbaca' : lowTotal} barang. Buka katalog`}>
                <Text style={styles.metricLabel}>Perlu dipesan ulang</Text>
                <Text style={styles.metricValue}>
                  {loading || lowTotal < 0 ? '—' : formatNumber(lowTotal)}
                </Text>
              </Pressable>
              <View style={styles.metricDivider} />
              <Pressable
                style={[styles.metric, styles.metricRight]}
                onPress={() => router.navigate('/pembelian')}
                accessibilityRole="button"
                accessibilityLabel={`Menunggu persetujuan, ${waiting < 0 ? 'tidak terbaca' : waiting} nota. Buka nota`}>
                <Text style={styles.metricLabel}>Menunggu persetujuan</Text>
                <Text style={styles.metricValue}>
                  {loading || waiting < 0 ? '—' : formatNumber(waiting)}
                </Text>
              </Pressable>
            </View>
            {/* The card's foot, `grey50` under a hairline: the stamp, and
                nothing else. The reason it exists is that a number with no time
                on it cannot be told from a stale one — re-reading is the pull
                gesture on the page now, so the foot is a label rather than a
                control. */}
            <View style={styles.cardFoot}>
              <Text style={styles.cardFootText}>
                {readAt ? `Terakhir update: ${stempelPembaruan(readAt)}` : 'Membaca…'}
              </Text>
            </View>
          </View>

          {/* The score card, and the error line that stands in for it when the
              read behind it did not land. `skor === null` with no error is the
              server's own "nothing in scope to score" — drawn the same as no
              card at all, not as a zero. */}
          {skorErr ? (
            <RamahInlineError message={skorErr} onRetry={reload} />
          ) : skor !== null ? (
            <RamahScoreCard
              label="Skor kesehatan stok"
              score={skor}
              note={catatanSkor(skor)}
              onPress={() => router.navigate('/produk')}
              accessibilityLabel={`Skor kesehatan stok ${skor} dari 100. ${catatanSkor(skor)}. Buka katalog`}
            />
          ) : null}

          {/*
            The feature grid (guide §4). Four columns, never a fifth, eight
            tiles at most, and the ninth sits behind "Lihat semua".
          */}
          <View style={[styles.card, styles.groupStart]}>
            <View style={styles.gridHead}>
              <Text style={styles.gridTitle}>Fitur</Text>
              <RamahSecondaryButton
                label="Lihat semua"
                onPress={() => setFiturOpen(true)}
                accessibilityLabel="Lihat semua fitur"
              />
            </View>
            <View style={styles.grid}>{fitur.slice(0, GRID_MAX).map(tile)}</View>
          </View>

          {/* The secondary path: the last three invoices, newest first, as the
              server sorted them. */}
          <View style={[styles.group, styles.groupStart]}>
            <RamahSectionHeader action="Semua" onAction={() => router.navigate('/pembelian')}>
              Pembelian terakhir
            </RamahSectionHeader>
            {docErr ? (
              <RamahInlineError message={docErr} onRetry={reload} />
            ) : docs.length === 0 ? (
              !loading ? <Text style={styles.groupNote}>Belum ada nota pembelian.</Text> : null
            ) : (
              <View style={styles.list}>
                {docs.map((d, i) => (
                  <Fragment key={d.id}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <RamahStackRow
                      icon="file-text"
                      /*
                        The board tints the first row's glyph blue and leaves the
                        rest grey. Tone by *status* rather than by position says
                        the same thing and stays true after the list scrolls: a
                        document still moving through its flow is the one with
                        something owed on it, and a posted or cancelled one is
                        finished business.
                      */
                      tone={d.status === 'POSTED' || d.status === 'BATAL' ? 'akun' : 'katalog'}
                      title={d.nomor}
                      subtitle={d.namaSupplier}
                      value={formatRupiah(d.total)}
                      meta={DOKUMEN_META[d.status].label}
                      muted={d.status === 'BATAL'}
                      onPress={() =>
                        router.push({ pathname: '/pembelian/[id]', params: { id: d.id } })
                      }
                      accessibilityLabel={`${d.nomor}, ${d.namaSupplier}, ${DOKUMEN_META[d.status].label}`}
                    />
                  </Fragment>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <RoleSwitcherSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* "Lihat semua": the same table, unsliced. */}
      <RamahSheet visible={fiturOpen} title="Semua fitur" onClose={() => setFiturOpen(false)}>
        <View style={styles.sheetGrid}>{fitur.map(tile)}</View>
      </RamahSheet>

      {/*
        The bell is drawn because the board draws it, and it says what it can
        rather than doing nothing: there is no notifications endpoint in
        `contracts/openapi.yaml`, so an empty sheet is the honest answer and the
        control does not have to be removed and re-added later.
      */}
      <RamahSheet visible={belOpen} title="Notifikasi" onClose={() => setBelOpen(false)}>
        <View style={styles.kosong}>
          <Feather name="bell-off" size={RamahIcon.header} color={C.iconMuted} />
          <Text style={styles.kosongText}>
            Belum ada pemberitahuan. Angka yang perlu ditindaklanjuti ada di kartu paling atas.
          </Text>
        </View>
      </RamahSheet>

      {/*
        The one confirmation the contract forces: the other shift is still
        `BUKA`, and `POST /presensi/masuk` marks it `LUPA_PULANG` forever in
        the same transaction. Said in words before it happens — never
        discovered after, on a document with no undo.
      */}
      <RamahSheet
        visible={confirmMasuk !== null}
        title="Shift lain masih berjalan"
        onClose={() => setConfirmMasuk(null)}>
        <View style={styles.confirmBody}>
          <Text style={styles.confirmText}>
            {confirmMasuk
              ? `Shift ${SHIFT_LABEL[confirmMasuk]} belum ditutup. Melanjutkan akan menandainya "lupa pulang" — jam pulangnya tidak akan tercatat.`
              : ''}
          </Text>
          <RamahPrimaryButton
            label="Lanjut, catat jam masuk"
            onPress={() => void jalankanMasuk()}
            busy={presensiBusy}
            disabled={presensiBusy}
          />
          <RamahSecondaryButton
            label="Batal"
            fullWidth
            onPress={() => setConfirmMasuk(null)}
          />
        </View>
      </RamahSheet>

      {/* Pressing this too early ends the day, and the contract has no undo for it. */}
      <RamahSheet visible={confirmPulang} title="Catat jam pulang?" onClose={() => setConfirmPulang(false)}>
        <View style={styles.confirmBody}>
          <Text style={styles.confirmText}>Jam pulang akan tercatat sebagai sekarang.</Text>
          <RamahPrimaryButton
            label="Ya, catat jam pulang"
            onPress={() => void jalankanPulang()}
            busy={presensiBusy}
            disabled={presensiBusy}
          />
          <RamahSecondaryButton label="Batal" fullWidth onPress={() => setConfirmPulang(false)} />
        </View>
      </RamahSheet>
    </View>
  );
}

/**
 * The presensi card (issue #45): what the reader's own two shifts look like
 * today. `hariIni.shiftSekarang` — the server's own conclusion, never the
 * phone's clock — decides which shift is drawn large; the other one earns a
 * line only when it has anything to say at all.
 */
function PresensiCard({
  hariIni,
  now,
  busy,
  onMasuk,
  onPulang,
}: {
  hariIni: PresensiHariIni;
  /** `readAt` — when this screen's figures were actually read, never a fresh `Date.now()` taken during render. */
  now: Date;
  busy: boolean;
  onMasuk: () => void;
  onPulang: () => void;
}) {
  const current = hariIni.shiftSekarang === 'PAGI' ? hariIni.pagi : hariIni.malam;
  const lain = hariIni.shiftSekarang === 'PAGI' ? hariIni.malam : hariIni.pagi;

  return (
    <View style={styles.presensiCard}>
      {/* A shift with nothing recorded says nothing here — "Belum masuk" on
          the shift nobody has reached yet would be true of every reader every
          day, which is not information (CLAUDE.md's layout-economy rule). */}
      {lain.status !== 'BELUM_MASUK' ? <Text style={styles.presensiLain}>{ringkasShiftLain(lain)}</Text> : null}
      <PresensiIsi current={current} now={now} busy={busy} onMasuk={onMasuk} onPulang={onPulang} />
    </View>
  );
}

function ringkasShiftLain(s: ShiftHariIni): string {
  const label = SHIFT_LABEL[s.shift];
  if (s.status === 'BUKA') return `${label} ${formatJam(s.jamMasuk)} · masih berjalan`;
  if (s.status === 'LUPA_PULANG') return `${label} ${formatJam(s.jamMasuk)} · lupa pulang`;
  return `${label} ${formatJam(s.jamMasuk)}–${formatJam(s.jamPulang)}`;
}

/**
 * The four states `services/presensi.ts`'s `StatusPresensi` can be in. No
 * `arrow` on the pill (issue #39's rule): pressing it does not lead to another
 * screen, it just changes what this card says.
 */
function PresensiIsi({
  current,
  now,
  busy,
  onMasuk,
  onPulang,
}: {
  current: ShiftHariIni;
  now: Date;
  busy: boolean;
  onMasuk: () => void;
  onPulang: () => void;
}) {
  const jamMasuk = formatJam(current.jamMasuk);

  if (current.status === 'BELUM_MASUK') {
    return (
      <View style={styles.presensiBody}>
        <Text style={styles.presensiTitle}>Belum presensi — shift {SHIFT_LABEL[current.shift].toLowerCase()}</Text>
        <RamahPrimaryButton label="Catat jam masuk" onPress={onMasuk} busy={busy} disabled={busy} />
      </View>
    );
  }

  if (current.status === 'BUKA') {
    // `durasi_kerja_menit` is `null` from the server until the shift is
    // `SELESAI` (see `services/presensi.ts`), so "berjalan" is measured
    // against `now` — the moment this screen's figures were actually read,
    // never a fresh `Date.now()` sampled during render (React Compiler's
    // purity rule, and the same reason `stempelPembaruan` takes its `now` as
    // an argument rather than reading the clock itself).
    const elapsed = current.jamMasuk
      ? Math.max(0, Math.round((now.getTime() - new Date(current.jamMasuk).getTime()) / 60000))
      : null;
    return (
      <View style={styles.presensiBody}>
        <Text style={styles.presensiTitle}>{`Masuk ${jamMasuk} · berjalan ${formatDurasi(elapsed)}`}</Text>
        <RamahSecondaryButton label="Catat jam pulang" fullWidth onPress={onPulang} disabled={busy} />
      </View>
    );
  }

  if (current.status === 'LUPA_PULANG') {
    return <Text style={styles.presensiTitle}>{`Masuk ${jamMasuk} · jam pulang tidak tercatat`}</Text>;
  }

  // SELESAI — nothing left to do, so no button.
  return (
    <Text style={styles.presensiTitle}>
      {`Masuk ${jamMasuk} · Pulang ${formatJam(current.jamPulang)} · ${formatDurasi(current.durasiMenit)}`}
    </Text>
  );
}

/**
 * No safe-area padding here. `app/(admin)/_layout.tsx` pads the top and sides
 * outside the navigator, and the **native** tab bar owns the bottom edge: on
 * Android the tab content is wrapped in a `SafeAreaView` that applies that inset
 * for the bar, and on iOS this screen's `ScrollView` gets automatic content-inset
 * adjustment. Adding either again is invisible on a device with no notch and
 * obvious on every device with one.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  content: { paddingBottom: L.space6 },

  identity: {
    backgroundColor: C.surfaceCard,
    paddingHorizontal: L.gutter,
    /*
      24 above and below, where it was 8 and 16. This block is flush to the
      status bar — `app/(admin)/_layout.tsx` spends `insets.top` outside the
      navigator — so on a phone whose inset is a bare 24pt the shop name sat
      almost against the clock. `space6` is the tier the groups below are
      already read at, so the header opens the page at the same distance.
    */
    paddingTop: L.space6,
    paddingBottom: L.space6,
    gap: L.space3,
    /*
      On Android below API 28 the token falls back to a hairline, and for `low`
      that hairline is a *top* border — the wrong edge for a header, where it
      lands under the status bar and separates nothing. That is a degradation
      rather than a bug to patch here: a second fallback written at the call
      site would be a second place a shadow value lives, which is the thing
      issue #32 closed.
    */
    ...E.low,
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  // 4 between the two controls, which is the board's number: they are one group
  // of chrome, not two unrelated buttons.
  identityActions: { flexDirection: 'row', flexShrink: 0, gap: L.space1 },
  shopName: { ...T.titleModerate, color: C.textTitle },
  shopSub: { ...T.bodySmall, color: C.textBody },
  iconBtn: {
    width: L.tapMin,
    height: L.tapMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.pill,
  },
  konteks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    paddingVertical: L.space3,
    paddingHorizontal: L.space4,
    borderRadius: R.field,
    // `surfaceField`, not white: the block behind it is white now, and a white
    // pill on a white surface is a control nobody can see is a control.
    backgroundColor: C.surfaceField,
  },
  konteksText: { ...T.titleTiny, color: C.textTitle, flex: 1, minWidth: 0 },

  /*
    Three groups, not one stack of four cards. The two-metric card and the score
    card under it answer the same question — what needs attention — and sit a
    `stack` apart; the feature grid is a map of the app and the invoice preview
    is a different list again, so each of those opens a group of its own
    (`groupStart`). When all four were 12 apart the grid read as a third
    metric.

    16 on top rather than 12: the metric card is what this screen is for, and
    it is the first thing under the header block.
  */
  body: { paddingHorizontal: L.gutter, paddingTop: L.space4, gap: L.stack },
  groupStart: { marginTop: L.group - L.stack },

  card: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  metricRow: { flexDirection: 'row', padding: L.cardPad },
  metric: { flex: 1, minWidth: 0, gap: L.inline, paddingRight: L.metricGap },
  metricRight: { paddingRight: 0, paddingLeft: L.metricGap },
  metricDivider: { width: 1, backgroundColor: C.borderHairline },
  metricLabel: { ...T.bodySmall, color: C.textBody },
  /**
   * Always `--text-title`, never toned. Guide §3 is flat about it: the *value*
   * is `T.titleLarge`, bold, in the title colour, and the tone lives in the delta
   * chip beside it. An earlier version painted the reorder count orange, which
   * read as urgency the number does not carry on its own — seven items below
   * minimum is not alarming in a shop that stocks four hundred.
   */
  metricValue: { ...T.titleLarge, color: C.textTitle },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingVertical: L.space3,
    paddingHorizontal: L.cardPad,
    backgroundColor: C.grey50,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  cardFootText: { ...T.bodySmall, color: C.textMuted },

  gridHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: L.space3,
    paddingHorizontal: L.cardPad,
    paddingTop: L.cardPad,
  },
  gridTitle: { ...T.titleSmall, color: C.textTitle },
  // 16 vertical / 8 horizontal is the grid gap (`tileGapY`); the tiles carry half of
  // the horizontal one each, so the row lines up with the card's own padding.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: L.tileGapY,
    paddingHorizontal: L.cardPad - L.tileGapX / 2,
    paddingVertical: L.cardPad,
  },
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: L.tileGapY,
    paddingHorizontal: L.gutter - L.tileGapX / 2,
    paddingBottom: L.space4,
  },

  group: { gap: L.related },
  groupNote: { ...T.bodySmall, color: C.textMuted },
  list: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  // Inset by the card's own padding, so it separates the text rather than
  // cutting the card in half — the design system's `StackList` draws it the
  // same way, as a line between rows rather than a border on one.
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  kosong: { alignItems: 'center', gap: L.space3, paddingHorizontal: L.gutter, paddingVertical: L.space6 },
  kosongText: { ...T.bodySmall, color: C.textMuted, textAlign: 'center' },

  presensiCard: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    padding: L.cardPad,
    gap: L.related,
  },
  presensiLain: { ...T.bodySmall, color: C.textMuted },
  presensiBody: { gap: L.stack },
  presensiTitle: { ...T.titleTiny, color: C.textTitle },

  confirmBody: { paddingHorizontal: L.gutter, gap: L.space3, paddingBottom: L.space4 },
  confirmText: { ...T.bodySmall, color: C.textBody },
});
