/**
 * Stok Opname — the list of counting sessions.
 *
 * Both the running count and the posted result are one route (`[id]`), which
 * renders whichever the session's status calls for. This screen keeps its
 * search, filter, and page underneath either.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
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
import { countedItems, opnameStore, ruangNama, varianceItems } from '@/stores/opname';

const PAGE_SIZE = 8;

const STATUS_OPTIONS = [
  { key: 'semua' as const, label: 'Semua' },
  { key: 'draft' as const, label: 'Berjalan' },
  { key: 'selesai' as const, label: 'Selesai' },
];

export default function StokOpnameListScreen() {
  const router = useRouter();
  const sessions = useLocalStore(opnameStore);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'semua' | 'draft' | 'selesai'>('semua');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('opname');

  const berjalanCount = sessions.filter((t) => t.status === 'draft').length;
  const selesaiCount = sessions.filter((t) => t.status === 'selesai').length;
  const selisihCount = sessions
    .filter((t) => t.status === 'selesai')
    .reduce((sum, t) => sum + varianceItems(t.items).length, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((t) => {
        if (status !== 'semua' && t.status !== status) return false;
        if (!q) return true;
        return (
          t.no.toLowerCase().includes(q) ||
          ruangNama(t.ruang).toLowerCase().includes(q) ||
          t.petugas.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
        // Running counts first: they are the ones somebody is still standing in
        // a storeroom with.
        if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
        return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id;
      });
  }, [sessions, query, status]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <AppShell title="Stok Opname">
      <View style={styles.wrap}>
        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(1);
            }}
            placeholder="Cari nomor atau ruang"
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
          <Text style={styles.countLabel}>{filtered.length} opname</Text>
          {canWrite && (
            <PrimaryButton label="Opname baru" onPress={() => router.push('/stok-opname/baru')} />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard
            label="Opname berjalan"
            value={num(berjalanCount)}
            valueClass={berjalanCount > 0 ? C.amber : C.text}
            sub="sedang dihitung"
          />
          <KpiCard label="Opname selesai" value={num(selesaiCount)} sub="sudah terposting" />
          <KpiCard
            label="Selisih ditemukan"
            value={num(selisihCount)}
            valueClass={selisihCount > 0 ? C.amber : C.text}
            sub="item disesuaikan"
          />
        </View>

        <DataTable
          minWidth={660}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>RUANG & DOKUMEN</Text>
              <Text style={[styles.thText, { width: 176 }]}>STATUS</Text>
              <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>HASIL</Text>
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
            const isDraft = t.status === 'draft';
            const countedN = countedItems(t.items).length;
            const nVar = varianceItems(t.items).length;
            return (
              <Pressable
                key={t.id}
                // One address per session; the document route decides between
                // the counting sheet and the posted result from its status.
                onPress={() => router.push({ pathname: '/stok-opname/[id]', params: { id: t.id } })}
                style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={styles.namaText} numberOfLines={1}>
                    {ruangNama(t.ruang)}
                  </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {t.no} · {tanggal(t.tanggal)} · {t.petugas}
                  </Text>
                </View>
                <View style={{ width: 176 }}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isDraft ? C.amberBg : C.greenBg,
                        borderColor: isDraft ? C.amberBorder : C.greenBorder,
                      },
                    ]}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDraft ? C.amber : C.green }}>
                      {isDraft ? 'Berjalan' : 'Selesai'}
                    </Text>
                  </View>
                </View>
                <View style={{ width: 150, alignItems: 'flex-end', gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: isDraft ? C.amber : nVar ? C.amber : C.green,
                    }}>
                    {isDraft ? `${countedN}/${t.items.length}` : nVar ? `${nVar} selisih` : 'cocok'}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>
                    {isDraft ? 'dihitung' : `${t.items.length} item`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {slice.length === 0 && (
            <EmptyState
              title="Tidak ada opname yang cocok"
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
  namaText: { fontSize: 16.5, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  badge: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
