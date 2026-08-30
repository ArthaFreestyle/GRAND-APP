/**
 * Penjualan — the list of sales notes.
 *
 * The note detail and the entry form are routes (`[id]` and `baru`), so this
 * screen keeps its search, its filter, and its scroll while either is on top;
 * the seeded dataset both of them write to lives in `stores/penjualan.ts`.
 *
 * The table is gone — three fixed columns wanted 640pt and a phone has ~354, so
 * the status and the amount hid off the right edge. These are `RecordList` rows
 * now, like the product list: the payment status is the row's badge, and total
 * and balance stack underneath on a phone.
 *
 * There is no paging either, and no endpoint to page: the store holds every
 * note, so the list simply scrolls. When `/penjualan` lands, this grows the
 * same `onEndReached` the product list has, and `stores/penjualan.ts` is
 * deleted rather than extended.
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
import { FilterPills, StatTile } from '@/components/shell/ui';
import { rp, rpShort, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import { cust, jatuhOf, penjualanStore, statusOf, TODAY, totalOf } from '@/stores/penjualan';

type StatusFilter = 'semua' | 'belum' | 'lunas';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'belum', label: 'Belum lunas' },
  { key: 'lunas', label: 'Lunas' },
];

export default function PenjualanListScreen() {
  const router = useRouter();
  const nota = useLocalStore(penjualanStore);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');

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

  const items = useMemo<RecordItem[]>(
    () =>
      filtered.map((f) => {
        const total = totalOf(f);
        const sisa = total - f.dibayar;
        const st = statusOf(f);
        const c = cust(f.custId);
        return {
          id: f.id,
          title: c ? c.nama : '—',
          badge: st.label,
          badgeTone: st.tone,
          meta: `${f.no} · ${tanggal(f.tanggal)} · ${f.items.length} item`,
          fields: [
            { label: 'Total', value: rp(total), width: 150 },
            {
              label: 'Sisa',
              value: sisa > 0 ? rpShort(sisa) : 'lunas',
              // Only an overdue balance is an alarm. Money still inside its
              // terms is simply money not collected yet.
              danger: sisa > 0 && st.key === 'telat',
              width: 130,
            },
          ],
        };
      }),
    [filtered]
  );

  const openList = nota.filter((f) => totalOf(f) - f.dibayar > 0);
  const overdueList = openList.filter((f) => {
    const j = jatuhOf(f);
    return j && j < TODAY;
  });
  const sumPiutang = openList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumOverdue = overdueList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumTotal = nota.reduce((a, f) => a + totalOf(f), 0);

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

  const clearFilter = useCallback(() => {
    setQuery('');
    setStatus('semua');
  }, []);

  return (
    <AppShell title="Penjualan">
      <View style={styles.wrap}>
        <View style={styles.tiles}>
          <StatTile
            label="Total piutang berjalan"
            value={rp(sumPiutang)}
            valueClass="text-danger"
            sub={`${openList.length} nota belum lunas`}
          />
          <StatTile
            label="Jatuh tempo terlewat"
            value={rp(sumOverdue)}
            valueClass={sumOverdue > 0 ? 'text-danger' : 'text-foreground'}
            sub={`${overdueList.length} nota lewat tempo`}
          />
          <StatTile
            label="Nilai penjualan tercatat"
            value={rp(sumTotal)}
            sub={`${nota.length} nota`}
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
          createLabel="Nota baru"
          emptyTitle="Belum ada nota penjualan"
          emptySub="Nota yang dibuat dari layar ini maupun dari kasir akan terdaftar di sini."
          header={
            <ListHeader>
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Cari nomor nota atau pelanggan"
              />
              <FilterPills options={STATUS_OPTIONS} active={status} onPick={pickStatus} />
            </ListHeader>
          }
          leadRow={
            canWrite ? (
              <NewRecordRow title="Nota baru" onPress={openNew} />
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
