/**
 * Penerimaan susulan — the list of follow-up deliveries.
 *
 * Search, the status filter, and paging are server-side: `GET
 * /penerimaan-susulan` takes `page`, `size`, `search`, `status`, `id_pembelian`,
 * and a date range. `search` matches **this** document's number or the source
 * invoice's, which is the one useful property of the pair — a shortfall gets
 * chased by the invoice number written on the delivery note, not by a number
 * this document only received after it was typed.
 *
 * The row carries one amount, and it is not money owed. A susulan adds stock and
 * never adds debt; `totalNilai` is what the late goods are worth going into
 * inventory, at the harga pokok the invoice already fixed. There is no payment
 * status here to print because there is no payment.
 *
 * Creating one from here starts with an empty invoice picker. The other way in —
 * the one that matches how the work actually arrives — is the "Kiriman susulan"
 * button on a pembelian that is still short, which lands on the same form with
 * the invoice already chosen.
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
import { listSusulan, susulanBus, type SusulanRow } from '@/services/penerimaan-susulan';
import { useCanWrite } from '@/services/permissions';

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

export default function PenerimaanSusulanListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<SusulanRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('penerimaan-susulan');

  const fetchPage = useCallback(
    (p: number) =>
      listSusulan({
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
      setListErr(messageOf(e, 'Gagal memuat daftar penerimaan susulan.'));
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
  useRecordBus(susulanBus, (change) => {
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

  /**
   * The supplier is the title, the same as on the invoice list, because it is
   * what anyone holding the delivery note is looking for. The source invoice's
   * number rides in the meta line: this document is a remainder of that one, and
   * on a shelf full of paper that is the number written on everything.
   */
  const items = useMemo<RecordItem[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        title: r.namaSupplier || '—',
        badge: DOKUMEN_META[r.status].label,
        badgeTone: DOKUMEN_META[r.status].tone,
        meta: `${r.nomor} · ${tanggal(r.tanggal)} · atas ${r.nomorPembelian}`,
        fields: [{ label: 'Nilai barang', value: rp(decimalToNumber(r.totalNilai)), width: 150 }],
      })),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/penerimaan-susulan/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/penerimaan-susulan/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
  }, []);

  return (
    <AppShell title="Penerimaan Susulan">
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
          createLabel="Kiriman susulan baru"
          emptyTitle="Belum ada kiriman susulan"
          emptySub="Dokumen ini dibuat atas faktur pembelian yang sudah diposting dan kirimannya masih kurang."
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
          leadRow={canWrite ? <NewRecordRow title="Kiriman susulan baru" onPress={openNew} /> : null}
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
