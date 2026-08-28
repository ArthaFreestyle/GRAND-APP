/**
 * Supplier — the list.
 *
 * Search, the tipe chips, and paging all run over the in-memory dataset in
 * `stores/supplier.ts`, which the detail and the create form write to: the list
 * stays mounted underneath them and re-renders when they do.
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
  GhostButton,
  NeutralBadge,
  PagingBar,
  PrimaryButton,
  SearchBar,
} from '@/components/shell/ui';
import { Colors as C, rpShort } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  adaJatuhTempo,
  belumLunasOf,
  hutangOf,
  supplierStore,
  TIPE_META,
  type Tipe,
} from '@/stores/supplier';

const PAGE_SIZE = 8;

const TIPE_OPTIONS: { key: 'semua' | Tipe; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'pabrik', label: 'Pabrik' },
  { key: 'perorangan', label: 'Perorangan' },
];

export default function SupplierListScreen() {
  const router = useRouter();
  const suppliers = useLocalStore(supplierStore);

  const [query, setQuery] = useState('');
  const [tipe, setTipe] = useState<'semua' | Tipe>('semua');
  const [page, setPage] = useState(1);

  const canWrite = useCanWrite('supplier');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((c) => {
      if (tipe !== 'semua' && c.tipe !== tipe) return false;
      if (!q) return true;
      return (
        c.nama.toLowerCase().includes(q) ||
        c.kode.toLowerCase().includes(q) ||
        c.narahubung.toLowerCase().includes(q)
      );
    });
  }, [suppliers, query, tipe]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <AppShell title="Supplier">
      <View style={styles.listWrap}>
        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setPage(1);
            }}
            placeholder="Cari nama, kode, atau narahubung"
          />
          <FilterPills
            options={TIPE_OPTIONS}
            active={tipe}
            onPick={(k) => {
              setTipe(k);
              setPage(1);
            }}
          />
          <View style={{ flex: 1 }} />
          <Text style={styles.countLabel}>{filtered.length} supplier</Text>
          {canWrite && (
            <PrimaryButton label="Supplier baru" onPress={() => router.push('/supplier/baru')} />
          )}
        </View>

        <DataTable
          minWidth={700}
          head={
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 128 }]}>TIPE</Text>
              <Text style={[styles.thText, { width: 140, textAlign: 'right' }]}>HUTANG</Text>
              <View style={{ width: 90 }} />
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
          {slice.map((r) => {
            const meta = TIPE_META[r.tipe];
            const hutang = hutangOf(r);
            const belum = belumLunasOf(r);
            const jatuhTempo = adaJatuhTempo(r);
            return (
              <View key={r.id} style={styles.row}>
                <Pressable
                  onPress={() => router.push({ pathname: '/supplier/[id]', params: { id: r.id } })}
                  style={styles.rowMain}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <Text style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>
                        {r.nama}
                      </Text>
                      {!r.aktif && <NeutralBadge />}
                    </View>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {r.kode} · {r.narahubung || '—'}
                      {r.kota ? ` · ${r.kota}` : ''}
                    </Text>
                  </View>
                  <View style={{ width: 128 }}>
                    <Badge label={meta.label} tone={meta.tone} small />
                  </View>
                  <View style={{ width: 140, alignItems: 'flex-end', gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: hutang <= 0 ? C.muted : jatuhTempo ? C.red : C.text,
                      }}>
                      {hutang > 0 ? rpShort(hutang) : '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>
                      {belum > 0 ? `${belum} faktur terbuka` : 'lunas semua'}
                    </Text>
                  </View>
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
            );
          })}
          {slice.length === 0 && (
            <EmptyState
              title="Tidak ada supplier yang cocok"
              sub="Coba kata kunci lain atau ubah filter tipe."
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
    height: 48,
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
});
