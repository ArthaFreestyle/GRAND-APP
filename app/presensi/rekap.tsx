/**
 * Rekap bulanan — **SUPERADMIN**, one card per employee for one month, off
 * `GET /presensi/rekap`.
 *
 * `tahun` and `bulan` are both required by the contract, so there is no
 * "today's month" default that could quietly be wrong for a shop reading last
 * month's numbers on the third of this one — the picker always shows which
 * month is on screen, the same shape `app/laporan/pergerakan.tsx` already
 * uses for its own required month.
 *
 * ## What this screen refuses to compute
 *
 * `hariDuaShift` is printed exactly as the server sends it rather than derived
 * from `hariPagiSelesai + hariMalamSelesai` — that sum counts a two-shift day
 * twice and cannot say which day overlapped, which is exactly why the contract
 * carries it as its own column. `hariLupaPulangPagi/Malam` are never folded
 * into the "selesai" counts either: whether a forgotten tap still counts as a
 * day worked is payroll policy nobody has written yet, and doing that fold here
 * would be inventing the policy inside a report that is supposed to only
 * report. There is no "layak dibayar", "terlambat" or "lembur" column for the
 * same reason — CLAUDE.md's layout-economy rule bans a number invented to fill
 * a card, and none of those three exist anywhere in the contract.
 *
 * ## One card per employee, not a table
 *
 * A phone in portrait carries ~354pt of content width; a table wide enough for
 * eight columns needs 640–880. So each employee is a card — name on top, every
 * count as a label/value pair underneath, `RamahSummaryCard`'s own shape.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';
import {
  RamahHeader,
  RamahInlineError,
  RamahPickerField,
  RamahSecondaryButton,
  RamahSheet,
  RamahSheetOption,
  RamahSummaryCard,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahLayout as L, RamahRadius as R, RamahType as T } from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { formatDurasi, rekapPresensi, type RekapPresensiRow } from '@/services/presensi';

const PAGE_SIZE = 20;
/** A year of comparisons, and still a list somebody can scan in a sheet without searching it. */
const BULAN_PILIHAN = 12;

const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface Bulan {
  tahun: number;
  bulan: number;
  label: string;
}

/** Built once — the list is a function of today's date, and today does not change while somebody is reading a report. */
function bulanTerakhir(n: number): Bulan[] {
  const now = new Date();
  const out: Bulan[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ tahun: d.getFullYear(), bulan: d.getMonth() + 1, label: `${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export default function RekapPresensiScreen() {
  const router = useRouter();
  const canOpen = useCanWrite('presensi');

  const [bulanList] = useState(() => bulanTerakhir(BULAN_PILIHAN));
  const [bulanIdx, setBulanIdx] = useState(0);
  const [bulanSheet, setBulanSheet] = useState(false);
  const bulan = bulanList[bulanIdx];

  const [rows, setRows] = useState<RekapPresensiRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${bulan.tahun}-${bulan.bulan}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState('');
  const listLoading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!canOpen) return;
    let alive = true;
    (async () => {
      try {
        const result = await rekapPresensi({ tahun: bulan.tahun, bulan: bulan.bulan, page: 1, size: PAGE_SIZE });
        if (!alive) return;
        setRows(result.data);
        setPage(1);
        setHasMore(Math.max(1, result.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat rekap presensi.'));
      } finally {
        if (alive) {
          setMoreErr('');
          setLoadedKey(requestKey);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [bulan.tahun, bulan.bulan, reloadToken, requestKey, canOpen]);

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || listLoading || !hasMore || !canOpen) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const result = await rekapPresensi({ tahun: bulan.tahun, bulan: bulan.bulan, page: next, size: PAGE_SIZE });
        setRows((list) => {
          const seen = new Set(list.map((x) => x.idUser));
          return [...list, ...result.data.filter((x) => !seen.has(x.idUser))];
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
    [loadingMore, listLoading, hasMore, moreErr, page, bulan, canOpen]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/presensi');
  }, [router]);

  const renderRow = useCallback(({ item }: { item: RekapPresensiRow }) => <RekapCard row={item} />, []);

  if (!canOpen) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Rekap bulanan" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Tidak berwenang</Text>
          <Text style={styles.centerSub}>Halaman ini hanya untuk superadmin.</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Rekap bulanan" onBack={goBack} />
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.idUser)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahPickerField
              label="Bulan"
              required
              value={bulan.label}
              placeholder="Pilih bulan"
              onPress={() => setBulanSheet(true)}
            />
            {listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
          </View>
        }
        ListEmptyComponent={<ListPlaceholder loading={listLoading} error={listErr} />}
        ListFooterComponent={<ListFooter loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />

      <RamahSheet visible={bulanSheet} title="Pilih bulan" onClose={() => setBulanSheet(false)}>
        <View style={styles.sheetBody}>
          {bulanList.map((b, i) => (
            <RamahSheetOption
              key={`${b.tahun}-${b.bulan}`}
              label={b.label}
              selected={i === bulanIdx}
              onPress={() => {
                setBulanIdx(i);
                setBulanSheet(false);
              }}
            />
          ))}
        </View>
      </RamahSheet>
    </View>
  );
}

function RekapCard({ row }: { row: RekapPresensiRow }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {row.namaUser || '—'}
      </Text>
      <RamahSummaryCard
        rows={[
          { label: 'Pagi selesai', value: `${row.hariPagiSelesai} hari` },
          { label: 'Malam selesai', value: `${row.hariMalamSelesai} hari` },
          { label: 'Dua shift', value: `${row.hariDuaShift} hari` },
          { label: 'Lupa pulang (pagi / malam)', value: `${row.hariLupaPulangPagi} / ${row.hariLupaPulangMalam}` },
          { label: 'Total kerja pagi', value: formatDurasi(row.totalMenitKerjaPagi) },
          { label: 'Total kerja malam', value: formatDurasi(row.totalMenitKerjaMalam) },
        ]}
      />
    </View>
  );
}

function ListPlaceholder({ loading, error }: { loading: boolean; error: string }) {
  if (loading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (error) return null;
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Tidak ada data</Text>
      <Text style={styles.placeholderSub}>Belum ada presensi tercatat pada bulan ini.</Text>
    </View>
  );
}

function ListFooter({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) {
    return (
      <View style={styles.footer}>
        <RamahInlineError message={error} onRetry={onRetry} />
      </View>
    );
  }
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6, gap: L.stack },
  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },

  card: {
    backgroundColor: C.surfaceCard,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.borderHairline,
    padding: L.cardPad,
    gap: L.space3,
    marginBottom: L.stack,
  },
  cardTitle: { ...T.titleTiny, color: C.textTitle },

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center', paddingHorizontal: L.gutter },
  placeholderTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },

  footer: { paddingVertical: L.space4, alignItems: 'center' },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space1, paddingBottom: L.space4 },
});
