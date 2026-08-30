/**
 * Supplier — the list.
 *
 * Search, the status chips, and paging are all server-side: `GET /supplier`
 * takes `page`, `size`, `search`, and `is_aktif`, so a chip filters the whole
 * table rather than the rows that happen to be in memory.
 *
 * Opening a supplier and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its rows, its appended pages, and its scroll while either is on
 * top of it. Edits made up there arrive over `supplierBus`.
 *
 * There is no HUTANG column, and there was none in the table either. `GET
 * /supplier` carries no balance — kode, nama, telepon, alamat, npwp, is_aktif
 * and audit columns, nothing else — so a column would mean one
 * `GET /supplier/{id}/utang` per visible row, the same N+1 the contract warns
 * about for product stock. The balance is on the detail, where one supplier is
 * one call.
 *
 * The table itself is gone: 760pt of fixed columns on a 354pt phone meant NPWP
 * and the address sat off the right edge. `RecordList` stacks them instead, and
 * the paging buttons became a scroll.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  ListHeader,
  ListSearch,
  NewRecordRow,
  RecordList,
  type RecordItem,
} from '@/components/shell/record-list';
import { FilterPills } from '@/components/shell/ui';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listSupplier, supplierBus, type Supplier } from '@/services/supplier';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | 'aktif' | 'nonaktif';

/**
 * `tipe` has no column in the contract, while `is_aktif` is a real query
 * parameter — so this is the one filter the server can honour.
 */
const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'nonaktif', label: 'Nonaktif' },
];

const IS_AKTIF: Record<StatusFilter, boolean | undefined> = {
  semua: undefined,
  aktif: true,
  nonaktif: false,
};

export default function SupplierListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<Supplier[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('supplier');

  const fetchPage = useCallback(
    (p: number) =>
      listSupplier({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        is_aktif: IS_AKTIF[status],
      }),
    [search, status]
  );

  const reloadList = useCallback(async () => {
    setListLoading(true);
    setMoreErr('');
    try {
      const result = await fetchPage(1);
      setRows(result.data);
      setPage(1);
      setHasMore(Math.max(1, result.paging.total_page ?? 1) > 1);
      setListErr('');
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar supplier.'));
      setRows([]);
      setHasMore(false);
    } finally {
      setListLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // What the detail and the create form did while this screen sat underneath
  // them. A saved supplier is patched into the rows already on screen; a new one
  // could be anywhere in a list this screen does not sort, so it re-reads.
  //
  // A patch can leave a row that no longer belongs under the active chip — a
  // supplier deactivated from the detail while "Aktif" is selected. It is left
  // visible on purpose: silently vanishing the record someone just edited reads
  // as a bug, and the next reload settles it honestly.
  useRecordBus(supplierBus, (change) => {
    if (change.kind === 'reload') {
      reloadList();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || listLoading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const result = await fetchPage(next);
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...result.data.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, result.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, listLoading, hasMore, moreErr, page, fetchPage]
  );

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const retryMore = useCallback(() => {
    setMoreErr('');
    loadMore(true);
  }, [loadMore]);

  const items = useMemo<RecordItem[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        title: r.nama,
        badge: r.aktif ? undefined : 'Nonaktif',
        dimmed: !r.aktif,
        meta: `${r.kode || 'tanpa kode'} · ${r.telepon || '—'}`,
        // Nothing. The name, the code and the phone number are what a supplier
        // is looked up by; NPWP and the address are what you read once you have
        // found it, and both are on the detail. An address in a row is also the
        // one value long enough to wrap and make every row a different height.
        fields: [],
      })),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/supplier/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/supplier/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
  }, []);

  return (
    <AppShell title="Supplier">
      <View style={styles.listWrap}>
        <RecordList
          items={items}
          loading={listLoading}
          error={listErr}
          filtered={search !== '' || status !== 'semua'}
          onOpen={openDetail}
          onRetry={reloadList}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Supplier baru"
          emptyTitle="Belum ada supplier"
          emptySub="Daftar supplier masih kosong. Tambahkan yang pertama untuk mulai mencatat faktur pembelian."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nama atau kode supplier"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Supplier baru" onPress={openNew} />
            ) : null
          }
          onEndReached={onEndReached}
          loadingMore={loadingMore}
          moreError={moreErr}
          onRetryMore={retryMore}
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
});
