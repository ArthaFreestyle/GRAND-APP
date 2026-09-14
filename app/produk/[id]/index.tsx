/**
 * Detail barang — screen C2 of `Papan Layar.dc.html`, drawn as
 * `LayarGudang.dc.html` draws it at `screen: 'produk'`.
 *
 * The board states this screen's purpose in one line and it is worth keeping in
 * front of you while changing anything here: **"menjelaskan kenapa saldonya
 * segitu"**. Two large figures at the top answer it fast; the kartu stok at the
 * bottom answers it completely, by showing the chain of movements that produced
 * the number. Everything between the two is what the figures mean — which unit
 * they are counted in, what the thing sells for, and which room they belong to.
 *
 * ## The room is the whole frame
 *
 * A balance is never a property of a product; it is a property of
 * `(barang, ruang)`. `kartu_stok` partitions the chain that way and
 * `GET /product/{id}/kartu-stok` requires `id_ruang` for exactly that reason —
 * a "history" that mixed rooms would print a running balance that never existed
 * on any one shelf.
 *
 * So this screen picks a room and holds it, and **every figure on it is that
 * room's**: the saldo card, the comparison against stok minimum, and the ledger.
 * The room arrives as `?ruang=` from the catalogue, so opening a row lands on
 * the same stock that row was quoting; a cold deep link falls back to the room
 * the catalogue last remembered, and then to the first one. `Stok per gudang`
 * is what stops that from hiding anything — it is drawn only when the product
 * is in more than one room, because with one room it would repeat the card
 * above it word for word.
 *
 * ## Two loads, not one, and they fail differently
 *
 * `GET /product/{id}` answers the record — name, code, units, price history —
 * and its failure is a failure page: this route can be arrived at cold, so
 * there may be no list underneath to toast over.
 *
 * The room-scoped reads (`/stok` and `/kartu-stok`) are a *second* question
 * about a record that is already on screen. When they fail the product is still
 * correct and only its figures are missing, which is worth a caption rather than
 * an error page — and they are re-run on their own when the room changes,
 * without re-reading the product.
 *
 * ## Why the ledger opens on its last page
 *
 * `kartu-stok` is sorted **ascending by id** — not by date, and not descending
 * like every other list in this API — because the chain is built in id order by
 * the trigger and a reversal is stamped `time.Now()`, so date order can differ
 * from the real order. A ledger is read top to bottom.
 *
 * That makes page 1 the oldest twenty movements, which is the wrong twenty for
 * a product with four hundred. So the screen reads page 1 to learn
 * `total_page`, then reads the last page if there is more than one, and offers
 * "Muat yang lebih lama" to walk backwards a page at a time. Two requests in
 * the worst case, and the rows stay in the order the contract sent them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';

import {
  RamahChip,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahStackCard,
  RamahStackRow,
  RamahStatCard,
  type FeatherName,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah, formatTanggal, todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahType as T,
  type RamahTileToneName,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  getProduct,
  listKartuStok,
  listStok,
  produkBus,
  produkDetailBus,
  productRowOf,
  updateProduct,
  type KartuStokRow,
  type ProductDetail,
  type ProductHargaRow,
  type StokRuang,
} from '@/services/produk';
import { listRuang, type RuangRow } from '@/services/ruang';

/** The same key Katalog writes, so the two screens open on the same gudang. */
const RUANG_KEY = 'katalog.ruang';
const LEDGER_PAGE_SIZE = 20;

export default function ProdukDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /**
   * The docked control's bottom padding, keyboard included.
   *
   * Under edge-to-edge the Android window is not resized when the IME
   * opens, so a button sitting on the bottom edge is simply covered by it.
   * `useDockPadding` swaps the safe-area inset for the keyboard's height
   * while it is up — the two are alternatives, never a sum, because the
   * gesture bar that inset pays for is itself behind the keyboard.
   */
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const params = useLocalSearchParams<{ id: string; ruang?: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);
  const canWrite = useCanWrite('produk');

  /**
   * A malformed `:id` is a fact about the *route*, known the moment the params
   * arrive — so the failure page is derived during render rather than written
   * into state from an effect. Writing it cost a render, then an effect, then a
   * second render, to conclude something that was already true.
   */
  const idValid = Number.isFinite(id) && id > 0;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadErr, setLoadErr] = useState('');
  /**
   * Loading is derived, the same way the catalogue derives it: the key the
   * screen *wants* loaded is built during render, the key it *has* loaded is
   * written once when a read settles, and loading is the two disagreeing.
   * Nothing is set on the way into the effect, so there is no render cascade and
   * no stale response can un-set a flag the next request just set.
   */
  const [loadedId, setLoadedId] = useState(0);
  const loadingProduct = idValid && loadedId !== id;

  // ---- which gudang every figure on this screen belongs to ----
  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [ruangSheet, setRuangSheet] = useState(false);

  // ---- the room-scoped reads ----
  const [stok, setStok] = useState<StokRuang[]>([]);
  const [ledger, setLedger] = useState<KartuStokRow[]>([]);
  /** The oldest page already in `ledger`; 1 means the whole chain is on screen. */
  const [oldestPage, setOldestPage] = useState(1);
  const [figuresErr, setFiguresErr] = useState('');
  const [figuresKey, setFiguresKey] = useState('');
  const [olderBusy, setOlderBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  /**
   * Read once, on the way in. Safe here and not on a section root: this screen
   * is pushed and therefore mounted fresh every time, so the ref re-reads with
   * the route. A parameter aimed at a screen the navigator keeps mounted has to
   * be cleared off the URL instead.
   *
   * `?ubah=1` means "open the edit form on arrival", the same convention the
   * pembelian and susulan details carry. Nothing in the catalogue pushes it
   * today — a row there opens the record and the record offers the pencil — so
   * what it serves is a link from outside the section, and it is kept because
   * this is where every section's edit entry point is expected to be.
   *
   * It goes *through* this screen rather than pointing straight at
   * `/produk/[id]/ubah`, which is the whole reason it still earns its place:
   * pushing both leaves the detail underneath the form, so closing the form
   * lands on the record that was just changed rather than on whatever the link
   * came from. It waits for the product to load for a related reason — there is
   * no point stacking a second screen over a detail that is about to turn into
   * "Barang tidak ditemukan".
   */
  const openUbahOnLoad = useRef(params.ubah === '1');
  const announceCreated = useRef(params.baru === '1');

  /**
   * The figures are loading until the room is known *and* the reads for that
   * room have settled — the first half matters as much as the second. Without
   * it, the frame before `GET /ruang` answers has `ruangId === null`, which
   * makes `stok` empty, which makes the saldo card print "0" and the minimum
   * card claim a shortfall against it. A figure that is merely not known yet
   * must never be drawn as a figure that is known to be zero.
   *
   * A failed read is an answer too, which is what stops this standing at true
   * forever when there is no room to read from at all.
   */
  const figuresWant = ruangId === null || !idValid ? '' : `${id}|${ruangId}`;
  const loadingFigures = figuresErr === '' && (figuresWant === '' || figuresKey !== figuresWant);

  // ---- the product ----
  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getProduct(id)
      .then((detail) => {
        if (!alive) return;
        setProduct(detail);
        setLoadErr('');
        if (openUbahOnLoad.current) {
          openUbahOnLoad.current = false;
          router.push({ pathname: '/produk/[id]/ubah', params: { id: String(id) } });
        }
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(
            `Produk dibuat · saldonya nol sampai ada nota pembelian yang diposting ke gudang.`
          );
        }
      })
      .catch((e) => {
        if (!alive) return;
        setProduct(null);
        setLoadErr(messageOf(e, 'Gagal memuat detail produk.'));
      })
      .finally(() => {
        if (alive) setLoadedId(id);
      });
    return () => {
      alive = false;
    };
  }, [id, idValid, router]);

  /**
   * The gudang list, and which one this screen opens on.
   *
   * The catalogue hands its own choice over in `?ruang=`, which is the case that
   * matters: a row quoting "6 rim" must open a screen that also says 6. Only if
   * that is missing — a deep link, a shared URL — does it fall back to the
   * remembered choice and then to the first room in the unit kerja.
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
        const fromParam = answer.data.find((r) => r.id === Number(params.ruang));
        const remembered = answer.data.find((r) => r.id === Number(saved));
        const pick = fromParam ?? remembered ?? answer.data[0];
        if (pick) setRuangId(pick.id);
        else setFiguresErr('Tidak ada gudang di unit kerja ini, jadi stok tidak bisa dibaca.');
      } catch (e) {
        if (!alive) return;
        setFiguresErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      }
    })();
    return () => {
      alive = false;
    };
    // `params.ruang` is read once, to seed. A change to it means a different
    // push, which mounts a different instance of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The two room-scoped reads, settled side by side.
   *
   * `listStok` is not narrowed to the room — it answers every room in the unit
   * kerja in one call, which is what the "Stok per gudang" section needs and
   * what makes the saldo card a lookup rather than a third request.
   */
  useEffect(() => {
    if (!idValid || ruangId === null) return;
    let alive = true;
    const want = `${id}|${ruangId}`;

    (async () => {
      const [perRuang, tail] = await Promise.allSettled([
        listStok(id),
        (async () => {
          const first = await listKartuStok(id, { id_ruang: ruangId, page: 1, size: LEDGER_PAGE_SIZE });
          const total = Math.max(1, first.paging.total_page ?? 1);
          if (total === 1) return { rows: first.data, page: 1 };
          const last = await listKartuStok(id, {
            id_ruang: ruangId,
            page: total,
            size: LEDGER_PAGE_SIZE,
          });
          return { rows: last.data, page: total };
        })(),
      ]);
      if (!alive) return;

      if (perRuang.status === 'fulfilled') setStok(perRuang.value);
      else setStok([]);

      if (tail.status === 'fulfilled') {
        setLedger(tail.value.rows);
        setOldestPage(tail.value.page);
      } else {
        setLedger([]);
        setOldestPage(1);
      }

      setFiguresErr(
        perRuang.status === 'rejected'
          ? messageOf(perRuang.reason, 'Saldo per gudang tidak terbaca.')
          : tail.status === 'rejected'
            ? messageOf(tail.reason, 'Kartu stok tidak terbaca.')
            : ''
      );
      setFiguresKey(want);
    })();

    return () => {
      alive = false;
    };
  }, [id, idValid, ruangId]);

  const pickRuang = useCallback((next: number) => {
    setRuangSheet(false);
    setRuangId(next);
    AsyncStorage.setItem(RUANG_KEY, String(next)).catch(() => {
      // A preference that will not persist is not worth an error on a screen
      // that is otherwise working.
    });
  }, []);

  const loadOlder = useCallback(async () => {
    if (ruangId === null || olderBusy || oldestPage <= 1) return;
    setOlderBusy(true);
    try {
      const prev = await listKartuStok(id, {
        id_ruang: ruangId,
        page: oldestPage - 1,
        size: LEDGER_PAGE_SIZE,
      });
      // Prepended, because the chain is ascending and the page before this one
      // is what happened *before* it. Merging by id guards the case a movement
      // was written between the two reads and shifted the offset window.
      setLedger((rows) => {
        const seen = new Set(rows.map((r) => r.id));
        return [...prev.data.filter((r) => !seen.has(r.id)), ...rows];
      });
      setOldestPage(oldestPage - 1);
    } catch (e) {
      setFiguresErr(messageOf(e, 'Gagal memuat pergerakan yang lebih lama.'));
    } finally {
      setOlderBusy(false);
    }
  }, [id, ruangId, oldestPage, olderBusy]);

  /**
   * Every write answers with the whole product, so this is the only sync there
   * is. Only the columns the catalogue actually renders go onto the bus: handing
   * it satuan and harga would leave a second, quietly diverging copy of them in
   * a row that draws neither.
   *
   * This screen's own writes do not go onto `produkDetailBus` — it is the only
   * subscriber, and publishing to yourself is a round trip to set state you are
   * already holding.
   */
  const applyDetail = useCallback((detail: ProductDetail, message: string) => {
    setProduct(detail);
    if (message) setKabar(message);
    produkBus.publish({ kind: 'saved', row: productRowOf(detail) });
  }, []);

  /**
   * What `/produk/[id]/ubah` answers with, once it has saved and left.
   *
   * The edit form is a pushed route now rather than a dialog this screen owned,
   * so there is no callback to hand it — the record comes back over a bus, the
   * same way the catalogue underneath learns about a change here. The id guard
   * matters because the bus is module-level and outlives every screen on it: a
   * second detail opened later would otherwise adopt an answer meant for the
   * first.
   *
   * `reload` is ignored. It is what a context switch publishes to tell *lists*
   * to re-read page one, and this screen is not a list — it is one record, read
   * by id, which either still resolves or turns into its own failure page the
   * next time it is opened.
   */
  useRecordBus(produkDetailBus, (change) => {
    if (change.kind !== 'saved' || change.row.detail.id !== id) return;
    setProduct(change.row.detail);
    if (change.row.kabar) setKabar(change.row.kabar);
  });

  /** The edit form, pushed so that closing it returns to this record. */
  const openUbah = useCallback(() => {
    router.push({ pathname: '/produk/[id]/ubah', params: { id: String(id) } });
  }, [router, id]);

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `back()` is offered to the
    // navigator containing the tabs first, which may answer by switching tabs.
    // The `replace` covers a cold deep link with nothing to pop.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/produk');
  }, [router]);

  const toggleAktif = useCallback(async () => {
    if (!product || busy) return;
    const next = !product.aktif;
    setBusy(true);
    try {
      applyDetail(
        await updateProduct(product.id, { is_aktif: next }),
        next
          ? 'Produk diaktifkan kembali'
          : 'Produk diarsipkan · tidak lagi muncul di katalog maupun di kasir'
      );
    } catch (e) {
      setKabar(messageOf(e, 'Gagal mengubah status produk.'));
    } finally {
      setBusy(false);
    }
  }, [product, busy, applyDetail]);

  // ---- failure and loading pages ----

  if (!idValid || (!loadingProduct && !product)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail barang" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Barang tidak ditemukan</Text>
          <Text style={styles.centerSub}>
            {idValid ? loadErr : 'Alamat produk tidak dikenali.'}
          </Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke katalog" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail barang" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const activeRuang = ruangList.find((r) => r.id === ruangId) ?? null;
  const namaGudang = activeRuang?.nama ?? 'gudang';
  const saldo = stok.find((s) => s.id_ruang === ruangId)?.stok_akhir ?? 0;
  const dasar = product.namaSatuanDasar || 'satuan dasar';
  // The endpoint's own definition, applied here so this screen and the catalogue
  // agree: zero means "belum diatur" and never counts as low, and the threshold
  // is `<=` — reaching the reorder point *is* the moment to reorder.
  const punyaMinimum = product.stokMin > 0;
  const kurang = punyaMinimum ? Math.max(0, product.stokMin - saldo) : 0;
  const low = punyaMinimum && saldo <= product.stokMin;
  /** Rooms this product has ever passed through — a room it never touched never appears. */
  const roomsWithStock = stok.filter((s) => (s.stok_akhir ?? 0) !== 0 || s.id_ruang === ruangId);

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail barang"
        onBack={goBack}
        right={
          canWrite ? (
            <View style={styles.headerActions}>
              <RamahIconButton icon="edit-2" label="Ubah produk" onPress={openUbah} />
              {/* Archiving, not deleting — the contract has no `DELETE /product`
                  and `is_aktif: false` is the only removal there is. The bin is
                  what everyone reads as "take this out of the way", and the way
                  back is the same button pointing the other way. */}
              <RamahIconButton
                icon={product.aktif ? 'trash-2' : 'rotate-ccw'}
                label={product.aktif ? 'Arsipkan produk' : 'Aktifkan kembali'}
                color={product.aktif ? C.danger : C.brandInk}
                onPress={toggleAktif}
                disabled={busy}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <Text style={styles.identityName}>{product.nama}</Text>
          {/* The kode belongs here and not on a catalogue row: it is how the
              row is found, and reference data is what you read once you have
              found the record. Unit count and base unit already repeat in the
              "Satuan & harga jual" card below, so they are not said twice. */}
          <Text style={styles.identitySub}>{product.kode}</Text>
          {!product.aktif ? (
            <View style={styles.arsipTag}>
              <Text style={styles.arsipText}>Diarsipkan · tidak dijual</Text>
            </View>
          ) : null}
        </View>

        {/* The gudang chip, the two figures and the error about reading them
            are one group: the chip is what the numbers under it are *for*, so
            it sits a `stack` above them and a `group` below the product's name.
            It used to be the other way round — pulled up against the name by a
            negative margin and 16 clear of the figures it labels. */}
        <View style={styles.figures}>
          {/* The gudang is a chip and not a heading, for the reason it is one on
              the catalogue: a stock figure means nothing without the room it was
              counted in. It stops being a button when there is only one room. */}
          <View style={styles.chipRow}>
            <RamahChip
              label={activeRuang?.nama ?? 'Gudang'}
              selected
              iconRight={ruangList.length > 1 ? 'chevron-down' : undefined}
              onPress={ruangList.length > 1 ? () => setRuangSheet(true) : undefined}
              accessibilityLabel={
                ruangList.length > 1
                  ? `Angka di layar ini untuk gudang ${namaGudang}. Ganti gudang`
                  : `Angka di layar ini untuk gudang ${namaGudang}`
              }
            />
          </View>

          <View style={styles.statRow}>
            <RamahStatCard
              label="Saldo akhir"
              value={loadingFigures ? '—' : `${formatNumber(saldo)} ${dasar}`}
              accessibilityLabel={
                loadingFigures
                  ? 'Saldo akhir sedang dibaca'
                  : `Saldo akhir di ${namaGudang}, ${formatNumber(saldo)} ${dasar}`
              }
            />
            <RamahStatCard
              label="Stok minimum"
              // The threshold itself comes off the product and is known before any
              // room is chosen, so it is drawn immediately. Only the *comparison*
              // under it has to wait for the balance.
              value={punyaMinimum ? `${formatNumber(product.stokMin)} ${dasar}` : 'Belum diatur'}
              // The tone is the *card's*, never the figure's. A balance under its
              // reorder point is worth marking; painting the number orange reads
              // as an alarm a bare count does not justify.
              tone={!loadingFigures && low ? 'warn' : 'plain'}
              note={
                !punyaMinimum
                  ? undefined
                  : loadingFigures
                    ? 'Membandingkan saldo…'
                    : low
                      ? `Kurang ${formatNumber(kurang)} ${dasar}`
                      : 'Aman'
              }
            />
          </View>

          {figuresErr ? (
            <View style={styles.figuresErrBox}>
              <RamahInlineError message={figuresErr} />
              {/* Issue #23: a unit kerja with no ruang used to leave this screen
                  permanently unable to read stock, with nowhere to go. */}
              <RamahSecondaryButton
                label="Atur gudang"
                icon="settings"
                onPress={() => router.push('/pengaturan')}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.group}>
          <RamahSectionHeader
            action={canWrite ? 'Ubah' : undefined}
            onAction={canWrite ? openUbah : undefined}>
            Satuan &amp; harga jual
          </RamahSectionHeader>
          <RamahStackCard>
            {product.satuan.map((s) => {
              const berlaku = hargaBerlaku(product.harga, s.idSatuan);
              return (
                <RamahStackRow
                  key={s.id}
                  icon="layers"
                  tone="katalog"
                  title={s.nama}
                  subtitle={
                    s.faktor === 1
                      ? 'Satuan dasar'
                      : `1 ${s.nama} = ${formatNumber(s.faktor)} ${dasar}`
                  }
                  // A product with no price version in force is still sellable,
                  // with the amount typed at the till — the contract sends the
                  // absence on purpose. Saying so beats printing "Rp 0", which
                  // is a price somebody could act on.
                  value={berlaku ? formatRupiah(berlaku.harga) : 'Belum ada harga'}
                />
              );
            })}
          </RamahStackCard>
        </View>

        {/* Drawn only when there is more than one room holding this product.
            With one, it would repeat the saldo card above it word for word —
            and a line that says what the line above it already said is a line
            nobody reads twice. */}
        {roomsWithStock.length > 1 ? (
          <View style={styles.group}>
            <RamahSectionHeader>Stok per gudang</RamahSectionHeader>
            <RamahStackCard>
              {roomsWithStock.map((r) => (
                <RamahStackRow
                  key={r.id_ruang}
                  icon={r.id_ruang === ruangId ? 'eye' : 'home'}
                  tone={r.id_ruang === ruangId ? 'stok' : 'akun'}
                  title={r.nama_ruang ?? ''}
                  value={`${formatNumber(r.stok_akhir ?? 0)} ${dasar}`}
                  onPress={r.id_ruang === ruangId ? undefined : () => pickRuang(r.id_ruang ?? 0)}
                />
              ))}
            </RamahStackCard>
          </View>
        ) : null}

        <View style={styles.group}>
          <RamahSectionHeader>{`Kartu stok · ${namaGudang}`}</RamahSectionHeader>
          {loadingFigures ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : ledger.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Belum pernah bergerak di sini</Text>
              <Text style={styles.emptySub}>
                Saldo lahir dari nota pembelian yang diposting. Sebelum itu, barang ini ada di
                katalog dengan saldo nol.
              </Text>
            </View>
          ) : (
            <>
              {oldestPage > 1 ? (
                <RamahSecondaryButton
                  label={olderBusy ? 'Memuat…' : 'Muat yang lebih lama'}
                  onPress={loadOlder}
                  disabled={olderBusy}
                  fullWidth
                />
              ) : null}
              <RamahStackCard>
                {ledger.map((k) => {
                  const look = ledgerLook(k);
                  const qty = k.masuk > 0 ? k.masuk : k.keluar;
                  return (
                    <RamahStackRow
                      key={k.id}
                      icon={look.icon}
                      tone={look.tone}
                      title={`${look.label} · ${formatTanggal(k.tanggal)}`}
                      subtitle={k.nomor ?? undefined}
                      value={`${k.masuk > 0 ? '+' : '−'} ${formatNumber(qty)}`}
                      meta={`sisa ${formatNumber(k.saldo)}`}
                    />
                  );
                })}
              </RamahStackCard>
              <Text style={styles.ledgerNote}>{`Semua angka dalam ${dasar}.`}</Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* The screen's one action, and it is outlined rather than solid: this is
          a reading screen, and the guide spends a screen's single green pill
          where something is created or posted. */}
      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahSecondaryButton
            label="Ubah produk"
            icon="edit-2"
            onPress={openUbah}
            fullWidth
            height={L.controlH}
          />
        </View>
      ) : null}

      <RamahSheet visible={ruangSheet} title="Pilih gudang" onClose={() => setRuangSheet(false)}>
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            sub={
              r.nomorOpnameBeku
                ? `Beku oleh opname ${r.nomorOpnameBeku}`
                : r.namaUnitKerja || undefined
            }
            selected={r.id === ruangId}
            onPress={() => pickRuang(r.id)}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/**
 * The price version in force **today** for one unit.
 *
 * The rule is the contract's own half-open range, not "newest wins":
 * `product_harga_jual_no_overlap` guarantees at most one candidate is ever in
 * force, so this is a find rather than a sort — and if that constraint were
 * ever relaxed, this resolver would become ambiguous along with the server's.
 */
function hargaBerlaku(harga: readonly ProductHargaRow[], idSatuan: number): ProductHargaRow | null {
  const today = todayISO();
  return (
    harga.find(
      (h) => h.idSatuan === idSatuan && h.dari <= today && (h.sampai === null || h.sampai > today)
    ) ?? null
  );
}

/**
 * How one ledger line is drawn: its glyph, its tint, and what to call it when
 * the server could not resolve a document number.
 *
 * A **reversal** is told apart by `idAsal` and nothing else. `jenis_transaksi`
 * is shared between a posting and the line that undoes it, so reading the kind
 * off that field would draw a cancellation as the movement it cancelled — which
 * is exactly the mistake the contract added `id_kartu_stok_asal` to prevent.
 */
function ledgerLook(k: KartuStokRow): { icon: FeatherName; tone: RamahTileToneName; label: string } {
  if (k.idAsal !== null) {
    return { icon: 'rotate-ccw', tone: 'akun', label: 'pembalikan' };
  }
  const jenis = k.jenis.toLowerCase();
  // `repeat` rather than the board's `arrow-left-right`: Feather has no such
  // glyph, and a mutasi is a round trip between two rooms rather than a single
  // direction, so the substitution says the same thing.
  if (jenis.includes('mutasi')) {
    return { icon: 'repeat', tone: 'dokumen', label: k.masuk > 0 ? 'mutasi masuk' : 'mutasi keluar' };
  }
  if (jenis.includes('opname')) return { icon: 'clipboard', tone: 'akun', label: 'stok opname' };
  if (k.masuk > 0) {
    if (jenis.includes('susulan')) return { icon: 'truck', tone: 'laporan', label: 'kiriman susulan' };
    return { icon: 'download', tone: 'katalog', label: 'pembelian' };
  }
  return { icon: 'upload', tone: 'stok', label: 'penjualan' };
}

/**
 * No top, left or right inset here: `app/produk/_layout.tsx` pays all three for
 * the whole section, outside the navigator. The bottom is this screen's, and is
 * read in the component rather than baked in here — an inset is a runtime value
 * that changes with rotation, a foldable, and the keyboard, and is often zero.
 * The edit form is a screen of the same stack now, so it is inside that box and
 * pays only the bottom edge too — which is the whole of what it stopped having
 * to hand-roll when it stopped being a `Modal` with a window of its own.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -L.space2 },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space1,
    paddingBottom: L.space6,
    gap: L.group,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  figuresErrBox: { gap: L.space2, alignItems: 'flex-start' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.space1 },
  identityName: { ...T.titleModerate, color: C.textTitle },
  identitySub: { ...T.bodySmall, color: C.textBody },
  arsipTag: {
    alignSelf: 'flex-start',
    marginTop: L.space2,
    paddingHorizontal: L.space2,
    paddingVertical: L.space1,
    borderRadius: 999,
    backgroundColor: C.grey200,
  },
  arsipText: { ...T.caption, color: C.textBody },

  figures: { gap: L.stack },
  chipRow: { flexDirection: 'row', gap: L.related, flexWrap: 'wrap' },
  statRow: { flexDirection: 'row', gap: L.stack },

  group: { gap: L.related },
  inlineLoading: { paddingVertical: L.space8, alignItems: 'center' },
  ledgerNote: { ...T.bodySmall, color: C.textBody, paddingTop: L.space1 },

  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: 16,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.titleTiny, color: C.textTitle },
  emptySub: { ...T.bodySmall, color: C.textBody },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
