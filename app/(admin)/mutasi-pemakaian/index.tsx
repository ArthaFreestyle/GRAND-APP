/**
 * Mutasi & Pemakaian — the list of stock documents.
 *
 * The document detail and the entry form are routes (`[id]` and `baru`), so
 * this screen keeps its search, its filter, and its scroll while either is on
 * top; the seeded dataset both of them write to lives in `stores/mutasi.ts`.
 *
 * The table is gone. `RecordList` draws the same rows the product list does:
 * the route is the title, because that is what the document *is*, and the
 * status carries the badge — a mutation still in transit is the one thing
 * anyone scans this list for.
 *
 * No paging: the store holds every document, so the list scrolls. When
 * `/mutasi` lands this grows the same `onEndReached` the product list has, and
 * `stores/mutasi.ts` is deleted rather than extended.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  ListHeader,
  ListSearch,
  NewRecordRow,
  RecordList,
  type RecordItem,
} from '@/components/shell/record-list';
import { FilterPills, KpiCard } from '@/components/shell/ui';
import { num, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  jenisMeta,
  mutasiStore,
  ruangNama,
  statusMeta,
  unitNama,
  type Jenis,
} from '@/stores/mutasi';

type JenisFilter = 'semua' | Jenis;

const JENIS_OPTIONS: { key: JenisFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'mutasi', label: 'Mutasi' },
  { key: 'pemakaian', label: 'Pemakaian' },
];

export default function MutasiListScreen() {
  const router = useRouter();
  const trx = useLocalStore(mutasiStore);

  const [query, setQuery] = useState('');
  const [jenisFilter, setJenisFilter] = useState<JenisFilter>('semua');

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

  const items = useMemo<RecordItem[]>(
    () =>
      filtered.map((t) => {
        const jm = jenisMeta(t.jenis);
        const st = statusMeta(t);
        const rute =
          t.jenis === 'mutasi'
            ? `${ruangNama(t.dari)} → ${ruangNama(t.ke ?? 0)}`
            : `${ruangNama(t.dari)} → ${unitNama(t.unit ?? 0)}`;
        return {
          id: t.id,
          title: rute,
          // The status takes the badge and the kind goes into the meta line:
          // "mutasi" is already legible from the route — a room on both ends —
          // while "dalam perjalanan" is the state somebody has to act on.
          badge: st.label,
          badgeTone: st.tone,
          meta: `${jm.label} · ${t.no} · ${tanggal(t.tanggal)}`,
          // One count, not two. How many units moved is the document's own
          // business; how many lines it has is what tells two documents apart
          // at a glance.
          fields: [{ label: 'Baris', value: `${t.items.length} item`, width: 130 }],
        };
      }),
    [filtered]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/mutasi-pemakaian/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/mutasi-pemakaian/baru');
  }, [router]);

  const pickJenis = useCallback((k: JenisFilter) => setJenisFilter(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setJenisFilter('semua');
  }, []);

  return (
    <AppShell title="Mutasi & Pemakaian">
      <View style={styles.wrap}>
        <View style={styles.tiles}>
          <KpiCard label="Mutasi antar ruang" value={num(mutasiCount)} sub="transaksi tercatat" />
          <KpiCard label="Pemakaian internal" value={num(pemakaianCount)} sub="transaksi tercatat" />
          <KpiCard
            label="Mutasi dalam perjalanan"
            value={num(transitCount)}
            valueClass={transitCount > 0 ? 'text-amber' : 'text-foreground'}
            sub="menunggu diterima"
          />
        </View>

        <RecordList
          items={items}
          loading={false}
          error=""
          filtered={query.trim() !== '' || jenisFilter !== 'semua'}
          onOpen={openDetail}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Transaksi baru"
          emptyTitle="Belum ada transaksi"
          emptySub="Mutasi antar ruang dan pemakaian internal yang dicatat akan terdaftar di sini."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor, ruang, atau unit"
              />
              <FilterPills options={JENIS_OPTIONS} active={jenisFilter} onPick={pickJenis} />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Transaksi baru" onPress={openNew} />
            ) : null
          }
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 18, gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
