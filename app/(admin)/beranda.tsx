/**
 * Beranda — screen B1/D1 of `Papan Layar.dc.html`, drawn as
 * `LayarGudang.dc.html` draws its `home` branch.
 *
 * **The board's own stack, in the board's own order**: the flat `orange50`
 * identity block with the konteks pill under it, the two-metric card with its
 * update stamp, the stock-health score card, the eight-tile feature grid, and
 * a three-row preview of the latest purchase invoices. Nothing is added to that
 * list and nothing is reordered.
 *
 * **One Beranda, identical for every role.** The board draws B1 (staf gudang)
 * and D1 (supervisor) as separate screens and gives each a different pair of
 * metrics, but says in the same breath that the layout deliberately does not
 * change between them — "supaya peran terasa sebagai isi, bukan aplikasi lain".
 * This screen takes that to its conclusion: there is no role branch anywhere in
 * it. Both counts are real for everyone (whoever types the invoices wants to
 * know how many of theirs are waiting; whoever approves them still works in a
 * shop that runs out of things), and every tile leads somewhere every grant may
 * open. Guide §1 does permit a card to be hidden per role; that permission is
 * deliberately unused, and a future card wanting it has to argue for itself —
 * two people standing at the same counter should see the same screen and be
 * able to talk about it.
 *
 * ## Where the numbers come from, and the one that is derived
 *
 * Four reads, all real, none narrowed to a single ruang: `GET
 * /product/stok-minimum` without `id_ruang` compares each product against its
 * reorder point across the whole active unit kerja, which is the question a
 * home screen asks ("what does this business need to buy"). Katalog narrows to
 * a room because it answers a different one ("what is on this shelf"), and the
 * board's endpoint note draws the same distinction.
 *
 * **The score card is the one figure this screen computes rather than reads.**
 * No endpoint answers a stock-health score, and inventing "94 / 100" to fill
 * the card is exactly what the layout-economy rule forbids. What is drawn
 * instead is a ratio of two counts the server did answer:
 *
 *     skor = 100 × (1 − produk di bawah minimum ÷ produk aktif)
 *
 * — the share of the active catalogue that is *not* below its reorder point.
 * That is a definition, not a guess, and it is stated on the card's
 * accessibility label so nobody has to reverse-engineer it. Two honest caveats,
 * written down because they will matter the day someone tunes it: the
 * denominator counts every active product, while the numerator can only contain
 * products that have a `stok_minimum` set (the endpoint never returns
 * `stok_minimum = 0`), so a catalogue with few thresholds set scores high for
 * the wrong reason; and if either read fails there is no score, so the card is
 * not drawn at all rather than drawn from half the data.
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
 * - **Three of the board's 3D renders.** §8 restricts the grid to Iqonic
 *   Design's *Ulta Bizz* and *Bizzy Vol.2*, and stok opname, pemasok and
 *   persetujuan have no equivalent in either pack. They hold a Lucide-style
 *   line glyph on the matching tint, which is the guide's documented stopgap;
 *   borrowing a lookalike render from a third pack is what it forbids, because
 *   one contributor is what keeps camera angle, bevel and light identical
 *   across the grid.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter, type Href } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahInlineError,
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
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { logout } from '@/services/auth';
import { listPembelian, pembelianBus, type PembelianRow } from '@/services/pembelian';
import { roleLabel } from '@/services/permissions';
import { listProducts, listStokMinimum, produkBus } from '@/services/produk';
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
  pemasok: require('@/assets/icons-3d/warehouse.png'),
  persetujuan: require('@/assets/icons-3d/package-list.png'),
  susulan: require('@/assets/icons-3d/fast-delivery.png'),
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
 * `ai-network` on Pemasok, `package-list` on Persetujuan. So the board has
 * already spent the exception; what was left to decide was how to spend it
 * well.
 *
 * **Two of the board's three are unusable as drawn.** `ai-analysis` is a bar
 * chart and `ai-network` a node graph, and both carry a literal "AI" plate in
 * the render — a tile reading "Stok opname" under a badge saying AI is worse
 * than the line glyph it replaces, and neither is the concept anyway. The
 * third, `package-list`, is a clipboard with a parcel and a check: that *is*
 * Persetujuan, and it is kept exactly as the board picked it.
 *
 * **The other three come from that same asset's pack** — Semusim Kreatif's
 * ten-item logistics set, which is where `package-list` lives. Taking all four
 * from one pack is §8's own rule applied rather than abandoned: one contributor
 * is one render language, so what the grid now holds is two coherent families
 * (Iqonic's matte blue-and-orange, Semusim's glossy red-and-yellow) instead of
 * the board's three. The pack also happens to be about exactly the concepts
 * this app was missing — counting stock, a supplier's warehouse, a delivery —
 * which is why nothing here is a lookalike standing in for something else.
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
  // A warehouse, which is where a supplier is reached from here — and not the
  // shop, which is the first tile and is *this* business.
  {
    key: 'pemasok',
    label: 'Pemasok',
    art: { kind: 'art3d', source: ART.pemasok },
    route: '/pemasok',
  },
  // "Persetujuan" is a filter on the Nota list rather than a place of its own,
  // so it lands on that list. The glyph is the guide's own suggestion for the
  // gap it calls "Pesanan masuk".
  {
    key: 'persetujuan',
    label: 'Persetujuan',
    // The board's own pick, kept: a delivery list with a check on it.
    art: { kind: 'art3d', source: ART.persetujuan },
    route: '/pembelian',
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

    The till is also the middle tab now, so this tile is no longer the only way
    in — it stays because the grid is a map of what the app does, and a feature
    that is missing from the map because it happens to be one tap away
    elsewhere is a feature somebody stops looking for. The same is true in
    reverse of Katalog, which *lost* its tab to the till and is reached from
    here and from the reorder metric above.
  */
  { key: 'kasir', label: 'Kasir', art: { kind: 'art3d', source: ART.kasir }, route: '/kasir' },
  // The ninth, and the reason "Lihat semua" has something to show: a susulan is
  // normally started from the invoice that recorded the shortfall, so it does
  // not earn one of the eight slots on the home screen.
  {
    key: 'susulan',
    label: 'Kiriman susulan',
    // The board draws no tile for this one at all — it is the ninth, and lives
    // behind "Lihat semua" — so the render is this app's choice, from the same
    // pack as its three neighbours.
    art: { kind: 'art3d', source: ART.susulan },
    route: '/penerimaan-susulan',
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fiturOpen, setFiturOpen] = useState(false);
  const [belOpen, setBelOpen] = useState(false);

  const [lowTotal, setLowTotal] = useState(0);
  const [lowErr, setLowErr] = useState('');
  /** Active products — the score's denominator. `-1` while unknown. */
  const [produkAktif, setProdukAktif] = useState(-1);

  const [docs, setDocs] = useState<PembelianRow[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [docErr, setDocErr] = useState('');

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
      const [reorder, aktif, recent, pending] = await Promise.allSettled([
        // `size: 1` throughout where only `paging.total_item` is wanted: the
        // rows themselves belong to the screens those counts link into.
        listStokMinimum({ page: 1, size: 1 }),
        listProducts({ page: 1, size: 1, is_aktif: true }),
        listPembelian({ page: 1, size: DOC_PREVIEW }),
        listPembelian({ page: 1, size: 1, status: 'DIAJUKAN' }),
      ]);
      if (!alive) return;

      if (reorder.status === 'fulfilled') {
        setLowTotal(reorder.value.paging.total_item ?? 0);
        setLowErr('');
      } else {
        setLowTotal(0);
        setLowErr(messageOf(reorder.reason, 'Stok minimum tidak terbaca.'));
      }

      setProdukAktif(aktif.status === 'fulfilled' ? (aktif.value.paging.total_item ?? 0) : -1);

      if (recent.status === 'fulfilled') {
        setDocs(recent.value.data);
        setDocErr('');
      } else {
        setDocs([]);
        setDocErr(messageOf(recent.reason, 'Nota terakhir tidak terbaca.'));
      }

      // A failed count is shown as an em dash rather than as a zero: "none
      // waiting" and "could not ask" are different facts, and only one of them
      // means there is nothing to do.
      setWaiting(pending.status === 'fulfilled' ? (pending.value.paging.total_item ?? 0) : -1);

      setReadAt(new Date());
      setLoadedToken(reloadToken);
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  // A product archived or a nota posted somewhere else changes these counts, and
  // none of them is a figure this screen can patch: `total_item` is the
  // server's. So a change means re-read, not repair.
  useRecordBus(produkBus, reload);
  useRecordBus(pembelianBus, reload);

  /**
   * Derived during render, not written from an effect — it is a pure function
   * of two counts already in state, and `react-hooks/set-state-in-effect` is an
   * error in this config for exactly this shape.
   */
  const skor =
    !lowErr && produkAktif > 0
      ? Math.max(0, Math.round(100 * (1 - Math.min(lowTotal, produkAktif) / produkAktif)))
      : null;

  const activeUnit = session?.grants.find(
    (g) => g.id_user_role === session.active?.id_user_role
  )?.nama_unit_kerja;

  const konteks = `${roleLabel(session?.active?.role)}${activeUnit ? ` · ${activeUnit}` : ''}`;

  /**
   * `navigate`, not `push`.
   *
   * Two of these destinations are *tab roots* now — Kasir and Nota — and a tab
   * root is not something to stack a second copy of: `navigate` switches to the
   * tab that already exists, and only pushes when the route is not in the
   * navigator yet, which is what Katalog and Kiriman susulan on the root stack
   * want too. `push` would have quietly grown a second Katalog every time
   * somebody tapped the tile twice.
   */
  const openFitur = (f: Fitur) => {
    setFiturOpen(false);
    if (f.route) router.navigate(f.route);
  };

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
      <ScrollView contentContainerStyle={styles.content}>
        {/*
          The identity block: a flat `orange50` tint flush to the top edge, no
          curve and no gradient. Revision 2 retired the curved colour header from
          operational screens - `CurvedHeader` is still legal on a wallet
          surface and in onboarding, nowhere else - and gradients are banned
          outright, so a tint block is what does the header's job.
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
          {/* Two metrics either side of a hairline, and both are real reads.
              The guide's rule for this card is blunt: two real numbers, or one
              card, and a third metric means a second card. */}
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Pressable
                style={styles.metric}
                onPress={() => router.navigate('/produk')}
                accessibilityRole="button"
                accessibilityLabel={`Perlu dipesan ulang, ${lowTotal} barang. Buka katalog`}>
                <Text style={styles.metricLabel}>Perlu dipesan ulang</Text>
                <Text style={styles.metricValue}>{loading ? '—' : formatNumber(lowTotal)}</Text>
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
            {/* The card's foot, `grey50` under a hairline: the stamp first, the
                way to re-read it second — the board's order, and the reason the
                stamp exists at all is that a number with no time on it cannot be
                told from a stale one. */}
            <Pressable
              onPress={reload}
              accessibilityRole="button"
              accessibilityLabel="Muat ulang angka"
              style={styles.cardFoot}>
              <Text style={styles.cardFootText}>
                {readAt ? `Terakhir update: ${stempelPembaruan(readAt)}` : 'Membaca…'}
              </Text>
              {loading ? (
                <ActivityIndicator color={C.iconMuted} size="small" />
              ) : (
                <Feather name="refresh-cw" size={RamahIcon.meta} color={C.iconMuted} />
              )}
            </Pressable>
          </View>

          {/* The score card, and the error line that stands in for it when the
              reads behind it did not land. */}
          {lowErr ? (
            <RamahInlineError message={lowErr} onRetry={reload} />
          ) : skor !== null ? (
            <RamahScoreCard
              label="Skor kesehatan stok"
              score={skor}
              note={catatanSkor(skor)}
              onPress={() => router.navigate('/produk')}
              accessibilityLabel={`Skor kesehatan stok ${skor} dari 100. ${catatanSkor(skor)}. ${formatNumber(lowTotal)} dari ${formatNumber(produkAktif)} barang aktif ada di bawah stok minimum. Buka katalog`}
            />
          ) : null}

          {/*
            The feature grid (guide §4). Four columns, never a fifth, eight
            tiles at most, and the ninth sits behind "Lihat semua".
          */}
          <View style={styles.card}>
            <View style={styles.gridHead}>
              <Text style={styles.gridTitle}>Fitur</Text>
              <RamahSecondaryButton
                label="Lihat semua"
                onPress={() => setFiturOpen(true)}
                accessibilityLabel="Lihat semua fitur"
              />
            </View>
            <View style={styles.grid}>{FITUR.slice(0, GRID_MAX).map(tile)}</View>
          </View>

          {/* The secondary path: the last three invoices, newest first, as the
              server sorted them. */}
          <View style={styles.group}>
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
        <View style={styles.sheetGrid}>{FITUR.map(tile)}</View>
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
    </View>
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
    backgroundColor: C.orange50,
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space4,
    gap: L.cardGap,
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: L.cardGap },
  // 4 between the two controls, which is the board's number: they are one group
  // of chrome, not two unrelated buttons.
  identityActions: { flexDirection: 'row', flexShrink: 0, gap: L.space1 },
  shopName: { ...T.identity, color: C.textTitle },
  shopSub: { ...T.caption, color: C.textBody },
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
    gap: 10,
    paddingVertical: L.space3,
    paddingHorizontal: 14,
    borderRadius: R.field,
    backgroundColor: C.white,
  },
  konteksText: { ...T.rowTitle, color: C.textTitle, flex: 1, minWidth: 0 },

  // 12 between cards, which is the whole stack: the board's home has no two
  // cards far enough apart in subject to earn the 16pt group gap.
  body: { paddingHorizontal: L.gutter, paddingTop: L.cardGap, gap: L.cardGap },

  card: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  metricRow: { flexDirection: 'row', padding: L.cardPad },
  metric: { flex: 1, minWidth: 0, gap: 6, paddingRight: L.metricGap },
  metricRight: { paddingRight: 0, paddingLeft: L.metricGap },
  metricDivider: { width: 1, backgroundColor: C.borderHairline },
  metricLabel: { ...T.caption, color: C.textBody },
  /**
   * Always `--text-title`, never toned. Guide §3 is flat about it: the *value*
   * is 22/26 bold in the title colour and the tone lives in the delta chip
   * beside it. An earlier version painted the reorder count orange, which read
   * as urgency the number does not carry on its own — seven items below minimum
   * is not alarming in a shop that stocks four hundred.
   */
  metricValue: { ...T.metric, color: C.textTitle },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingVertical: 11,
    paddingHorizontal: L.cardPad,
    backgroundColor: C.grey50,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  cardFootText: { ...T.caption, color: C.textMuted },

  gridHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: L.cardGap,
    paddingHorizontal: L.cardPad,
    paddingTop: L.cardPad,
  },
  gridTitle: { ...T.groupTitle, color: C.textTitle },
  // 14 vertical / 8 horizontal is the guide's grid gap; the tiles carry half of
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

  group: { gap: L.space2 },
  groupNote: { ...T.caption, color: C.textMuted },
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
  kosongText: { ...T.caption, color: C.textMuted, textAlign: 'center' },
});
