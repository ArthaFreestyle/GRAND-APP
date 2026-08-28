/**
 * Pelanggan — the list.
 *
 * Opening a customer and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its page, its search, and its scroll while either is on top of
 * it. Edits made up there arrive over `pelangganBus`.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  DataTable,
  EmptyState,
  GhostButton,
  NeutralBadge,
  PagingBar,
  PrimaryButton,
  SearchBar,
} from '@/components/shell/ui';
import { Colors as C, rpShort } from '@/constants/theme-erp';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { listPelanggan, pelangganBus, type Pelanggan } from '@/services/pelanggan';
import { useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;

function plafonLabel(p: string | null): string {
  if (p === null) return 'tanpa batas';
  const n = decimalToNumber(p);
  return n === 0 ? 'tunai saja' : `limit ${rpShort(n)}`;
}

export default function PelangganListScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<Pelanggan[]>([]);
  const [totalItem, setTotalItem] = useState(0);
  const [totalPage, setTotalPage] = useState(1);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('pelanggan');

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await listPelanggan({ page, size: PAGE_SIZE, search: search || undefined });
      setRows(result.data);
      setTotalItem(result.paging.total_item ?? result.data.length);
      setTotalPage(Math.max(1, result.paging.total_page ?? 1));
      setListErr('');
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar pelanggan.'));
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [page, search]);

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
  // them. A saved customer is patched into the page already on screen; a new one
  // could be on any page of a list this screen does not sort, so it re-reads.
  useRecordBus(pelangganBus, (change) => {
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
    <AppShell title="Pelanggan">
      <View style={styles.listWrap}>
        <View style={styles.toolbar}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Cari nama atau kode pelanggan" />
          <View style={{ flex: 1 }} />
          <Text style={styles.countLabel}>{totalItem} pelanggan</Text>
          {canWrite && (
            <PrimaryButton label="Pelanggan baru" onPress={() => router.push('/pelanggan/baru')} />
          )}
        </View>

        <DataTable
          minWidth={720}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 180 }]}>NPWP</Text>
              <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>PLAFON KREDIT</Text>
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
                onPress={() => router.push({ pathname: '/pelanggan/[id]', params: { id: r.id } })}
                style={styles.rowMain}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Text style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>
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
                <View style={{ width: 150, alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: r.plafon === null ? C.muted : C.text,
                    }}>
                    {plafonLabel(r.plafon)}
                  </Text>
                </View>
              </Pressable>
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                {/* The form lives on the detail route; `ubah=1` is a URL that
                    means "this customer, with its form open". */}
                {canWrite && (
                  <GhostButton
                    label="Ubah"
                    onPress={() =>
                      router.push({ pathname: '/pelanggan/[id]', params: { id: r.id, ubah: '1' } })
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
              title="Tidak ada pelanggan yang cocok"
              sub="Pencarian mencocokkan sebagian kode atau nama pelanggan."
            />
          )}
        </DataTable>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 18,
    paddingRight: 34,
    paddingVertical: 11,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 34,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  namaText: { fontSize: 15.5, fontWeight: '600' },
  metaText: { fontSize: 13, color: C.muted2 },
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
});
