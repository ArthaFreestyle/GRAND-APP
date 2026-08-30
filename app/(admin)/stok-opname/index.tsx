/**
 * Stok Opname — the list of counting sessions.
 *
 * Both the running count and the posted result are one route (`[id]`), which
 * renders whichever the session's status calls for. This screen keeps its
 * search, its filter, and its scroll underneath either.
 *
 * The table is gone: `RecordList` draws the same rows as the product list, with
 * the session's status as the badge — the hand-rolled badge this screen used to
 * build from `C.amberBg` and `C.greenBg` is the shared one now, so "Berjalan"
 * is the same amber here as everywhere else.
 *
 * No paging: the store holds every session, so the list scrolls.
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
import { countedItems, opnameStore, ruangNama, varianceItems } from '@/stores/opname';

type StatusFilter = 'semua' | 'draft' | 'selesai';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'draft', label: 'Berjalan' },
  { key: 'selesai', label: 'Selesai' },
];

export default function StokOpnameListScreen() {
  const router = useRouter();
  const sessions = useLocalStore(opnameStore);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');

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

  const items = useMemo<RecordItem[]>(
    () =>
      filtered.map((t) => {
        const isDraft = t.status === 'draft';
        const countedN = countedItems(t.items).length;
        const nVar = varianceItems(t.items).length;
        return {
          id: t.id,
          title: ruangNama(t.ruang),
          badge: isDraft ? 'Berjalan' : 'Selesai',
          badgeTone: isDraft ? ('amber' as const) : ('green' as const),
          meta: `${t.no} · ${tanggal(t.tanggal)} · ${t.petugas}`,
          // "4/12" already says how many items there are; a second field
          // repeating the 12 is the kind of column that gets added because
          // there is space for it.
          fields: [
            {
              label: isDraft ? 'Dihitung' : 'Hasil',
              value: isDraft
                ? `${countedN}/${t.items.length}`
                : nVar
                  ? `${nVar} selisih`
                  : 'cocok',
              width: 150,
            },
          ],
        };
      }),
    [filtered]
  );

  const openDetail = useCallback(
    (id: number) => {
      // One address per session; the document route decides between the
      // counting sheet and the posted result from its status.
      router.push({ pathname: '/stok-opname/[id]', params: { id } });
    },
    [router]
  );

  const openNew = useCallback(() => {
    router.push('/stok-opname/baru');
  }, [router]);

  const pickStatus = useCallback((k: StatusFilter) => setStatus(k), []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
  }, []);

  return (
    <AppShell title="Stok Opname">
      <View style={styles.wrap}>
        <View style={styles.tiles}>
          <KpiCard
            label="Opname berjalan"
            value={num(berjalanCount)}
            valueClass={berjalanCount > 0 ? 'text-amber' : 'text-foreground'}
            sub="sedang dihitung"
          />
          <KpiCard label="Opname selesai" value={num(selesaiCount)} sub="sudah terposting" />
          <KpiCard
            label="Selisih ditemukan"
            value={num(selisihCount)}
            valueClass={selisihCount > 0 ? 'text-amber' : 'text-foreground'}
            sub="item disesuaikan"
          />
        </View>

        <RecordList
          items={items}
          loading={false}
          error=""
          filtered={query.trim() !== '' || status !== 'semua'}
          onOpen={openDetail}
          onClearFilter={clearFilter}
          onCreate={canWrite ? openNew : undefined}
          createLabel="Opname baru"
          emptyTitle="Belum ada opname"
          emptySub="Sesi perhitungan fisik yang dibuka akan terdaftar di sini beserta selisihnya."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor, ruang, atau petugas"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Opname baru" onPress={openNew} />
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
