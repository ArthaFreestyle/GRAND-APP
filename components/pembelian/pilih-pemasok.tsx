/**
 * E1b of `Papan Layar.dc.html` — "Pilih pemasok".
 *
 * **One decision, and it is the one that cannot be taken back**, which is the
 * board's stated reason for giving it a screen of its own rather than a field on
 * the nota. `PATCH /pembelian/{id}` accepts neither `id_supplier` nor `id_ruang`
 * — the supplier decides whose debt the document becomes and the ruang decides
 * which balance every line touches — so the way out of a wrong choice is to
 * cancel the nota and retype it. A field you can tab past is the wrong shape for
 * that.
 *
 * ## Why a supplier is ranked by purchase history and not by a catalogue
 *
 * This system stores **no** supplier–product relation. There is no "products
 * this supplier sells" table to read, and the board says so. What does exist is
 * `GET /product/{id}/riwayat-beli`: one row per supplier, that supplier's most
 * recent **POSTED** purchase of that product. Drafts and cancelled documents are
 * excluded server-side, so every row is a price somebody actually paid rather
 * than one that was quoted in a chat.
 *
 * So the ranking here is a real fact stated plainly — *this supplier has sold
 * you three of the four things on your list, most recently in August* — and the
 * suppliers with no history are not hidden, only listed second. A first purchase
 * from a new supplier is ordinary.
 *
 * The same read is what supplies the opening prices for the nota, which is why
 * the flow owns it rather than this screen: `harga_satuan_dasar` is described in
 * the contract as the faktur price per base unit, which is exactly the number a
 * line counted in base units needs.
 */
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { listSupplier, type Supplier } from '@/services/supplier';

/**
 * What `GET /product/{id}/riwayat-beli` adds up to, per supplier, across the
 * products on the list.
 *
 * `harga` is `harga_satuan_dasar` — the faktur price per **base** unit, after
 * the line discount. The contract is explicit that this is the comparable
 * number and that `harga_satuan_input` is not: 12.000 per DUS and 1.000 per PCS
 * look wildly different and are the same price.
 */
export interface PemasokRiwayat {
  idSupplier: number;
  namaSupplier: string;
  /** productId → the last price paid to this supplier for it, per base unit. */
  perProduk: ReadonlyMap<number, { harga: string; tanggal: string }>;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type Entry =
  | { kind: 'header'; key: string; label: string }
  | {
      kind: 'row';
      key: string;
      supplier: Supplier;
      riwayat: PemasokRiwayat | null;
      first: boolean;
      last: boolean;
    };

export function PilihPemasokStep({
  jumlahBarang,
  riwayat,
  riwayatLoading,
  riwayatErr,
  picked,
  onPick,
  onBack,
  onBuat,
  membuat,
  buatErr,
  dockPad,
}: {
  jumlahBarang: number;
  /** Keyed by `id_supplier`. Empty while it loads, and after a failed read. */
  riwayat: ReadonlyMap<number, PemasokRiwayat>;
  riwayatLoading: boolean;
  riwayatErr: string;
  picked: Supplier | null;
  onPick: (s: Supplier) => void;
  onBack: () => void;
  onBuat: () => void;
  membuat: boolean;
  buatErr: string;
  dockPad: number;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<Supplier[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  // Empty is a safe sentinel: `requestKey` is never empty (it always carries
  // at least the reload counter), so the first render is always 'loading'.
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${search}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Search here is real — `GET /supplier?search=` matches part of the kode or
  // the nama in SQL — so it is debounced rather than filtering a loaded page.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listSupplier({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: true,
        });
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar pemasok.'));
      } finally {
        if (!alive) return;
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [search, reloadToken, requestKey]);

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listSupplier({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: true,
        });
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
    [loadingMore, loading, hasMore, moreErr, page, search]
  );

  /**
   * Two groups, and the split is the whole point of the screen.
   *
   * The suppliers with history come first, ordered by how much of *this* list
   * they have supplied before — that is the closest thing to "who sells this"
   * that the data contains. The rest follow under their own heading rather than
   * being hidden: a first purchase from a new supplier is ordinary, and a list
   * that quietly omits everyone you have not bought from before is a list that
   * cannot be used to start a relationship.
   */
  const entries = useMemo<Entry[]>(() => {
    const withHistory: { s: Supplier; r: PemasokRiwayat }[] = [];
    const without: Supplier[] = [];
    for (const s of rows) {
      const r = riwayat.get(s.id);
      if (r && r.perProduk.size > 0) withHistory.push({ s, r });
      else without.push(s);
    }
    withHistory.sort((a, b) => b.r.perProduk.size - a.r.perProduk.size);

    const out: Entry[] = [];
    const push = (label: string, list: { s: Supplier; r: PemasokRiwayat | null }[]) => {
      if (list.length === 0) return;
      out.push({ kind: 'header', key: `h-${label}`, label });
      list.forEach((item, i) =>
        out.push({
          kind: 'row',
          key: `s-${item.s.id}`,
          supplier: item.s,
          riwayat: item.r,
          first: i === 0,
          last: i === list.length - 1,
        })
      );
    };
    push('Pernah mengirim barang ini', withHistory);
    push(
      withHistory.length ? 'Pemasok lain' : 'Semua pemasok',
      without.map((s) => ({ s, r: null }))
    );
    return out;
  }, [rows, riwayat]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === 'header') return <RamahSectionHeader>{item.label}</RamahSectionHeader>;
      return (
        <PemasokRow
          supplier={item.supplier}
          riwayat={item.riwayat}
          jumlahBarang={jumlahBarang}
          selected={picked?.id === item.supplier.id}
          first={item.first}
          last={item.last}
          onPress={() => onPick(item.supplier)}
        />
      );
    },
    [picked, onPick, jumlahBarang]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pilih pemasok" onBack={onBack} />

      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderEntry}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nama atau kode pemasok"
            />
            {riwayatLoading ? (
              <View style={styles.riwayatLoading}>
                <ActivityIndicator size="small" color={C.brand} />
                <Text style={styles.riwayatLoadingText}>Membaca riwayat harga beli…</Text>
              </View>
            ) : null}
            {/* A failed history read still leaves a usable screen — every
                supplier is listed, only the ranking and the opening prices are
                missing — so it is a caption, not an error page. */}
            {riwayatErr ? <RamahInlineError message={riwayatErr} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            loading={loading}
            error={listErr}
            searching={search !== ''}
            onRetry={reload}
          />
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {buatErr ? <RamahInlineError message={buatErr} /> : null}
        <RamahNote icon="lock">Tidak bisa diubah setelah nota dibuat.</RamahNote>
        <RamahPrimaryButton
          label={membuat ? 'Membuat nota…' : 'Buat nota pembelian'}
          icon="file-plus"
          onPress={onBuat}
          disabled={!picked || membuat}
          busy={membuat}
        />
      </View>
    </View>
  );
}

function PemasokRow({
  supplier,
  riwayat,
  jumlahBarang,
  selected,
  first,
  last,
  onPress,
}: {
  supplier: Supplier;
  riwayat: PemasokRiwayat | null;
  jumlahBarang: number;
  selected: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  /**
   * Two facts, both read straight off the history: how much of this list the
   * supplier has sold before, and when the most recent of those purchases was.
   * Nothing is averaged and nothing is scored — an aggregate over four products
   * bought on four different dates is a number with no meaning, and this screen
   * is choosing a supplier, not grading one.
   */
  const ringkas = useMemo(() => {
    if (!riwayat || riwayat.perProduk.size === 0) return supplier.kode || 'Belum pernah dibeli';
    const entries = [...riwayat.perProduk.values()];
    const terbaru = entries.reduce((a, b) => (a.tanggal >= b.tanggal ? a : b));
    const cakupan = `${riwayat.perProduk.size} dari ${jumlahBarang} barang`;
    return `${cakupan} · terakhir ${formatTanggal(terbaru.tanggal)}`;
  }, [riwayat, supplier.kode, jumlahBarang]);

  // Only meaningful for a single-product list, where one price is *the* price
  // rather than one of several. With more than one, the figure would invite a
  // comparison it cannot support.
  const harga =
    riwayat && jumlahBarang === 1 && riwayat.perProduk.size === 1
      ? `${formatRupiah([...riwayat.perProduk.values()][0].harga)} / satuan dasar`
      : '';

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${supplier.nama}. ${ringkas}`}
        style={styles.row}>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Feather name="check" size={14} color={C.white} /> : null}
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {supplier.nama}
          </Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {ringkas}
          </Text>
        </View>
        {harga ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {harga}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function Placeholder({
  loading,
  error,
  searching,
  onRetry,
}: {
  loading: boolean;
  error: string;
  searching: boolean;
  onRetry: () => void;
}) {
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
          ? 'Tidak ada pemasok yang cocok dengan pencarian itu.'
          : 'Belum ada pemasok aktif. Tambahkan pemasok dulu sebelum membuat nota.'}
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
  controls: { gap: L.cardGap, paddingBottom: L.space4 },

  riwayatLoading: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  riwayatLoadingText: { ...T.caption, color: C.textBody },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: {
    borderBottomLeftRadius: R.card,
    borderBottomRightRadius: R.card,
    marginBottom: L.groupGap,
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { backgroundColor: C.brand, borderColor: C.brand },
  rowTitle: { ...T.rowTitle, color: C.textTitle },
  rowSub: { ...T.caption, color: C.textBody },
  rowValue: { ...T.caption, color: C.textTitle, textAlign: 'right', maxWidth: 130 },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.caption, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.cardGap,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
