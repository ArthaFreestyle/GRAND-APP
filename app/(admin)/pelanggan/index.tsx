/**
 * Pelanggan — the list.
 *
 * Opening a customer and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its rows, its appended pages, and its scroll while either is on
 * top of it. Edits made up there arrive over `pelangganBus`.
 *
 * The table is gone. Its columns needed 720pt before the last one was on
 * screen, which a phone in portrait does not have, so NPWP and the credit limit
 * lived off the right edge behind a sideways gesture nobody performs. This is
 * `RecordList` — the same rows the product list draws, stacked on a phone and
 * ranged right on a tablet — and the paging buttons went with it: the endpoint
 * is still paged, the reader just scrolls.
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
import { rpShort } from '@/constants/theme-erp';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { listPelanggan, pelangganBus, type Pelanggan } from '@/services/pelanggan';
import { useCanWrite } from '@/services/permissions';

/** A screenful per round trip, as on the product list. */
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function plafonLabel(p: string | null): string {
  if (p === null) return 'tanpa batas';
  const n = decimalToNumber(p);
  return n === 0 ? 'tunai saja' : `limit ${rpShort(n)}`;
}

export default function PelangganListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<Pelanggan[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('pelanggan');

  const fetchPage = useCallback(
    (p: number) => listPelanggan({ page: p, size: PAGE_SIZE, search: search || undefined }),
    [search]
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
      setListErr(messageOf(e, 'Gagal memuat daftar pelanggan.'));
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
  // them. A saved customer is patched into the rows already on screen; a new one
  // could be anywhere in a list this screen does not sort, so it re-reads.
  useRecordBus(pelangganBus, (change) => {
    if (change.kind === 'reload') {
      reloadList();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
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
        const result = await fetchPage(next);
        // Offset paging, no cursor: a customer created while the reader is
        // scrolling shifts the window and the same row can arrive twice.
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
        // The credit limit alone. It is the one number that changes what you
        // may do with a customer; the NPWP is reference data nobody scans a
        // list for, and it is on the detail.
        fields: [{ label: 'Plafon kredit', value: plafonLabel(r.plafon), width: 150 }],
      })),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/pelanggan/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/pelanggan/baru');
  }, [router]);

  const clearFilter = useCallback(() => setQuery(''), []);

  return (
    <AppShell title="Pelanggan">
      <View style={styles.listWrap}>
        <RecordList
          items={items}
          loading={listLoading}
          error={listErr}
          filtered={search !== ''}
          onOpen={openDetail}
          onRetry={reloadList}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Pelanggan baru"
          emptyTitle="Belum ada pelanggan"
          emptySub="Daftar pelanggan masih kosong. Tambahkan yang pertama untuk mulai mencatat nota dan piutang."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nama atau kode pelanggan"
              />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Pelanggan baru" onPress={openNew} />
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
