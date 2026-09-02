/**
 * Penjualan — the list of sales notes.
 *
 * Search, both filters, and paging are server-side: `GET /penjualan` takes
 * `page`, `size`, `search`, `status`, `status_pembayaran`, `jenis_pembayaran`,
 * `id_ruang`, `id_pelanggan`, and a date range. `search` matches the **document
 * number only** — not the customer's name, which the old in-memory filter did
 * match and this one honestly cannot.
 *
 * **The chips are the document's own status.** They used to read
 * "lunas / belum lunas", computed from a `dibayar` column the contract does not
 * have: money in is `/penerimaan-pembayaran`, a separate document group with its
 * own allocations, its own posting, and giro that only settles a receivable when
 * it clears. What a nota knows about payment is the server-side
 * `status_pembayaran` cache, which rides along as a field.
 *
 * **The three KPI tiles are gone.** "Total piutang berjalan" summed the whole
 * seeded dataset; a paged endpoint hands over twenty rows and a count, and
 * summing those would put a confident rupiah figure on screen that means the
 * page rather than the books. `GET /pelanggan/{id}/piutang` has the real
 * balance, one customer at a time, and the nota detail reads it.
 *
 * "Jatuh tempo terlewat" is gone for a second reason on top of that: nothing in
 * the contract falls due. `tempo` is not a column on `Pelanggan`, so the old
 * chips were computing a date the server would never agree with.
 *
 * Opening a note and creating one are routes (`[id]` and `baru`), so this screen
 * keeps its rows, its pages, and its scroll while either is on top of it. What
 * happens up there arrives over `penjualanBus`.
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
import { BAYAR_META, DOKUMEN_META } from '@/components/shell/status-dokumen';
import { FilterPills } from '@/components/shell/ui';
import { rp, tanggal } from '@/constants/theme-erp';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import {
  listPenjualan,
  penjualanBus,
  type PenjualanRow,
  type StatusDokumen,
  type StatusPembayaran,
} from '@/services/penjualan';
import { useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusDokumen;
type BayarFilter = 'semua' | StatusPembayaran;

/** Three, not four — a nota is never `DIAJUKAN`; the endpoint does not exist. */
const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

/**
 * The collection queue. `BELUM` and `SEBAGIAN` are the notes with money still
 * outstanding — the reason anybody opens this list on a Monday morning.
 */
const BAYAR_OPTIONS: { key: BayarFilter; label: string }[] = [
  { key: 'semua', label: 'Semua pembayaran' },
  { key: 'BELUM', label: 'Belum dibayar' },
  { key: 'SEBAGIAN', label: 'Sebagian' },
  { key: 'LUNAS', label: 'Lunas' },
];

export default function PenjualanListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<PenjualanRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [bayar, setBayar] = useState<BayarFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const canWrite = useCanWrite('penjualan');

  const fetchPage = useCallback(
    (p: number) =>
      listPenjualan({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        status: status === 'semua' ? undefined : status,
        statusPembayaran: bayar === 'semua' ? undefined : bayar,
      }),
    [search, status, bayar]
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
      setListErr(messageOf(e, 'Gagal memuat daftar penjualan.'));
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
  // cancelled nota is patched into the rows already on screen; a new one could
  // be anywhere in a list sorted by date, so it re-reads.
  //
  // A patch can leave a row that no longer belongs under the active chip — a
  // draft posted while "Draft" is selected. It is left visible on purpose:
  // silently vanishing the record someone just acted on reads as a bug, and the
  // next reload settles it honestly.
  useRecordBus(penjualanBus, (change) => {
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
        // Offset paging, no cursor: a nota posted while the reader is scrolling
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
   * The customer is the title, because that is what anybody chasing a note
   * remembers — except that half of these notes have no customer at all, and a
   * blank title on a cash sale is worse than naming it for what it is.
   *
   * The payment field is printed **only where it varies**. A DRAFT has not
   * charged anybody anything, and a POSTED cash note is `LUNAS` by definition —
   * the money was taken at the counter. Printing "Lunas" on nine rows out of ten
   * buries the one credit note that says "Belum dibayar", which is the only row
   * on this screen anybody has to act on.
   */
  const items = useMemo<RecordItem[]>(
    () =>
      rows.map((r) => {
        const bayarBerarti = r.status === 'POSTED' && r.jenis === 'KREDIT';
        return {
          id: r.id,
          title: r.namaPelanggan || 'Tunai di meja',
          badge: DOKUMEN_META[r.status].label,
          badgeTone: DOKUMEN_META[r.status].tone,
          meta: `${r.nomor} · ${tanggal(r.tanggal)}${r.jenis === 'KREDIT' ? ' · kredit' : ''}`,
          fields: [
            ...(bayarBerarti
              ? [
                  {
                    label: 'Pembayaran',
                    value: BAYAR_META[r.statusBayar].label,
                    danger: r.statusBayar !== 'LUNAS',
                    width: 150,
                  },
                ]
              : []),
            { label: 'Total', value: rp(decimalToNumber(r.total)), width: 140 },
          ],
        };
      }),
    [rows]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/penjualan/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/penjualan/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);
  const pickBayar = useCallback((k: BayarFilter) => setBayar(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
    setBayar('semua');
  }, []);

  return (
    <AppShell title="Penjualan">
      <View style={styles.listWrap}>
        <RecordList
          items={items}
          loading={listLoading}
          error={listErr}
          filtered={search !== '' || status !== 'semua' || bayar !== 'semua'}
          onOpen={openDetail}
          onRetry={reloadList}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Nota baru"
          emptyTitle="Belum ada nota penjualan"
          emptySub="Nota yang dibuat di unit kerja sesi ini — dari layar ini maupun dari kasir — akan terdaftar di sini."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor nota"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
              <FilterPills options={BAYAR_OPTIONS} active={bayar} onPick={pickBayar} />
            </ListHeader>
          }
          leadRow={canWrite ? <NewRecordRow title="Nota baru" onPress={openNew} /> : null}
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
