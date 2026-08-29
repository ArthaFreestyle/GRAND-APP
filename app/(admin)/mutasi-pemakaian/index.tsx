/**
 * Mutasi & Pemakaian — the list of stock documents.
 *
 * The document detail and the entry form are routes (`[id]` and `baru`), so
 * this screen keeps its search, its filter, and its page while either is on
 * top; the seeded dataset both of them write to lives in `stores/mutasi.ts`.
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
  KpiCard,
  PagingBar,
  PrimaryButton,
  SearchBar,
} from '@/components/shell/ui';
import { Colors as C, num, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  jenisMeta,
  mutasiStore,
  ruangNama,
  statusMeta,
  totalQty,
  unitNama,
  type Jenis,
} from '@/stores/mutasi';

const PAGE_SIZE = 8;

const JENIS_OPTIONS = [
  { key: 'semua' as const, label: 'Semua' },
  { key: 'mutasi' as const, label: 'Mutasi' },
  { key: 'pemakaian' as const, label: 'Pemakaian' },
];

export default function MutasiListScreen() {
  const router = useRouter();
  const trx = useLocalStore(mutasiStore);

  const [query, setQuery] = useState('');
  const [jenisFilter, setJenisFilter] = useState<'semua' | Jenis>('semua');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('mutasi');

  const mutasiCount = trx.filter((t) => t.jenis === 'mutasi').length;
  const pemakaianCount = trx.filter((t) => t.jenis === 'pemakaian').length;
  const transitCount = trx.filter((t) => t.jenis === 'mutasi' && t.status === 'transit').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trx
      .filter((t) => {
        if (jenisFilter !== 'semua' && t.jenis !== jenisFilter) return false;
        if (!q) return true;
        const tuj = t.jenis === 'mutasi' ? ruangNama(t.ke ?? 0) : unitNama(t.unit ?? 0);
        return (
          t.no.toLowerCase().includes(q) ||
          ruangNama(t.dari).toLowerCase().includes(q) ||
          tuj.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));
  }, [trx, query, jenisFilter]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <AppShell title="Mutasi & Pemakaian">
      <View style={styles.wrap}>
        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(1);
            }}
            placeholder="Cari nomor, ruang, atau unit"
          />
          <FilterPills
            options={JENIS_OPTIONS}
            active={jenisFilter}
            onPick={(k) => {
              setJenisFilter(k);
              setPage(1);
            }}
          />
          <View style={{ flex: 1 }} />
          <Text style={styles.countLabel}>{filtered.length} transaksi</Text>
          {canWrite && (
            <PrimaryButton
              label="Transaksi baru"
              onPress={() => router.push('/mutasi-pemakaian/baru')}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard label="Mutasi antar ruang" value={num(mutasiCount)} sub="transaksi tercatat" />
          <KpiCard label="Pemakaian internal" value={num(pemakaianCount)} sub="transaksi tercatat" />
          <KpiCard
            label="Mutasi dalam perjalanan"
            value={num(transitCount)}
            valueClass={transitCount > 0 ? C.amber : C.text}
            sub="menunggu diterima"
          />
        </View>

        <DataTable
          minWidth={660}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>RUTE & DOKUMEN</Text>
              <Text style={[styles.thText, { width: 176 }]}>STATUS</Text>
              <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>ITEM</Text>
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
          {slice.map((t) => {
            const jm = jenisMeta(t.jenis);
            const st = statusMeta(t);
            const rute =
              t.jenis === 'mutasi'
                ? `${ruangNama(t.dari)} → ${ruangNama(t.ke ?? 0)}`
                : `${ruangNama(t.dari)} → ${unitNama(t.unit ?? 0)}`;
            return (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/mutasi-pemakaian/[id]', params: { id: t.id } })}
                style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Badge label={jm.label} tone={jm.tone} small />
                    <Text style={styles.namaText} numberOfLines={1}>
                      {rute}
                    </Text>
                  </View>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {t.no} · {tanggal(t.tanggal)}
                  </Text>
                </View>
                <View style={{ width: 176 }}>
                  <Badge label={st.label} tone={st.tone} small />
                </View>
                <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{t.items.length} item</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>{num(totalQty(t))} unit</Text>
                </View>
              </Pressable>
            );
          })}
          {slice.length === 0 && (
            <EmptyState
              title="Tidak ada transaksi yang cocok"
              sub="Coba kata kunci lain atau ubah filter jenis."
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
  namaText: { fontSize: 16.5, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
});
