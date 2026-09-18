/**
 * Riwayat presensi — every shift the signed-in user has clocked, grouped by
 * month.
 *
 * ## What is deliberately not on this screen
 *
 * **No search field and no shift/status chips.** `GET /presensi/saya` accepts
 * both, but a filter nobody has asked for is a filter to delete — the same
 * precedent that dropped Katalog's "Urut nama" chip. Add them back only once
 * somebody is actually scrolling past a year of shifts looking for one.
 *
 * **No own name on any row.** This is a reader's own history; printing their
 * name on every one of thirty rows would be the "Diterima lengkap" mistake
 * CLAUDE.md's layout-economy section warns about — a field that says the same
 * thing on every row is not a field. `app/presensi/tim.tsx` is where a name is
 * actually information, because there it changes row to row.
 *
 * **No row opens anything.** There is nothing a plain role can do to their own
 * presensi besides read it — no edit, no cancel — so a row is a dead end on
 * purpose, and pressing one does nothing.
 *
 * **No docked button.** A susulan-shaped "buat baru" pill has nowhere to point:
 * a shift is recorded by pressing the tombol on `app/(admin)/beranda.tsx`, not
 * by filling a form on this screen.
 *
 * ## Grouping by month, and why it is a run rather than a global group-by
 *
 * Neither `GET /presensi/saya` nor `GET /presensi` documents its sort order the
 * way `GET /pembelian` spells out `tanggal DESC, id DESC`. `app/(admin)/riwayat.tsx`
 * hit the identical gap on `GET /penjualan` and settled it the honest way: group
 * only a *run* of consecutive same-month rows, so if the server's real order
 * ever resurfaces a month later in the list this prints a second heading rather
 * than silently merging two runs that were never actually adjacent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import Feather from '@expo/vector-icons/Feather';
import { RamahBadge, RamahHeader, RamahInlineError, RamahSectionHeader } from '@/components/shell/ramah';
import { RamahColors as C, RamahIcon, RamahLayout as L, RamahRadius as R, RamahTileTone, RamahType as T } from '@/constants/theme-ramah';
import { useRouter } from 'expo-router';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import {
  formatDurasi,
  formatJam,
  listPresensiSaya,
  presensiBus,
  PRESENSI_STATUS,
  SHIFT_LABEL,
  type PresensiRow,
} from '@/services/presensi';

const PAGE_SIZE = 20;

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function bulanTahun(tanggal: string): string {
  const [y, m] = tanggal.split('-').map(Number);
  return `${BULAN_PANJANG[m - 1]} ${y}`;
}

function tanggalPendek(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${HARI[date.getDay()]}, ${d}`;
}

/**
 * Flattened rows with their own headings, the shape `app/(admin)/riwayat.tsx`
 * and `app/produk/index.tsx` both use: `RamahStackCard` wraps its children,
 * which would give up the `FlatList`'s windowing on a list that appends pages.
 */
type Entry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; row: PresensiRow; first: boolean; last: boolean };

function toEntries(rows: PresensiRow[]): Entry[] {
  const out: Entry[] = [];
  let runStart = 0;
  for (let i = 0; i <= rows.length; i++) {
    const sameMonth = i < rows.length && rows[i].tanggal.slice(0, 7) === rows[runStart]?.tanggal.slice(0, 7);
    if (i < rows.length && sameMonth) continue;
    if (i > runStart) {
      out.push({ kind: 'header', key: `h-${runStart}`, label: bulanTahun(rows[runStart].tanggal) });
      for (let j = runStart; j < i; j++) {
        out.push({ kind: 'row', key: `r-${rows[j].id}`, row: rows[j], first: j === runStart, last: j === i - 1 });
      }
    }
    runStart = i;
  }
  return out;
}

export default function RiwayatPresensiScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<PresensiRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const [loadedToken, setLoadedToken] = useState(-1);
  const listLoading = loadedToken !== reloadToken;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await listPresensiSaya({ page: 1, size: PAGE_SIZE });
        if (!alive) return;
        setRows(result.data);
        setPage(1);
        setHasMore(Math.max(1, result.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat riwayat presensi.'));
      } finally {
        if (alive) {
          setMoreErr('');
          setLoadedToken(reloadToken);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  // A correction from `[id]/ubah.tsx` patches the one row in place; nothing
  // else on this screen ever publishes `reload` — this is not a screen a
  // record can be created from, so there is no "new row" case to re-read for.
  useRecordBus(presensiBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || listLoading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const result = await listPresensiSaya({ page: next, size: PAGE_SIZE });
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...result.data.filter((x) => !seen.has(x.id))];
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
    [loadingMore, listLoading, hasMore, moreErr, page]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/presensi');
  }, [router]);

  const entries = useMemo(() => toEntries(rows), [rows]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) =>
      item.kind === 'header' ? (
        <View style={styles.listHeading}>
          <RamahSectionHeader>{item.label}</RamahSectionHeader>
        </View>
      ) : (
        <PresensiRowCard row={item.row} first={item.first} last={item.last} />
      ),
    []
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Riwayat presensi" onBack={goBack} />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderEntry}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
        ListEmptyComponent={<ListPlaceholder loading={listLoading} error={listErr} />}
        ListFooterComponent={<ListFooter loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />
    </View>
  );
}

function PresensiRowCard({ row, first, last }: { row: PresensiRow; first: boolean; last: boolean }) {
  const meta = PRESENSI_STATUS[row.status];
  const jamPulang = row.jamPulang ? formatJam(row.jamPulang) : '—';
  const subtitle = `${SHIFT_LABEL[row.shift]} · ${formatJam(row.jamMasuk)} – ${jamPulang}`;

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${tanggalPendek(row.tanggal)}, ${subtitle}, ${formatDurasi(row.durasiMenit)}, ${meta.label}`}>
        <View style={styles.rowIcon}>
          <Feather
            name={row.shift === 'PAGI' ? 'sunrise' : 'moon'}
            size={RamahIcon.row}
            color={RamahTileTone.akun.ink}
          />
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {tanggalPendek(row.tanggal)}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {formatDurasi(row.durasiMenit)}
          </Text>
          <RamahBadge label={meta.label} tone={meta.tone} />
        </View>
      </View>
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
      <Text style={styles.placeholderTitle}>Belum ada riwayat</Text>
      <Text style={styles.placeholderSub}>Shift yang tercatat lewat tombol di Beranda akan terdaftar di sini.</Text>
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
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },
  listHeading: { paddingTop: L.group - L.stack, paddingBottom: L.related },

  card: {
    backgroundColor: C.surfaceCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  cardFirst: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomWidth: 1, borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card, marginBottom: L.stack },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  row: { flexDirection: 'row', alignItems: 'center', gap: L.space3, padding: L.cardPad, minHeight: L.rowH },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RamahTileTone.akun.tint,
  },
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  rowRight: { flexShrink: 0, maxWidth: 148, alignItems: 'flex-end', gap: L.inline },
  rowValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right' },

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center', paddingHorizontal: L.gutter },
  placeholderTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },

  footer: { paddingVertical: L.space4, alignItems: 'center' },
});
