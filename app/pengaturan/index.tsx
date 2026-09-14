/**
 * Pengaturan — the unit kerja list, and issue #23's whole reason for being.
 *
 * **One question: which locations does this shop have, and which of them can
 * hold stock.** `GET /unit-kerja` is not scoped to the caller's active unit
 * the way `GET /ruang` is — every unit kerja that exists is listed here,
 * because managing a unit other than the one you are standing in is this
 * screen's entire job. Tapping a row opens it and its ruang; the docked pill
 * adds a new one.
 *
 * Reached from Beranda's "Unit kerja" tile (issue #24) as well as the five
 * dead-end screens this issue's own #23 closes — see `_layout.tsx` for both.
 *
 * The tile is drawn for every role, same as the rest of the grid: Beranda
 * branches on nothing, and `useCanWrite('unit-kerja')` below is what keeps the
 * docked "Tambah unit kerja" pill off a grant that cannot use it, not whether
 * the screen opens at all.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listUnitKerja, unitKerjaBus, type UnitKerjaRow } from '@/services/unit-kerja';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export default function PengaturanListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('unit-kerja');
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [termasukNonaktif, setTermasukNonaktif] = useState(false);

  const [rows, setRows] = useState<UnitKerjaRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${search}|${termasukNonaktif}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listUnitKerja({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: termasukNonaktif ? undefined : true,
        });
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar unit kerja.'));
      } finally {
        if (!alive) return;
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [search, termasukNonaktif, reloadToken, requestKey]);

  useRecordBus(unitKerjaBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    if (!saved.aktif && !termasukNonaktif) {
      setRows((list) => list.filter((r) => r.id !== saved.id));
      return;
    }
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listUnitKerja({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: termasukNonaktif ? undefined : true,
        });
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
    [loadingMore, loading, hasMore, moreErr, page, search, termasukNonaktif]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: UnitKerjaRow; index: number }) => (
      <UnitKerjaRowView
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={() => router.push({ pathname: '/pengaturan/[id]', params: { id: item.id } })}
      />
    ),
    [rows.length, router]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Unit kerja & ruang" onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nama atau kode unit kerja"
            />
            <View style={styles.chipRow}>
              <RamahChip
                label="Termasuk nonaktif"
                selected={termasukNonaktif}
                onPress={() => setTermasukNonaktif((v) => !v)}
                accessibilityLabel={
                  termasukNonaktif
                    ? 'Sembunyikan unit kerja nonaktif'
                    : 'Tampilkan juga unit kerja nonaktif'
                }
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            loading={loading}
            error={listErr}
            searching={search !== ''}
            onRetry={reload}
          />
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />

      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Tambah unit kerja"
            icon="plus"
            onPress={() => router.push('/pengaturan/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

function UnitKerjaRowView({
  row,
  first,
  last,
  onPress,
}: {
  row: UnitKerjaRow;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.nama}${row.aktif ? '' : ', nonaktif'}`}
        style={[styles.row, down && styles.rowDown]}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {row.nama}
        </Text>
        {row.aktif ? null : <RamahBadge label="Nonaktif" tone="neutral" />}
        <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
      </Pressable>
    </View>
  );
}

function Placeholder({
  loading,
  error,
  searching,
  onRetry,
}: {
  loading: boolean;
  error: string;
  searching: boolean;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (loading)
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {searching
          ? 'Tidak ada unit kerja yang cocok dengan pencarian itu.'
          : 'Belum ada unit kerja. Tambahkan satu untuk mulai mendaftarkan gudangnya.'}
      </Text>
    </View>
  );
}

function Footer({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.stack, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.grey50 },
  rowTitle: { ...T.titleTiny, color: C.textTitle, flex: 1, minWidth: 0 },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
