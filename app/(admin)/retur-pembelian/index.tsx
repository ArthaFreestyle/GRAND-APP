/**
 * Retur pembelian — the list of goods sent back to suppliers.
 *
 * Search, the status filter, and paging are server-side: `GET /retur-pembelian`
 * takes `page`, `size`, `search`, `status`, `id_pembelian`, `id_supplier`, and a
 * date range. `search` matches this document's number **or** the source
 * invoice's, which is the number written on the paper the goods travel with.
 *
 * **Two amounts, and the row prints the one that is knowable.** `total` is the
 * inventory value leaving, at the harga pokok the invoice fixed. `nilai_kredit_
 * utang` is what the supplier actually credits — a smaller number, because harga
 * pokok carries a share of the freight paid to the carrier, and crediting that
 * would hand the supplier money they never received. It is zero until the
 * document is POSTED, so it is printed **only** once it means something: a
 * column reading Rp 0 on every draft is a column that says nothing.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { DOKUMEN_META } from '@/components/shell/status-dokumen';
import {
  ListHeader,
  ListSearch,
  NewRecordRow,
  RecordList,
  type RecordItem,
} from '@/components/shell/record-list';
import { FilterPills } from '@/components/shell/ui';
import { rp, tanggal } from '@/constants/theme-erp';
import { useRecordBus } from '@/hooks/use-record-bus';
import type { StatusAlur } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { useCanWrite } from '@/services/permissions';
import { listRetur, returBus, type ReturRow } from '@/services/retur-pembelian';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusAlur;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'DIAJUKAN', label: 'Diajukan' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

export default function ReturPembelianListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<ReturRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('retur-pembelian');

  const fetchPage = useCallback(
    (p: number) =>
      listRetur({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        status: status === 'semua' ? undefined : status,
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
      setListErr(messageOf(e, 'Gagal memuat daftar retur pembelian.'));
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

  // What the detail did while this screen sat underneath it. A row left visible
  // under a chip it no longer matches is deliberate: silently vanishing the
  // record somebody just acted on reads as a bug, and the next reload settles it.
  useRecordBus(returBus, (change) => {
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
        // Offset paging, no cursor: a document posted while the reader scrolls
        // shifts the window and the same row can arrive twice.
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
      rows.map((r) => {
        const kredit = decimalToNumber(r.nilaiKreditUtang);
        return {
          id: r.id,
          title: r.namaSupplier || '—',
          badge: DOKUMEN_META[r.status].label,
          badgeTone: DOKUMEN_META[r.status].tone,
          meta: `${r.nomor} · ${tanggal(r.tanggal)} · atas ${r.nomorPembelian}`,
          fields: [
            { label: 'Nilai barang', value: rp(decimalToNumber(r.total)), width: 140 },
            // Frozen at posting; zero before it. Printing it on a draft would be
            // a rupiah figure that only looks like an answer.
            ...(kredit > 0 ? [{ label: 'Kredit utang', value: rp(kredit), width: 140 }] : []),
          ],
        };
      }),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/retur-pembelian/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/retur-pembelian/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
  }, []);

  return (
    <AppShell title="Retur Pembelian">
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
          createLabel="Retur baru"
          emptyTitle="Belum ada retur pembelian"
          emptySub="Dokumen ini dibuat atas faktur pembelian yang sudah diposting, sebatas barang yang benar-benar datang."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor dokumen atau nomor faktur asal"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
            </ListHeader>
          }
          leadRow={canWrite ? <NewRecordRow title="Retur baru" onPress={openNew} /> : null}
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
