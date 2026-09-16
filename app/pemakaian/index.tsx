/**
 * Pemakaian internal — the requests, and the two queues they form.
 *
 * This document waits on somebody twice: once to be approved, once to be
 * posted. The contract names the first as a list — `status=DIAJUKAN` with
 * `terlama_dulu=true` is the approval queue — and the second follows the same
 * shape on `DISETUJUI`. Both are chips here, oldest first, and a superadmin opens
 * on the approval queue because that is the work waiting for them.
 *
 * The row leads with `keperluan`, not the number: "oli untuk servis truk B" is
 * what somebody recognises a request by. The requester's name is on the second
 * line because an approver's first question is who is asking.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import { DOKUMEN_META, DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import {
  listPemakaian,
  pemakaianBus,
  type PemakaianQuery,
  type PemakaianRow,
} from '@/services/pemakaian';
import { useActiveRole, useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type Filter = 'antrean' | 'siap' | 'semua' | 'DRAFT' | 'POSTED' | 'DITOLAK' | 'BATAL';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'antrean', label: 'Menunggu persetujuan' },
  { key: 'siap', label: 'Siap posting' },
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: DOKUMEN_META.DRAFT.label },
  { key: 'POSTED', label: DOKUMEN_META.POSTED.label },
  { key: 'DITOLAK', label: DOKUMEN_META.DITOLAK.label },
  { key: 'BATAL', label: DOKUMEN_META.BATAL.label },
];

function queryOf(filter: Filter, search: string, page: number): PemakaianQuery {
  const antrean = filter === 'antrean' || filter === 'siap';
  return {
    page,
    size: PAGE_SIZE,
    search: search || undefined,
    status:
      filter === 'antrean'
        ? 'DIAJUKAN'
        : filter === 'siap'
          ? 'DISETUJUI'
          : filter === 'semua'
            ? undefined
            : filter,
    terlamaDulu: antrean,
  };
}

function kosongUntuk(filter: Filter, search: string): string {
  if (search !== '') return 'Tidak ada yang cocok.';
  if (filter === 'antrean') return 'Tidak ada permintaan yang menunggu persetujuan.';
  if (filter === 'siap') return 'Tidak ada permintaan yang menunggu posting.';
  return 'Belum ada permintaan pemakaian di unit kerja ini.';
}

export default function PemakaianListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('pemakaian');
  const role = useActiveRole();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [filter, setFilter] = useState<Filter>(() =>
    role === 'SUPERADMIN' ? 'antrean' : 'semua'
  );
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<PemakaianRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');

  const [reloadToken, setReloadToken] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${filter}|${search}|${reloadToken}`;
  const loading = loadedKey !== requestKey;
  /**
   * Narrower than `loading`, which also flips on a search keystroke or a
   * filter chip tap — a pull spinner spinning for those is the bug issue #37
   * calls out. Only a read triggered by the current `reloadToken` clears it.
   */
  const [loadedToken, setLoadedToken] = useState(-1);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listPemakaian(queryOf(filter, search, 1));
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar pemakaian.'));
      } finally {
        if (alive) {
          setMoreErr('');
          setLoadedKey(requestKey);
          setLoadedToken(reloadToken);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, search, reloadToken, requestKey]);

  useRecordBus(pemakaianBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listPemakaian(queryOf(filter, search, next));
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...answer.data.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, answer.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, loading, hasMore, moreErr, page, filter, search]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: PemakaianRow; index: number }) => (
      <PemakaianCard
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={() => router.push({ pathname: '/pemakaian/[id]', params: { id: item.id } })}
      />
    ),
    [rows.length, router]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pemakaian" onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={rows.length > 0 && loadedToken !== reloadToken}
            onRefresh={reload}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nomor atau keperluan"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chipRow}>
              {FILTERS.map((f) => (
                <RamahChip
                  key={f.key}
                  label={f.label}
                  selected={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </ScrollView>
            {listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.placeholder}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : listErr ? null : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>{kosongUntuk(filter, search)}</Text>
            </View>
          )
        }
        ListFooterComponent={
          moreErr ? (
            <RamahInlineError message={moreErr} onRetry={() => loadMore(true)} />
          ) : loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : null
        }
      />

      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Permintaan baru"
            icon="plus"
            onPress={() => router.push('/pemakaian/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

function PemakaianCard({
  row,
  first,
  last,
  onPress,
}: {
  row: PemakaianRow;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.keperluan}, ${row.namaPemohon}, ${row.nomor}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.keperluan || row.nomor}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {[row.namaPemohon, row.nomor, formatTanggal(row.tanggal)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {/* Only a posted request has a value; before that there is no figure to show. */}
          {row.totalHpp !== null ? (
            <Text style={styles.rowValue} numberOfLines={1}>
              {formatRupiah(row.totalHpp)}
            </Text>
          ) : null}
          <RamahBadge label={meta.label} tone={meta.tone} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },
  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  chipRow: { gap: L.related, paddingRight: L.gutter },

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.surfaceStack },
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  rowRight: { flexShrink: 0, maxWidth: 148, alignItems: 'flex-end', gap: L.inline },
  rowValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right' },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space4, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
