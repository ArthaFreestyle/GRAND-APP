/**
 * Penjualan — the list of sales notes.
 *
 * The note detail and the entry form are routes (`[id]` and `baru`), so this
 * screen keeps its search, its filter, and its page while either is on top; the
 * seeded dataset both of them write to lives in `stores/penjualan.ts`.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  Badge,
  DataTable,
  EmptyState,
  FilterPills,
  PagingBar,
  PrimaryButton,
  SearchBar,
  StatTile,
} from '@/components/shell/ui';
import { Colors as C, rp, rpShort, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import { cust, jatuhOf, penjualanStore, statusOf, TODAY, totalOf } from '@/stores/penjualan';

const PAGE_SIZE = 8;

const STATUS_OPTIONS = [
  { key: 'semua' as const, label: 'Semua' },
  { key: 'belum' as const, label: 'Belum lunas' },
  { key: 'lunas' as const, label: 'Lunas' },
];

export default function PenjualanListScreen() {
  const router = useRouter();
  const nota = useLocalStore(penjualanStore);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'semua' | 'belum' | 'lunas'>('semua');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('penjualan');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nota
      .filter((f) => {
        const sisa = totalOf(f) - f.dibayar;
        if (status === 'belum' && sisa <= 0) return false;
        if (status === 'lunas' && sisa > 0) return false;
        if (!q) return true;
        const c = cust(f.custId);
        return f.no.toLowerCase().includes(q) || (c ? c.nama.toLowerCase().includes(q) : false);
      })
      .slice()
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));
  }, [nota, query, status]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openList = nota.filter((f) => totalOf(f) - f.dibayar > 0);
  const overdueList = openList.filter((f) => {
    const j = jatuhOf(f);
    return j && j < TODAY;
  });
  const sumPiutang = openList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumOverdue = overdueList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumTotal = nota.reduce((a, f) => a + totalOf(f), 0);

  return (
    <AppShell title="Penjualan">
      <View style={styles.wrap}>
        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(1);
            }}
            placeholder="Cari nomor nota atau pelanggan"
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
          <Text style={styles.countLabel}>{filtered.length} nota</Text>
          {canWrite && <PrimaryButton label="Nota baru" onPress={() => router.push('/penjualan/baru')} />}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile
            label="Total piutang berjalan"
            value={rp(sumPiutang)}
            valueClass="text-danger"
            sub={`${openList.length} nota belum lunas`}
          />
          <StatTile
            label="Jatuh tempo terlewat"
            value={rp(sumOverdue)}
            valueClass={sumOverdue > 0 ? C.red : C.text}
            sub={`${overdueList.length} nota lewat tempo`}
          />
          <StatTile label="Nilai penjualan tercatat" value={rp(sumTotal)} sub={`${nota.length} nota`} />
        </View>

        <DataTable
          minWidth={640}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>PELANGGAN & NOTA</Text>
              <Text style={[styles.thText, { width: 150 }]}>STATUS</Text>
              <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>TOTAL / SISA</Text>
            </View>
          }
          footer={
            <PagingBar
              label={
                filtered.length
                  ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} dari ${filtered.length} · halaman ${currentPage}/${totalPage}`
                  : '0 hasil'
              }
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
            />
          }>
          {slice.map((f) => {
            const total = totalOf(f);
            const sisa = total - f.dibayar;
            const st = statusOf(f);
            const c = cust(f.custId);
            return (
              <Pressable
                key={f.id}
                onPress={() => router.push({ pathname: '/penjualan/[id]', params: { id: f.id } })}
                style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={styles.namaText} numberOfLines={1}>
                    {c ? c.nama : '—'}
                  </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {f.no} · {tanggal(f.tanggal)} · {f.items.length} item
                  </Text>
                </View>
                <View style={{ width: 150 }}>
                  <Badge label={st.label} tone={st.tone} small />
                </View>
                <View style={{ width: 150, alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{rp(total)}</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: sisa > 0 ? (st.key === 'telat' ? C.red : C.amber) : C.green,
                    }}>
                    {sisa > 0 ? `sisa ${rpShort(sisa)}` : 'lunas'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {slice.length === 0 && (
            <EmptyState
              title="Tidak ada nota yang cocok"
              sub="Coba kata kunci lain atau ubah filter status."
            />
          )}
        </DataTable>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 36,
    height: 48,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 36,
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
});
