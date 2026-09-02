/**
 * Pembelian — the list of purchase documents.
 *
 * Search, both status filters, and paging are server-side: `GET /pembelian`
 * takes `page`, `size`, `search`, `status`, `status_penerimaan`, `id_supplier`,
 * and a date range. `search` matches the document number **or** the supplier's
 * invoice number — not the supplier's name, which the old in-memory filter did
 * match and this one honestly cannot.
 *
 * **The chips are the document's own status.** They used to read
 * "lunas / belum lunas", computed from a `dibayar` column that the contract does
 * not have: money out is `/pembayaran-utang`, a separate document group with its
 * own allocations and posting. What a pembelian knows about payment is the
 * server-side `status_pembayaran` cache, which rides along as a field.
 *
 * **The three KPI tiles are gone.** "Total hutang berjalan" summed the whole
 * seeded dataset; a paged endpoint hands over twenty rows and a count, and
 * summing those would put a confident rupiah figure on screen that means the
 * page rather than the books. The supplier detail has the real balance, one
 * supplier at a time, from `GET /supplier/{id}/utang`.
 *
 * **The table is gone too.** Four fixed columns wanted 880pt; a phone has ~354.
 * These are `RecordList` rows now, the same ones the product list draws — the
 * document status keeps its tint as the row's badge, and receipt, payment and
 * total stack underneath on a phone instead of hiding off the right edge.
 *
 * Opening a document and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its rows, its pages, and its scroll while either is on top of it.
 * What happens up there arrives over `pembelianBus`.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { BAYAR_META, DOKUMEN_META } from '@/components/shell/status-dokumen';
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
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import {
  listPembelian,
  pembelianBus,
  type PembelianRow,
  type StatusDokumen,
  type StatusPenerimaan,
} from '@/services/pembelian';
import { useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusDokumen;
type TerimaFilter = 'semua' | StatusPenerimaan;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'DIAJUKAN', label: 'Diajukan' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

/**
 * A real query parameter, and the closest thing the contract has to a work
 * queue: `KURANG` is every document still owed goods, which is what a follow-up
 * delivery gets chased from.
 */
const TERIMA_OPTIONS: { key: TerimaFilter; label: string }[] = [
  { key: 'semua', label: 'Semua kiriman' },
  { key: 'KURANG', label: 'Kiriman kurang' },
  { key: 'LENGKAP', label: 'Lengkap' },
];

export default function PembelianListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<PembelianRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [terima, setTerima] = useState<TerimaFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('pembelian');

  const fetchPage = useCallback(
    (p: number) =>
      listPembelian({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        status: status === 'semua' ? undefined : status,
        statusPenerimaan: terima === 'semua' ? undefined : terima,
      }),
    [search, status, terima]
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
      setListErr(messageOf(e, 'Gagal memuat daftar pembelian.'));
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

  // What the detail did while this screen sat underneath it. A posted or
  // cancelled document is patched into the rows already on screen; a new one
  // could be anywhere in a list sorted by date, so it re-reads.
  //
  // A patch can leave a row that no longer belongs under the active chip — a
  // draft submitted while "Draft" is selected. It is left visible on purpose:
  // silently vanishing the record someone just acted on reads as a bug, and the
  // next reload settles it honestly.
  useRecordBus(pembelianBus, (change) => {
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
        // Offset paging, no cursor: a document posted while the reader is
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

  /**
   * The supplier is the title because that is what anyone hunting a paper
   * invoice on a desk actually remembers; the document number and the date are
   * the line under it, along with the supplier's own invoice number when there
   * is one — the other thing that gets matched against paper.
   */
  const items = useMemo<RecordItem[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        title: r.namaSupplier || '—',
        badge: DOKUMEN_META[r.status].label,
        badgeTone: DOKUMEN_META[r.status].tone,
        meta: `${r.nomor} · ${tanggal(r.tanggal)}${
          r.noFakturSupplier ? ` · faktur ${r.noFakturSupplier}` : ''
        }`,
        fields: [
          // Printed only when there is something to chase. "Diterima lengkap"
          // on nine rows out of ten is a column that says nothing, and the one
          // row that matters gets lost in it.
          ...(r.statusTerima === 'KURANG'
            ? [{ label: 'Kiriman', value: 'Kurang', danger: true, width: 110 }]
            : []),
          { label: 'Pembayaran', value: BAYAR_META[r.statusBayar].label, width: 150 },
          { label: 'Total', value: rp(decimalToNumber(r.total)), width: 140 },
        ],
      })),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/pembelian/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/pembelian/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);
  const pickTerima = useCallback((k: TerimaFilter) => setTerima(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
    setTerima('semua');
  }, []);

  return (
    <AppShell title="Pembelian">
      <View style={styles.listWrap}>
        <RecordList
          items={items}
          loading={listLoading}
          error={listErr}
          filtered={search !== '' || status !== 'semua' || terima !== 'semua'}
          onOpen={openDetail}
          onRetry={reloadList}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Faktur baru"
          emptyTitle="Belum ada faktur pembelian"
          emptySub="Dokumen pembelian yang dibuat di unit kerja sesi ini akan terdaftar di sini."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor dokumen atau no. faktur supplier"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
              <FilterPills options={TERIMA_OPTIONS} active={terima} onPick={pickTerima} />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Faktur baru" onPress={openNew} />
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
