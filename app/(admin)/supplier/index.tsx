/**
 * Supplier — the list.
 *
 * Search, the status chips, and paging are all server-side now: `GET /supplier`
 * takes `page`, `size`, `search`, and `is_aktif`, so the count under the chips
 * is the real one rather than a slice of whatever happened to be in memory.
 *
 * Opening a supplier and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its page, its search, and its scroll while either is on top of
 * it. Edits made up there arrive over `supplierBus`.
 *
 * There is no HUTANG column any more. `GET /supplier` carries no balance — kode,
 * nama, telepon, alamat, npwp, is_aktif and audit columns, nothing else — so a
 * column would mean one `GET /supplier/{id}/utang` per visible row, the same N+1
 * the contract warns about for product stock. The balance is on the detail,
 * where one supplier is one call.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  DataTable,
  EmptyState,
  FilterPills,
  GhostButton,
  NeutralBadge,
  PagingBar,
  PrimaryButton,
  SearchBar,
} from '@/components/shell/ui';
import { Colors as C } from '@/constants/theme-erp';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listSupplier, supplierBus, type Supplier } from '@/services/supplier';

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | 'aktif' | 'nonaktif';

/**
 * Replaces the old tipe chips. `tipe` has no column in the contract, while
 * `is_aktif` is a real query parameter — so this is the one filter the server
 * can honour, and it filters the whole table rather than the page on screen.
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
  const [totalItem, setTotalItem] = useState(0);
  const [totalPage, setTotalPage] = useState(1);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('supplier');

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await listSupplier({
        page,
        size: PAGE_SIZE,
        search: search || undefined,
        is_aktif: IS_AKTIF[status],
      });
      setRows(result.data);
      setTotalItem(result.paging.total_item ?? result.data.length);
      setTotalPage(Math.max(1, result.paging.total_page ?? 1));
      setListErr('');
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar supplier.'));
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // What the detail and the create form did while this screen sat underneath
  // them. A saved supplier is patched into the page already on screen; a new one
  // could be on any page of a list this screen does not sort, so it re-reads.
  //
  // A patch can leave a row that no longer belongs under the active chip — a
  // supplier deactivated from the detail while "Aktif" is selected. It is left
  // visible on purpose: silently vanishing the record someone just edited reads
  // as a bug, and the next page turn or reload settles it honestly.
  useRecordBus(supplierBus, (change) => {
    if (change.kind === 'reload') {
      reloadList();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  const pagingLabel = totalItem
    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItem)} dari ${totalItem} · halaman ${page}/${totalPage}`
    : '0 hasil';

  return (
    <AppShell title="Supplier">
      <View style={styles.listWrap}>
        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Cari nama atau kode supplier"
          />
          <FilterPills
            options={STATUS_OPTIONS}
            active={status}
            onPick={(k) => {
              setStatus(k);
              setPage(1);
            }}
          />
          <View style={{ flex: 1 }} />
          <Text style={styles.countLabel}>{totalItem} supplier</Text>
          {canWrite && (
            <PrimaryButton label="Supplier baru" onPress={() => router.push('/supplier/baru')} />
          )}
        </View>

        <DataTable
          minWidth={760}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 180 }]}>NPWP</Text>
              <Text style={[styles.thText, { width: 220 }]}>ALAMAT</Text>
              <View style={{ width: 90 }} />
            </View>
          }
          footer={
            <PagingBar
              label={pagingLabel}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
            />
          }>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Pressable
                onPress={() => router.push({ pathname: '/supplier/[id]', params: { id: r.id } })}
                style={styles.rowMain}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Text
                      style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]}
                      numberOfLines={1}>
                      {r.nama}
                    </Text>
                    {!r.aktif && <NeutralBadge />}
                  </View>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {r.kode || 'tanpa kode'} · {r.telepon || '—'}
                  </Text>
                </View>
                <Text style={{ width: 180, fontSize: 14, color: C.muted3 }} numberOfLines={1}>
                  {r.npwp || '—'}
                </Text>
                <Text style={{ width: 220, fontSize: 14, color: C.muted3 }} numberOfLines={2}>
                  {r.alamat || '—'}
                </Text>
              </Pressable>
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                {/* The form lives on the detail route; `ubah=1` is a URL that
                    means "this supplier, with its form open". */}
                {canWrite && (
                  <GhostButton
                    label="Ubah"
                    onPress={() =>
                      router.push({ pathname: '/supplier/[id]', params: { id: r.id, ubah: '1' } })
                    }
                  />
                )}
              </View>
            </View>
          ))}
          {listLoading && rows.length === 0 && (
            <View style={styles.centerBox}>
              <ActivityIndicator color={C.primary} />
            </View>
          )}
          {!listLoading && listErr !== '' && (
            <View style={styles.centerBox}>
              <Text style={styles.errText}>{listErr}</Text>
              <GhostButton label="Coba lagi" onPress={reloadList} />
            </View>
          )}
          {!listLoading && listErr === '' && rows.length === 0 && (
            <EmptyState
              title="Tidak ada supplier yang cocok"
              sub="Pencarian mencocokkan sebagian kode atau nama supplier — bukan alamat atau NPWP."
            />
          )}
        </DataTable>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 36,
    minHeight: 48,
    paddingVertical: 11,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
    minHeight: 74,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 36,
    paddingVertical: 10,
  },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted },
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
});
