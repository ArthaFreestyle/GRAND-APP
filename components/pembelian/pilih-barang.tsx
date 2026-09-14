/**
 * E1 of `Papan Layar.dc.html` — "Pilih barang", the first step of a new nota.
 *
 * **One question: what am I buying, and how much of it.** Any active product in
 * the gudang can be ticked. The board draws this screen as the reorder queue
 * (`screen: 'minimum'`), and it shipped that way — which meant a nota could
 * only ever be started for something already below its minimum. That is not
 * how a shop buys: stock is bought ahead, for a promotion, for a new line, or
 * because the supplier's truck is here today. So the queue is a **filter** on
 * this screen now ("Stok menipis"), not the screen itself.
 *
 * ## Two reads, one row shape
 *
 * - **"Semua barang"** reads `GET /pos/product`: every active product in the
 *   ruang with its units and its balance, three queries per page whatever the
 *   row count. It carries the base unit, so a ticked row needs no second read.
 * - **"Stok menipis"** reads `GET /product/stok-minimum`, whose membership *is*
 *   the definition of "di bawah minimum". It carries the shortfall but no unit,
 *   so ticking one of its rows still costs one `GET /product/{id}` — the flow
 *   does that, see `app/pembelian/baru.tsx`.
 *
 * Both are folded into `Kandidat` so the row, the selection and the dock do not
 * care which list a product was ticked from. Switching filter keeps the
 * selection: it lives in the flow, keyed by product id.
 *
 * ## Quantity and unit
 *
 * A row from the full catalogue opens at 1 in the product's default input unit
 * (`is_default_input`) — a shop buys paper by the rim, not by the sheet. A row
 * from the reorder queue opens at its shortfall (`selisih`) in the base unit,
 * because that is the unit the shortfall is counted in; no endpoint carries a
 * reorder suggestion, and inventing one would be a figure somebody acts on.
 * Either way the unit chip beside the stepper switches to any unit the product
 * registers, and the flow converts the quantity so the amount stays the same.
 *
 * ## No product code on screen
 *
 * `kode_barang` is how the server and a scanner find a product, not how
 * somebody in a storeroom recognises one. The search still matches it; the rows
 * never print it.
 *
 * ## The green card at the top is the OCR board's whole contribution to E1
 *
 * `Papan Layar OCR.dc.html` adds a card that opens the photo step. Without
 * `/ocr/faktur` it cannot fill the lines, so the photos are collected, ride
 * along with the flow, and end up attached to the nota. The card says how many
 * pages it is holding once it holds any.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  RamahChip,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf, type Paged } from '@/services/api';
import { listPosProducts, listStokMinimum } from '@/services/produk';
import type { RuangRow } from '@/services/ruang';

/** One unit a product is registered in. `faktor` is how many base units it holds. */
export interface SatuanPilihan {
  id: number;
  nama: string;
  faktor: number;
}

/** One line of the nota being assembled, as this flow carries it. */
export interface BarangDipilih {
  id: number;
  nama: string;
  /** In the chosen unit (`idSatuan`), which is what goes out as `qty_faktur`. */
  qty: number;
  /**
   * Every unit the product registers — `id_satuan_input` has no foreign key
   * behind it and an unregistered one answers 400, so the choice is only ever
   * made from this list. Empty for a reorder-queue row until the flow's
   * `GET /product/{id}` answers, because `StokMinimum` carries no unit.
   */
  satuan: SatuanPilihan[];
  /** Zero until the units are known; `buat()` refuses to send it. */
  idSatuan: number;
  namaSatuan: string;
  faktor: number;
}

/** A product that can be ticked, whichever list it came from. */
export interface Kandidat {
  id: number;
  nama: string;
  /** Balance in the base unit, in the chosen gudang. */
  stok: number;
  /** Name of the unit `stok` is counted in, or '' when the list did not carry it. */
  namaDasar: string;
  /** `null` when the list did not carry units (the reorder queue). */
  satuan: SatuanPilihan[] | null;
  /** The unit a fresh tick opens in: the product's default input unit. */
  idSatuanAwal: number | null;
  /** The quantity a fresh tick opens at, in `idSatuanAwal`. */
  saran: number;
  /** Shortfall below minimum, or `null` when the list does not know it. */
  kurang: number | null;
}

export type FilterBarang = 'semua' | 'menipis';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

async function bacaHalaman(
  filter: FilterBarang,
  query: { page: number; search: string; idRuang: number }
): Promise<Paged<Kandidat>> {
  const common = {
    page: query.page,
    size: PAGE_SIZE,
    search: query.search || undefined,
    id_ruang: query.idRuang,
  };
  if (filter === 'menipis') {
    const answer = await listStokMinimum(common);
    return {
      paging: answer.paging,
      data: answer.data.map((r) => ({
        id: r.id,
        nama: r.nama,
        stok: r.totalStok,
        namaDasar: '',
        satuan: null,
        idSatuanAwal: null,
        // In base units, which is what the line opens in until the units are
        // read. At least one: a product exactly at its minimum has a shortfall
        // of zero and is still on this list.
        saran: Math.max(1, r.selisih),
        kurang: r.selisih,
      })),
    };
  }
  const answer = await listPosProducts(common);
  return {
    paging: answer.paging,
    data: answer.data.map((p) => {
      const awal = p.satuan.find((s) => s.def) ?? p.dasar;
      return {
        id: p.id,
        nama: p.nama,
        stok: p.stokAkhir,
        namaDasar: p.dasar?.nama ?? '',
        satuan: p.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
        idSatuanAwal: awal?.idSatuan ?? null,
        saran: 1,
        kurang: null,
      };
    }),
  };
}

export function PilihBarangStep({
  ruangList,
  ruangId,
  onPickRuang,
  ruangErr,
  selection,
  onToggle,
  onQty,
  onSatuan,
  jumlahHalaman,
  onFoto,
  onBack,
  onLanjut,
  dockPad,
}: {
  ruangList: readonly RuangRow[];
  ruangId: number | null;
  onPickRuang: (id: number) => void;
  ruangErr: string;
  selection: ReadonlyMap<number, BarangDipilih>;
  onToggle: (item: Kandidat) => void;
  onQty: (id: number, qty: number) => void;
  onSatuan: (id: number, idSatuan: number) => void;
  jumlahHalaman: number;
  onFoto: () => void;
  onBack: () => void;
  onLanjut: () => void;
  dockPad: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterBarang>('semua');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The product whose unit sheet is open. One sheet for the screen, not one per row. */
  const [satuanUntuk, setSatuanUntuk] = useState<number | null>(null);

  const [rows, setRows] = useState<Kandidat[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  /**
   * Loading is derived, never stored: the key wanted is built during render, the
   * key loaded is written once when a read settles, and the spinner is the two
   * disagreeing — the shape `app/produk/index.tsx` worked out.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = ruangId === null ? '' : `${filter}|${ruangId}|${search}|${reloadToken}`;
  const loading = ruangId !== null && loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Both endpoints filter in SQL, so the field is debounced rather than
  // filtering an array a few pages deep.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (ruangId === null) return;
    let alive = true;
    (async () => {
      try {
        const answer = await bacaHalaman(filter, { page: 1, search, idRuang: ruangId });
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar barang.'));
      } finally {
        if (!alive) return;
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, ruangId, search, reloadToken, requestKey]);

  /**
   * `onEndReached` fires more than once on one approach, so the in-flight flag
   * is the guard. A failed page halts the loop behind a "Coba lagi".
   */
  const loadMore = useCallback(
    async (force = false) => {
      if (ruangId === null || loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await bacaHalaman(filter, { page: next, search, idRuang: ruangId });
        // Offset paging with no cursor: merge by id so a shifted window cannot
        // produce a duplicate key.
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...answer.data.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, answer.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [ruangId, loadingMore, loading, hasMore, moreErr, page, search, filter]
  );

  const renderRow = useCallback(
    ({ item, index }: { item: Kandidat; index: number }) => (
      <BarangRow
        item={item}
        picked={selection.get(item.id)}
        first={index === 0}
        last={index === rows.length - 1}
        onToggle={() => onToggle(item)}
        onQty={(q) => onQty(item.id, q)}
        onGantiSatuan={() => setSatuanUntuk(item.id)}
      />
    ),
    [selection, onToggle, onQty, rows.length]
  );

  const activeRuang = ruangList.find((r) => r.id === ruangId) ?? null;
  const dipilih = [...selection.values()];
  const barangSatuan = satuanUntuk === null ? undefined : selection.get(satuanUntuk);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pilih barang" onBack={onBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <FotoNotaCard jumlah={jumlahHalaman} onPress={onFoto} />

            <RamahSearchField value={query} onChangeText={setQuery} placeholder="Cari nama barang" />
            <View style={styles.chipRow}>
              {/* The gudang is where the balance is read *and* the `id_ruang`
                  every line lands in. It stops being a button when there is
                  only one room to choose. */}
              <RamahChip
                label={activeRuang?.nama ?? 'Gudang'}
                selected
                iconRight={ruangList.length > 1 ? 'chevron-down' : undefined}
                onPress={ruangList.length > 1 ? () => setSheetOpen(true) : undefined}
                accessibilityLabel={
                  ruangList.length > 1
                    ? `Gudang ${activeRuang?.nama ?? ''}. Ganti gudang`
                    : `Gudang ${activeRuang?.nama ?? ''}`
                }
              />
              <RamahChip
                label="Semua barang"
                selected={filter === 'semua'}
                onPress={() => setFilter('semua')}
              />
              <RamahChip
                label="Stok menipis"
                selected={filter === 'menipis'}
                onPress={() => setFilter('menipis')}
              />
            </View>

            {ruangErr ? (
              <View style={styles.ruangErrBox}>
                <RamahInlineError message={ruangErr} />
                {/* Issue #23: a unit kerja with no ruang used to leave this
                    step — and the nota it feeds — permanently unbuildable. */}
                <RamahSecondaryButton
                  label="Atur gudang"
                  icon="settings"
                  onPress={() => router.push('/pengaturan')}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            blocked={ruangId === null && ruangErr !== ''}
            loading={loading}
            error={listErr}
            searching={search !== ''}
            filter={filter}
            onRetry={reload}
          />
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {/* The chips *are* the summary; no price is known until a supplier is
            picked, which is the very next step. */}
        {dipilih.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selChips}>
            {dipilih.map((b) => (
              <View key={b.id} style={styles.selChip}>
                <Text style={styles.selChipText} numberOfLines={1}>
                  {`${b.nama} · ${formatNumber(b.qty)}${b.namaSatuan ? ` ${b.namaSatuan}` : ''}`}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.dockHint}>Centang barang yang mau dibeli.</Text>
        )}
        <RamahPrimaryButton
          label="Lanjut pilih pemasok"
          icon="arrow-right"
          onPress={onLanjut}
          disabled={dipilih.length === 0}
        />
      </View>

      <RamahSheet visible={sheetOpen} title="Pilih gudang" onClose={() => setSheetOpen(false)}>
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            // An open stock take makes the `kartu_stok` trigger refuse every
            // posting into that room; better found out here than at posting.
            sub={r.nomorOpnameBeku ? 'Beku karena stok opname' : r.namaUnitKerja || undefined}
            selected={r.id === ruangId}
            onPress={() => {
              setSheetOpen(false);
              onPickRuang(r.id);
            }}
          />
        ))}
      </RamahSheet>

      <RamahSheet
        visible={barangSatuan !== undefined}
        title={barangSatuan ? `Satuan ${barangSatuan.nama}` : 'Satuan'}
        onClose={() => setSatuanUntuk(null)}>
        {(barangSatuan?.satuan ?? []).map((s) => (
          <RamahSheetOption
            key={s.id}
            label={s.nama}
            sub={s.faktor === 1 ? undefined : `Isi ${formatNumber(s.faktor)}`}
            selected={s.id === barangSatuan?.idSatuan}
            onPress={() => {
              if (barangSatuan) onSatuan(barangSatuan.id, s.id);
              setSatuanUntuk(null);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/**
 * The OCR board's one addition to this screen — a second way *in*, which is
 * why it is the one tinted block and sits above the search rather than among
 * the rows.
 */
function FotoNotaCard({ jumlah, onPress }: { jumlah: number; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={
        jumlah ? `Foto nota pemasok, ${jumlah} halaman sudah diambil` : 'Foto nota pemasok'
      }
      style={[styles.ocrCard, down && styles.ocrCardDown]}>
      <View style={styles.ocrIcon}>
        <Feather name="camera" size={RamahIcon.row} color={C.brandInk} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.ocrTitle}>Foto nota pemasok</Text>
        {jumlah ? <Text style={styles.ocrSub}>{`${jumlah} halaman siap dilampirkan`}</Text> : null}
      </View>
      <Feather name="chevron-right" size={RamahIcon.row} color={C.brandInk} />
    </Pressable>
  );
}

/**
 * One product: its name, one line on its stock, and — once ticked — how many
 * to order.
 *
 * The stepper is inside the row rather than in a sheet because this is the only
 * thing anybody does on this screen. Typing past a shortfall is allowed:
 * buying ahead is ordinary.
 */
function BarangRow({
  item,
  picked,
  first,
  last,
  onToggle,
  onQty,
  onGantiSatuan,
}: {
  item: Kandidat;
  picked: BarangDipilih | undefined;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onQty: (qty: number) => void;
  onGantiSatuan: () => void;
}) {
  const habis = item.stok <= 0;
  const namaDasar =
    item.namaDasar || picked?.satuan.find((s) => s.faktor === 1)?.nama || '';
  const status = habis
    ? 'Stok habis'
    : item.kurang !== null
      ? `Sisa ${formatNumber(item.stok)} · kurang ${formatNumber(item.kurang)} dari minimum`
      : `Sisa ${formatNumber(item.stok)}${namaDasar ? ` ${namaDasar}` : ''}`;

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!picked }}
        accessibilityLabel={`${item.nama}, ${status}`}
        style={styles.row}>
        <View style={[styles.box, picked && styles.boxOn]}>
          {picked ? <Feather name="check" size={14} color={C.white} /> : null}
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.nama}
          </Text>
          <Text
            style={[
              styles.rowStatus,
              habis ? styles.rowStatusHabis : item.kurang !== null && styles.rowStatusKurang,
            ]}
            numberOfLines={1}>
            {status}
          </Text>
        </View>
      </Pressable>

      {picked ? (
        <View style={styles.stepper}>
          <RamahIconButton
            icon="minus"
            label={`Kurangi jumlah beli ${item.nama}`}
            variant="outline"
            size={44}
            disabled={picked.qty <= 1}
            onPress={() => onQty(Math.max(1, picked.qty - 1))}
          />
          <TextInput
            value={String(picked.qty)}
            onChangeText={(v) => {
              // Digits only, and an empty field reads as 1: zero is not a
              // quantity anybody means to order.
              const n = Number(v.replace(/[^0-9]/g, ''));
              onQty(Number.isFinite(n) && n > 0 ? n : 1);
            }}
            inputMode="numeric"
            keyboardType="number-pad"
            selectTextOnFocus
            accessibilityLabel={`Jumlah beli ${item.nama}`}
            style={styles.qtyInput}
          />
          <View style={styles.grow}>
            <SatuanChip barang={picked} onPress={onGantiSatuan} />
          </View>
          <RamahIconButton
            icon="plus"
            label={`Tambah jumlah beli ${item.nama}`}
            variant="tint"
            size={44}
            onPress={() => onQty(picked.qty + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The unit beside the quantity. A button only when there is a second unit to
 * choose; a product registered in one unit gets plain text, and a reorder row
 * still waiting for its units gets a spinner rather than a chip that opens an
 * empty sheet.
 */
function SatuanChip({ barang, onPress }: { barang: BarangDipilih; onPress: () => void }) {
  const [down, setDown] = useState(false);
  if (barang.idSatuan === 0) return <ActivityIndicator color={C.brand} style={styles.satuanWait} />;
  if (barang.satuan.length < 2)
    return (
      <Text style={styles.stepLabel} numberOfLines={1}>
        {barang.namaSatuan}
      </Text>
    );
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={`Satuan ${barang.namaSatuan}. Ganti satuan`}
      style={[styles.satuanChip, down && styles.satuanChipDown]}>
      <Text style={styles.satuanChipText} numberOfLines={1}>
        {barang.namaSatuan}
      </Text>
      <Feather name="chevron-down" size={RamahIcon.meta} color={C.iconMuted} />
    </Pressable>
  );
}

function Placeholder({
  blocked,
  loading,
  error,
  searching,
  filter,
  onRetry,
}: {
  blocked: boolean;
  loading: boolean;
  error: string;
  searching: boolean;
  filter: FilterBarang;
  onRetry: () => void;
}) {
  // With no gudang there is nothing to be empty *of*; the error above says why.
  if (blocked) return null;
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (loading)
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {searching
          ? 'Tidak ada barang yang cocok.'
          : filter === 'menipis'
            ? 'Tidak ada stok yang menipis di gudang ini.'
            : 'Belum ada barang aktif.'}
      </Text>
    </View>
  );
}

function Footer({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.stack, paddingBottom: L.stack },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.related },
  ruangErrBox: { gap: L.space2, alignItems: 'flex-start' },

  ocrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPadDense,
    borderRadius: R.card,
    backgroundColor: C.brandTintSoft,
    borderWidth: 1,
    borderColor: C.green200,
  },
  ocrCardDown: { opacity: 0.85 },
  ocrIcon: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.green200,
  },
  ocrTitle: { ...T.titleTiny, color: C.textTitle },
  ocrSub: { ...T.bodySmall, color: C.brandInk },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: {
    borderBottomLeftRadius: R.card,
    borderBottomRightRadius: R.card,
    marginBottom: L.stack,
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    // An optical nudge onto the title's first line, not a gap — one of the
    // exceptions `RamahLayout` lists to the 4px grid.
    marginTop: 1,
  },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowStatus: { ...T.bodySmall, color: C.textBody },
  rowStatusKurang: { color: C.textWarning },
  rowStatusHabis: { color: C.textDanger },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingHorizontal: L.cardPad,
    paddingBottom: L.cardPadDense,
  },
  qtyInput: {
    width: 64,
    height: 44,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
    backgroundColor: C.surfacePage,
    textAlign: 'center',
    color: C.textTitle,
    ...T.titleTiny,
    paddingVertical: 0,
  },
  stepLabel: { ...T.bodySmall, color: C.textBody },
  satuanWait: { alignSelf: 'flex-start' },
  satuanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: L.controlHSm,
    paddingHorizontal: L.space3,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderHairline,
    backgroundColor: C.white,
  },
  satuanChipDown: { backgroundColor: C.surfaceStack },
  satuanChipText: { ...T.bodySmall, color: C.textTitle, flexShrink: 1 },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
  dockHint: { ...T.bodySmall, color: C.textBody },
  selChips: { gap: L.related },
  selChip: {
    maxWidth: 200,
    paddingHorizontal: L.space2,
    paddingVertical: L.space1,
    borderRadius: R.pill,
    backgroundColor: C.grey100,
  },
  selChipText: { ...T.bodySmall, color: C.textBody },
});
