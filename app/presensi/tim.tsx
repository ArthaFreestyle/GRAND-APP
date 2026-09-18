/**
 * Presensi tim — **SUPERADMIN**, "siapa yang masuk hari ini" rather than "jam
 * saya": a different question from `app/presensi/index.tsx`, with a different
 * filter and, per the contract's own deviation note on `GET /presensi`, not
 * narrowed to unit kerja the way `GET /presensi/saya` deliberately is not
 * either — this one *is* narrowed, silently, to the session's active unit.
 *
 * `GET /presensi` also accepts `id_user`, but there is no user-search endpoint
 * anywhere in this contract to build a picker from, so that filter stays
 * server-only for now — the date range below is the whole of this screen's UI,
 * and a name column on every row (unlike the reader's own history) is the one
 * place a name actually carries information.
 *
 * Reached only from `app/(admin)/profil.tsx`'s "Presensi" group, which is
 * itself drawn only for a SUPERADMIN session — so a plain role reaching this
 * URL is always a stale link or a hand-typed one, and the guard below is what
 * answers it rather than a 403 the list read would throw first.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import {
  RamahBadge,
  RamahHeader,
  RamahInlineError,
  RamahPickerField,
  RamahSecondaryButton,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import { RamahColors as C, RamahIcon, RamahLayout as L, RamahRadius as R, RamahTileTone, RamahType as T } from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  formatDurasi,
  formatJam,
  listPresensi,
  PRESENSI_STATUS,
  SHIFT_LABEL,
  type PresensiRow,
} from '@/services/presensi';

const PAGE_SIZE = 20;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type RangeKey = 'hari-ini' | '7-hari' | '30-hari';
const RANGE_LABEL: Record<RangeKey, string> = {
  'hari-ini': 'Hari ini',
  '7-hari': '7 hari terakhir',
  '30-hari': '30 hari terakhir',
};
const RANGE_OPTIONS: RangeKey[] = ['hari-ini', '7-hari', '30-hari'];

function rentangOf(key: RangeKey): { dari: string; sampai: string } {
  const now = new Date();
  const sampai = isoOf(now);
  if (key === 'hari-ini') return { dari: sampai, sampai };
  const hari = key === '7-hari' ? 6 : 29;
  const dariDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - hari);
  return { dari: isoOf(dariDate), sampai };
}

export default function PresensiTimScreen() {
  const router = useRouter();
  const canOpen = useCanWrite('presensi');

  const [range, setRange] = useState<RangeKey>('hari-ini');
  const [rangeSheet, setRangeSheet] = useState(false);

  const [rows, setRows] = useState<PresensiRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${range}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState('');
  const listLoading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!canOpen) return;
    let alive = true;
    (async () => {
      try {
        const { dari, sampai } = rentangOf(range);
        const result = await listPresensi({ page: 1, size: PAGE_SIZE, tanggal_dari: dari, tanggal_sampai: sampai });
        if (!alive) return;
        setRows(result.data);
        setPage(1);
        setHasMore(Math.max(1, result.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat presensi tim.'));
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
  }, [range, reloadToken, requestKey, canOpen]);

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || listLoading || !hasMore || !canOpen) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const { dari, sampai } = rentangOf(range);
        const result = await listPresensi({ page: next, size: PAGE_SIZE, tanggal_dari: dari, tanggal_sampai: sampai });
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
    [loadingMore, listLoading, hasMore, moreErr, page, range, canOpen]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/presensi');
  }, [router]);

  const openDetail = useCallback(
    (id: number) => router.push({ pathname: '/presensi/[id]', params: { id } }),
    [router]
  );

  const renderRow = useCallback(
    ({ item, index }: { item: PresensiRow; index: number }) => (
      <TimRow row={item} first={index === 0} last={index === rows.length - 1} onPress={openDetail} />
    ),
    [rows.length, openDetail]
  );

  if (!canOpen) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Presensi tim" onBack={goBack} />
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
      <RamahHeader title="Presensi tim" onBack={goBack} />
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahPickerField
              label="Rentang tanggal"
              value={RANGE_LABEL[range]}
              placeholder="Pilih rentang"
              onPress={() => setRangeSheet(true)}
            />
            {listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
          </View>
        }
        ListEmptyComponent={<ListPlaceholder loading={listLoading} error={listErr} />}
        ListFooterComponent={<ListFooter loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />

      <RamahSheet visible={rangeSheet} title="Rentang tanggal" onClose={() => setRangeSheet(false)}>
        <View style={styles.sheetBody}>
          {RANGE_OPTIONS.map((key) => (
            <RamahSheetOption
              key={key}
              label={RANGE_LABEL[key]}
              selected={range === key}
              onPress={() => {
                setRange(key);
                setRangeSheet(false);
              }}
            />
          ))}
        </View>
      </RamahSheet>
    </View>
  );
}

function TimRow({
  row,
  first,
  last,
  onPress,
}: {
  row: PresensiRow;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const meta = PRESENSI_STATUS[row.status];
  const jamPulang = row.jamPulang ? formatJam(row.jamPulang) : '—';
  // The date has to be on the row: unlike `app/presensi/index.tsx` (grouped by
  // month) this list spans a range with no heading to carry it.
  const subtitle = `${formatTanggal(row.tanggal)} · ${SHIFT_LABEL[row.shift]} · ${formatJam(row.jamMasuk)}–${jamPulang}`;

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.namaUser || 'Tanpa nama'}, ${subtitle}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.rowIcon}>
          <Feather name="user" size={RamahIcon.row} color={RamahTileTone.akun.ink} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.namaUser || '—'}
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
      </Pressable>
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
      <Text style={styles.placeholderTitle}>Tidak ada presensi</Text>
      <Text style={styles.placeholderSub}>Tidak ada shift tercatat pada rentang ini.</Text>
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },
  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },

  card: {
    backgroundColor: C.surfaceCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  cardFirst: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomWidth: 1, borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  row: { flexDirection: 'row', alignItems: 'center', gap: L.space3, padding: L.cardPad, minHeight: L.rowH },
  rowDown: { backgroundColor: C.surfaceStack },
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

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space1, paddingBottom: L.space4 },
});
