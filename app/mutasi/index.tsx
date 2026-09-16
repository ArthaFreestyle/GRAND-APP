/**
 * Mutasi gudang — the list, and the posting queue it stands in for.
 *
 * **A mutasi has no `DIAJUKAN`**, so nothing on a draft says "this one is ready".
 * The contract's replacement is a list, not a status: `status=DRAFT` with
 * `terlama_dulu=true` is the superadmin's work queue, oldest first, because a
 * queue is read to be worked through rather than to see what is newest. That is
 * the first chip here, and a superadmin opens the screen on it. Everyone else
 * opens on "Semua", since for a gudang grant a draft waiting on somebody else is
 * not a task.
 *
 * The row leads with the two rooms rather than the number. What somebody scans
 * this list for is a movement — "did the stock for the shop go out yet" — and the
 * `MT/…` number is what they read once they have found it.
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
import { formatTanggal } from '@/constants/produk';
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
import { listMutasi, mutasiBus, type MutasiQuery, type MutasiRow } from '@/services/mutasi';
import { useActiveRole, useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type Filter = 'antrean' | 'semua' | 'POSTED' | 'BATAL';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'antrean', label: 'Menunggu posting' },
  { key: 'semua', label: 'Semua' },
  { key: 'POSTED', label: DOKUMEN_META.POSTED.label },
  { key: 'BATAL', label: DOKUMEN_META.BATAL.label },
];

function queryOf(filter: Filter, search: string, page: number): MutasiQuery {
  return {
    page,
    size: PAGE_SIZE,
    search: search || undefined,
    status: filter === 'antrean' ? 'DRAFT' : filter === 'semua' ? undefined : filter,
    terlamaDulu: filter === 'antrean',
  };
}

export default function MutasiListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('mutasi');
  const role = useActiveRole();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  // The queue is the superadmin's to work; see the file header.
  const [filter, setFilter] = useState<Filter>(() =>
    role === 'SUPERADMIN' ? 'antrean' : 'semua'
  );
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<MutasiRow[]>([]);
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
   * `refreshing` needs a narrower signal than `loading`: that flag also
   * flips on every search keystroke and filter chip tap, and a pull spinner
   * spinning for those reads no one pulled for is the bug issue #37 calls
   * out. This only disagrees with `reloadToken` when a read triggered by
   * that token has not landed yet.
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
        const answer = await listMutasi(queryOf(filter, search, 1));
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar mutasi.'));
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

  // A posted draft is patched in place and left under "Menunggu posting" until
  // the next read: a row vanishing the moment somebody acted on it reads as a bug.
  useRecordBus(mutasiBus, (change) => {
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
        const answer = await listMutasi(queryOf(filter, search, next));
        // Offset paging: a document posted mid-scroll shifts the window.
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
    ({ item, index }: { item: MutasiRow; index: number }) => (
      <MutasiCard
        row={item}
        antrean={filter === 'antrean'}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={() => router.push({ pathname: '/mutasi/[id]', params: { id: item.id } })}
      />
    ),
    [filter, rows.length, router]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Mutasi gudang" onBack={goBack} />

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
              placeholder="Cari nomor atau keterangan"
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
              <Text style={styles.placeholderText}>
                {search !== ''
                  ? 'Tidak ada yang cocok.'
                  : filter === 'antrean'
                    ? 'Tidak ada draf yang menunggu posting.'
                    : 'Belum ada mutasi di unit kerja ini.'}
              </Text>
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
            label="Mutasi baru"
            icon="plus"
            onPress={() => router.push('/mutasi/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

function MutasiCard({
  row,
  antrean,
  first,
  last,
  onPress,
}: {
  row: MutasiRow;
  /** In the queue the date is how long it has waited, and says so. */
  antrean: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  const rute = `${row.namaRuangAsal || '—'} → ${row.namaRuangTujuan || '—'}`;
  const tanggal = formatTanggal(row.tanggal);
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${rute}, ${row.nomor}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {rute}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {`${row.nomor} · ${antrean ? `sejak ${tanggal}` : tanggal}`}
          </Text>
        </View>
        <RamahBadge label={meta.label} tone={meta.tone} />
      </Pressable>
    </View>
  );
}

/** No top, left or right inset: `_layout.tsx` pays those. The bottom is the dock's. */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },
  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  chipRow: { gap: L.related, paddingRight: L.gutter },

  // Assembled row by row rather than with `RamahStackCard`: this list appends
  // pages, and one wrapping element would give up the windowing.
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
