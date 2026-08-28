/**
 * Master Produk — the list.
 *
 * Opening a product and creating one are routes now (`[id]` and `baru`), not
 * branches of this component: this screen stays mounted underneath them, so it
 * keeps its rows, its appended pages, and its scroll position for free. What it
 * cannot see by itself — a product renamed or archived on the detail — arrives
 * over `produkBus`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  RecordList,
  UndoBar,
  type RecordAction,
  type RecordItem,
} from '@/components/shell/record-list';
import { FilterPills, Toast } from '@/components/shell/ui';
import { ProdukColors as C, formatNumber, formatTanggal } from '@/constants/produk';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  listProducts,
  listStokMinimum,
  produkBus,
  updateProduct,
  type ProductRow,
  type StokMinimumRow,
} from '@/services/produk';

// 20 per page: the list is text-only, so the fetch is small and the reader gets
// a screenful in one round trip. Halve it if a row ever carries an image.
const PAGE_SIZE = 20;
/** Long enough that typing a code doesn't fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * What the chips can actually ask the API for.
 *
 * "Stok menipis" is `GET /product/stok-minimum`, a different endpoint rather
 * than a parameter: the product list carries no stock at all. There is
 * deliberately no "Habis" chip - a product sitting at zero with `stok_minimum`
 * still at its 0 default never appears in that endpoint, so the chip would be
 * telling a comfortable lie - and no "Draft", which the `Product` schema has no
 * field for.
 */
type Filter = 'semua' | 'menipis' | 'nonaktif';

/**
 * The chip is remembered across launches. There is no sort parameter on
 * `GET /product` to persist instead, and this is the nearest thing to one:
 * whoever minds the stock wants the reorder list, which arrives sorted
 * worst-first, and should not have to ask for it every morning.
 */
const FILTER_KEY = 'produk.filter';

const FILTER_OPTIONS: { key: Filter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'menipis', label: 'Stok menipis' },
  { key: 'nonaktif', label: 'Nonaktif' },
];

// Module-level so each row's `actions` array keeps the same identity between
// renders and `RecordRow`'s `memo` holds. Archiving is reversible - it flips
// `is_aktif`, the only removal the contract offers - so it is a safe swipe with
// an undo behind it rather than a `danger` action behind a confirmation.
const ACTIONS_AKTIF: RecordAction[] = [
  { key: 'ubah', label: 'Ubah produk' },
  { key: 'arsip', label: 'Arsipkan', quick: true },
];
const ACTIONS_NONAKTIF: RecordAction[] = [
  { key: 'ubah', label: 'Ubah produk' },
  { key: 'aktifkan', label: 'Aktifkan', quick: true },
];
const ACTIONS_READONLY: RecordAction[] = [];

export default function ProdukListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('semua');
  /** Rows for the "Stok menipis" chip, which answers a different shape. */
  const [lowRows, setLowRows] = useState<StokMinimumRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [undo, setUndo] = useState<{ message: string; revert: () => Promise<void> } | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const canWrite = useCanWrite('produk');

  // The toast here only ever reports a write that failed from this screen -
  // every success is worded by whichever screen did the writing - so a state
  // and a timeout is the whole mechanism.
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // ---- list ----

  /**
   * One page from whichever endpoint the active chip means. The reorder list is
   * its own endpoint and takes no `search`, so the search field is disabled
   * while that chip is on rather than quietly ignoring what is typed into it.
   */
  const fetchPage = useCallback(
    async (p: number) => {
      if (filter === 'menipis') {
        const result = await listStokMinimum({ page: p, size: PAGE_SIZE });
        return { low: result.data, rows: [] as ProductRow[], paging: result.paging };
      }
      const result = await listProducts({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        is_aktif: filter === 'nonaktif' ? false : undefined,
      });
      return { low: [] as StokMinimumRow[], rows: result.data, paging: result.paging };
    },
    [filter, search]
  );

  const reloadList = useCallback(async () => {
    setListLoading(true);
    setMoreErr('');
    try {
      const r = await fetchPage(1);
      setRows(r.rows);
      setLowRows(r.low);
      setPage(1);
      setHasMore(Math.max(1, r.paging.total_page ?? 1) > 1);
      setListErr('');
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar produk.'));
      setRows([]);
      setLowRows([]);
      setHasMore(false);
    } finally {
      setListLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  /**
   * What the detail and the create form did while this screen sat underneath
   * them. A saved product is patched in place - the reader comes back to the
   * same offset with the new name already on the row - while a created one has
   * no row to patch and no defensible position to invent, so page one is read
   * again.
   */
  useRecordBus(produkBus, (change) => {
    if (change.kind === 'reload') {
      reloadList();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
    // The reorder chip is a different endpoint with figures this screen cannot
    // recompute: `selisih` is the server's, it is what the list is sorted by,
    // and a raised `stok_minimum` can change which products belong on it at
    // all. So only the two fields that cannot lie are patched, and archiving -
    // which the endpoint answers `is_aktif` products only - drops the row.
    setLowRows((list) =>
      saved.aktif
        ? list.map((r) => (r.id === saved.id ? { ...r, nama: saved.nama, kode: saved.kode } : r))
        : list.filter((r) => r.id !== saved.id)
    );
  });

  /**
   * `onEndReached` fires more than once per approach, so the in-flight flag is
   * the guard, not the threshold. A page that failed stops the loop until the
   * reader asks again - otherwise every scroll nudge retries a broken request.
   */
  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || listLoading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const r = await fetchPage(next);
        // The contract pages by offset, not cursor: a product created while the
        // reader is scrolling shifts the window, and the same row can arrive
        // twice. Merging by id keeps that from becoming a duplicate-key render.
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...r.rows.filter((x) => !seen.has(x.id))];
        });
        setLowRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...r.low.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, r.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, listLoading, hasMore, moreErr, page, fetchPage]
  );

  const retryMore = useCallback(() => {
    setMoreErr('');
    loadMore(true);
  }, [loadMore]);

  // Searching is server-side now, so the field is debounced rather than
  // filtering an array that is only ever one page deep.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // ---- list rows and their actions ----

  /**
   * The two sources answer different shapes, so both are flattened to what the
   * list actually draws. Building it here keeps `RecordList` unaware of what a
   * product is, and the memo keeps each row's `actions` array stable.
   */
  const items = useMemo<RecordItem[]>(() => {
    if (filter === 'menipis') {
      return lowRows.map((r) => ({
        id: r.id,
        title: r.nama,
        meta: `${r.kode || 'tanpa kode'} · kurang ${formatNumber(r.selisih)}`,
        fields: [
          { label: 'Stok', value: formatNumber(r.totalStok), danger: true, width: 110 },
          { label: 'Minimum', value: formatNumber(r.stokMin), width: 110 },
        ],
        // The endpoint answers only active products, so the archive direction
        // is the only one that applies here.
        actions: canWrite ? ACTIONS_AKTIF : ACTIONS_READONLY,
      }));
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.nama,
      badge: r.aktif ? undefined : 'Nonaktif',
      dimmed: !r.aktif,
      meta: `${r.kode} · diperbarui ${formatTanggal(r.updatedAt)}`,
      fields: [
        {
          label: 'Stok minimum',
          value: `${formatNumber(r.stokMin)} ${r.namaSatuanDasar}`,
          width: 150,
        },
      ],
      actions: !canWrite ? ACTIONS_READONLY : r.aktif ? ACTIONS_AKTIF : ACTIONS_NONAKTIF,
    }));
  }, [filter, lowRows, rows, canWrite]);

  const bulkActions = useMemo<RecordAction[]>(() => {
    if (!canWrite) return ACTIONS_READONLY;
    return filter === 'nonaktif'
      ? [{ key: 'aktifkan', label: 'Aktifkan' }]
      : [{ key: 'arsip', label: 'Arsipkan' }];
  }, [canWrite, filter]);

  /**
   * Runs first and offers to undo, rather than asking first. Flipping
   * `is_aktif` is the only removal the contract has - there is no
   * `DELETE /product` - so nothing here is unrecoverable, and a confirmation
   * dialog on every archive would cost more taps than the rare undo saves.
   */
  const setAktif = useCallback(
    async (ids: number[], aktif: boolean, label: string) => {
      try {
        await Promise.all(ids.map((id) => updateProduct(id, { is_aktif: aktif })));
      } catch (e) {
        setToastMsg(messageOf(e, 'Gagal mengubah status produk.'));
        reloadList();
        return;
      }
      setRows((list) => list.map((r) => (ids.includes(r.id) ? { ...r, aktif } : r)));
      // An archived product leaves the reorder list; the endpoint only answers
      // active ones.
      if (!aktif) setLowRows((list) => list.filter((r) => !ids.includes(r.id)));
      setUndo({
        message: `${label} ${aktif ? 'diaktifkan' : 'diarsipkan'}`,
        revert: async () => {
          await Promise.all(ids.map((id) => updateProduct(id, { is_aktif: !aktif })));
          reloadList();
        },
      });
    },
    [reloadList]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/produk/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/produk/baru');
  }, [router]);

  const runRowAction = useCallback(
    (key: string, item: RecordItem) => {
      if (key === 'ubah') {
        // The edit form lives on the detail route, the only place that holds a
        // whole product: a reorder-list row is not a `ProductRow` and would
        // half-fill the form from what that list happens to carry. `ubah=1` is
        // what opens the dialog there - a URL meaning "this product, with its
        // form open".
        router.push({ pathname: '/produk/[id]', params: { id: item.id, ubah: '1' } });
        return;
      }
      if (key === 'arsip' || key === 'aktifkan') {
        setAktif([item.id], key === 'aktifkan', item.title);
      }
    },
    [router, setAktif]
  );

  const runBulkAction = useCallback(
    (key: string, ids: number[]) => {
      setAktif(ids, key === 'aktifkan', `${ids.length} produk`);
    },
    [setAktif]
  );

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FILTER_KEY)
      .then((saved) => {
        if (!alive) return;
        if (saved === 'menipis' || saved === 'nonaktif') setFilter(saved);
      })
      .catch(() => {
        // A missing preference is not an error; 'semua' is the right default.
      });
    return () => {
      alive = false;
    };
  }, []);

  const pickFilter = useCallback((k: Filter) => {
    setFilter(k);
    AsyncStorage.setItem(FILTER_KEY, k).catch(() => {});
    // The reorder endpoint takes no `search`, so leaving a query sitting in the
    // now-disabled field would show text that no longer does anything.
    if (k === 'menipis') setQuery('');
  }, []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setFilter('semua');
    AsyncStorage.setItem(FILTER_KEY, 'semua').catch(() => {});
  }, []);

  const forgetUndo = useCallback(() => setUndo(null), []);

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const undoLast = useCallback(() => {
    const pending = undo;
    setUndo(null);
    pending?.revert().catch(() => setToastMsg('Gagal membatalkan.'));
  }, [undo]);

  return (
    <AppShell title="Master Produk">
      <View style={styles.listWrap}>
        <RecordList
          items={items}
          loading={listLoading}
          error={listErr}
          filtered={search !== '' || filter !== 'semua'}
          bulkActions={bulkActions}
          onOpen={openDetail}
          onAction={runRowAction}
          onBulkAction={runBulkAction}
          onRetry={reloadList}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Produk baru"
          emptyTitle="Belum ada produk"
          emptySub="Master produk masih kosong. Tambahkan produk pertama untuk mulai mencatat stok dan harga."
          header={
            <View style={styles.listHeader}>
              {/* The search field has the width to itself. It is the control
                  that gets used on every visit; the count was decoration and
                  creating a product moved into the list as its first row. */}
              <View style={styles.searchWrap}>
                <View style={styles.searchIcon} />
                <View style={styles.searchIconHandle} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  editable={filter !== 'menipis'}
                  placeholder={
                    filter === 'menipis'
                      ? 'Pencarian tidak berlaku di daftar stok menipis'
                      : 'Cari nama atau kode barang'
                  }
                  style={[styles.searchInput, filter === 'menipis' && styles.searchInputOff]}
                />
              </View>
              <FilterPills options={FILTER_OPTIONS} active={filter} onPick={pickFilter} />
            </View>
          }
          leadRow={
            canWrite ? (
              <Pressable onPress={openNew} style={styles.newRow}>
                <View style={styles.newRowPlus}>
                  <Text style={styles.newRowPlusText}>+</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newRowTitle}>Produk baru</Text>
                  <Text style={styles.newRowSub}>Tambahkan barang ke master produk</Text>
                </View>
              </Pressable>
            ) : null
          }
          onEndReached={onEndReached}
          loadingMore={loadingMore}
          moreError={moreErr}
          onRetryMore={retryMore}
        />
        <UndoBar message={undo?.message ?? null} onUndo={undoLast} onExpire={forgetUndo} />
      </View>
      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  // Search and chips sit inside the list card and never scroll away with
  // the rows - on a long list they are the only way back out.
  listHeader: { gap: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight, padding: 14 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: {
    position: 'absolute',
    left: 13,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.muted,
    zIndex: 1,
  },
  searchIconHandle: {
    position: 'absolute',
    left: 24,
    top: 25,
    width: 8,
    height: 2,
    backgroundColor: C.muted,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  searchInput: {
    minHeight: 52,
    paddingLeft: 42,
    paddingRight: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    fontSize: 16.5,
    color: C.text,
  },
  searchInputOff: { backgroundColor: C.tableHeaderBg, color: C.muted2 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
    backgroundColor: C.tableHeaderBg,
  },
  newRowPlus: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRowPlusText: { fontSize: 19, lineHeight: 22, fontWeight: '600', color: '#fff' },
  newRowTitle: { fontSize: 15.5, fontWeight: '600', color: C.primaryDark },
  newRowSub: { marginTop: 2, fontSize: 13, color: C.muted3 },
});
