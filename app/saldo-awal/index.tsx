/**
 * Saldo awal — the list of opening-stock documents.
 *
 * A unit kerja that has just migrated types one of these per room, once, and
 * never again — which is why it lives behind Beranda's "Lihat semua" and the list
 * is drawn as a work queue rather than a history: the chip a supervisor opens on
 * is **Diajukan**, the documents waiting for somebody to post them.
 *
 * `search` matches the number **and the reason**, so the placeholder says so: the
 * reason is the only record of why inventory value was created with nothing
 * behind it.
 *
 * The one amount on a row is `total_nilai`, and it is **absent, not "Rp 0"**,
 * until the document is posted — no figure is a different fact from a zero one.
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

import { formatUang } from '@/components/saldo-awal/baris';
import {
  RamahBadge,
  RamahChip,
  RamahEmptySearch,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
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
import { useCanWrite } from '@/services/permissions';
import {
  listSaldoAwal,
  saldoAwalBus,
  type SaldoAwalRow,
  type StatusSaldoAwal,
} from '@/services/saldo-awal';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusSaldoAwal;

// Diajukan second: it is the queue a supervisor is here for.
const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DIAJUKAN', label: 'Diajukan' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

export default function SaldoAwalListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('saldo-awal');
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [rows, setRows] = useState<SaldoAwalRow[]>([]);
  const [listErr, setListErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  // Loading is derived: the key wanted (built in render) against the key loaded.
  const requestKey = `${search}|${status}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState('');
  const listLoading = loadedKey !== requestKey;
  // Narrower than `listLoading`, which also flips on a keystroke or a chip tap —
  // the pull spinner must answer only to a pull (issue #37).
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
        const result = await listSaldoAwal({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
        });
        if (!alive) return;
        setRows(result.data);
        setPage(1);
        setHasMore(Math.max(1, result.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar saldo awal.'));
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
  }, [search, status, reloadToken, requestKey]);

  // A row left under a chip it no longer matches is deliberate: vanishing the
  // record somebody just acted on reads as a bug, and the next reload settles it.
  useRecordBus(saldoAwalBus, (change) => {
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
        const result = await listSaldoAwal({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
        });
        // Offset paging, no cursor: a shifted window can deliver a row twice.
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
    [loadingMore, listLoading, hasMore, moreErr, page, search, status]
  );

  const openDetail = useCallback(
    (id: number) => router.push({ pathname: '/saldo-awal/[id]', params: { id } }),
    [router]
  );

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `replace` covers a cold link.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: SaldoAwalRow; index: number }) => (
      <SaldoAwalCard
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={openDetail}
      />
    ),
    [rows.length, openDetail]
  );

  const filtered = search !== '' || status !== 'semua';

  return (
    <View style={styles.screen}>
      <RamahHeader title="Saldo awal" onBack={goBack} />

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
              placeholder="Cari nomor atau alasan"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chipRow}>
              {STATUS_OPTIONS.map((o) => (
                <RamahChip
                  key={o.key}
                  label={o.label}
                  selected={status === o.key}
                  onPress={() => setStatus(o.key)}
                />
              ))}
            </ScrollView>
            {listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
          </View>
        }
        ListEmptyComponent={
          <ListPlaceholder loading={listLoading} error={listErr} filtered={filtered} />
        }
        ListFooterComponent={
          <ListFooter
            loading={loadingMore}
            error={moreErr}
            onRetry={() => {
              setMoreErr('');
              loadMore(true);
            }}
          />
        }
      />

      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Saldo awal baru"
            icon="plus"
            onPress={() => router.push('/saldo-awal/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The room leads, not the document number: somebody scanning this list is looking
 * for a *place* — "did we already open the main warehouse" — and the number is
 * what they read once they have found it.
 */
function SaldoAwalCard({
  row,
  first,
  last,
  onPress,
}: {
  row: SaldoAwalRow;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  const nilai = row.totalNilai === null ? null : formatUang(row.totalNilai);

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.namaRuang}, ${row.nomor}, ${nilai ?? 'belum diposting'}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.namaRuang || `Ruang #${row.idRuang}`}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {`${row.nomor} · ${formatTanggal(row.tanggal)}`}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {nilai ? (
            <Text style={styles.rowValue} numberOfLines={1}>
              {nilai}
            </Text>
          ) : null}
          <RamahBadge label={meta.label} tone={meta.tone} />
        </View>
      </Pressable>
    </View>
  );
}

function ListPlaceholder({
  loading,
  error,
  filtered,
}: {
  loading: boolean;
  error: string;
  filtered: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (error) return null;
  if (filtered) {
    return (
      <View style={styles.placeholder}>
        <RamahEmptySearch sub="Coba kata kunci lain, atau lepas filter statusnya." />
      </View>
    );
  }
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Belum ada saldo awal</Text>
      <Text style={styles.placeholderSub}>
        Dokumen ini untuk unit kerja yang baru migrasi dan sudah memegang barang di raknya.
      </Text>
    </View>
  );
}

function ListFooter({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
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

  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  chipRow: { gap: L.related, paddingRight: L.gutter },

  // Assembled row by row rather than with `RamahStackCard`: this list appends
  // pages, and wrapping every row in one element would give up windowing.
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

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center' },
  placeholderTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },

  footer: { paddingVertical: L.space4, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
