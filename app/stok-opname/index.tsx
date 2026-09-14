/**
 * Stok opname — the sessions, and which rooms are frozen right now.
 *
 * **The list leads with the freeze, not with the count.** A `DRAFT` or
 * `DIAJUKAN` opname makes the `kartu_stok` trigger refuse every posting into its
 * room, from every module — a purchase, a sale at the till, a follow-up delivery.
 * So "which rooms are currently not accepting stock" is the question somebody
 * opens this screen with far more often than "what did we count in March", and
 * the two unfinished statuses are drawn as one group above everything else.
 *
 * That grouping is not a client-side invention: `status=DIAJUKAN` with
 * `terlama_dulu=true` is described in the contract as both the verification queue
 * *and* the list of rooms that have stopped working. This screen widens it by one
 * status, because a `DRAFT` freezes exactly as hard as a `DIAJUKAN` does and a
 * session abandoned in draft is the failure mode worth surfacing.
 *
 * ## Why two reads rather than one filtered list
 *
 * The endpoint takes one `status` at a time, and "unfinished" is two of them. A
 * single unfiltered read would work until the first page filled up with last
 * year's posted documents and pushed a frozen room off it — which is precisely
 * the row that must never be missed. So the open sessions are read on their own,
 * oldest first, and the rest of the history appends underneath.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahBadge,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listStokOpname, opnameBus, type OpnameRow } from '@/services/stok-opname';

const PAGE_SIZE = 20;

/**
 * How many open sessions are read in one go. A unit kerja with more than fifty
 * rooms frozen at once has a problem no list can help with, and the number is a
 * guard rather than a business limit.
 */
const TERBUKA_SIZE = 50;

type Entry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; row: OpnameRow; first: boolean; last: boolean };

export default function StokOpnameListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('opname');
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.cardGap);

  const [terbuka, setTerbuka] = useState<OpnameRow[]>([]);
  const [terbukaErr, setTerbukaErr] = useState('');

  const [riwayat, setRiwayat] = useState<OpnameRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');

  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = String(reloadToken);
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      /**
       * Three reads, settled rather than raced. `DRAFT` and `DIAJUKAN` are two
       * requests because the endpoint takes one status at a time; the history is
       * the third, unfiltered, and the open rows are subtracted from it so a
       * frozen room is not drawn twice.
       */
      const [draft, diajukan, semua] = await Promise.allSettled([
        listStokOpname({ status: 'DRAFT', size: TERBUKA_SIZE, terlama_dulu: true }),
        listStokOpname({ status: 'DIAJUKAN', size: TERBUKA_SIZE, terlama_dulu: true }),
        listStokOpname({ page: 1, size: PAGE_SIZE }),
      ]);
      if (!alive) return;

      if (draft.status === 'fulfilled' && diajukan.status === 'fulfilled') {
        // Oldest first inside each status already; merged by open date so the
        // room that has been stuck longest is the top row overall.
        const merged = [...draft.value.data, ...diajukan.value.data].sort((a, b) =>
          a.tglBuka < b.tglBuka ? -1 : a.tglBuka > b.tglBuka ? 1 : 0
        );
        setTerbuka(merged);
        setTerbukaErr('');
      } else {
        setTerbuka([]);
        setTerbukaErr('Sesi yang sedang berjalan tidak terbaca, jadi ruang yang beku belum tentu terlihat di sini.');
      }

      if (semua.status === 'fulfilled') {
        setRiwayat(semua.value.data);
        setPage(1);
        setHasMore(Math.max(1, semua.value.paging.total_page ?? 1) > 1);
        setListErr('');
      } else {
        setRiwayat([]);
        setHasMore(false);
        setListErr(messageOf(semua.reason, 'Gagal memuat riwayat stok opname.'));
      }

      setMoreErr('');
      setLoadedKey(requestKey);
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken, requestKey]);

  /**
   * A transition on the detail changes which group a document belongs to — a
   * posting takes it out of "berjalan" entirely — so the whole screen re-reads
   * rather than patching a row into the wrong list.
   */
  useRecordBus(opnameBus, () => reload());

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listStokOpname({ page: next, size: PAGE_SIZE });
        setRiwayat((list) => {
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
    [loadingMore, loading, hasMore, moreErr, page]
  );

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const push = (label: string, rows: OpnameRow[]) => {
      if (rows.length === 0) return;
      out.push({ kind: 'header', key: `h-${label}`, label });
      rows.forEach((row, i) =>
        out.push({
          kind: 'row',
          key: `r-${row.id}`,
          row,
          first: i === 0,
          last: i === rows.length - 1,
        })
      );
    };
    push('Sedang berjalan · gudang beku', terbuka);
    // The open rows are already drawn above; showing them again under "Riwayat"
    // would make one frozen room look like two documents.
    const idsTerbuka = new Set(terbuka.map((r) => r.id));
    push('Riwayat', riwayat.filter((r) => !idsTerbuka.has(r.id)));
    return out;
  }, [terbuka, riwayat]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === 'header') return <RamahSectionHeader>{item.label}</RamahSectionHeader>;
      return (
        <OpnameRowCard
          row={item.row}
          first={item.first}
          last={item.last}
          onPress={() =>
            router.push({ pathname: '/stok-opname/[id]', params: { id: item.row.id } })
          }
        />
      );
    },
    [router]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Stok opname" onBack={goBack} />

      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderEntry}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            {terbukaErr ? <RamahInlineError message={terbukaErr} onRetry={reload} /> : null}
            {terbuka.length ? (
              <RamahNote icon="alert-circle">
                {`${terbuka.length} gudang sedang dihitung. Selama sesinya belum diposting atau dibatalkan, tidak ada pembelian, penjualan atau kiriman susulan yang bisa diposting ke gudang itu.`}
              </RamahNote>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          listErr ? (
            <RamahInlineError message={listErr} onRetry={reload} />
          ) : loading ? (
            <View style={styles.placeholder}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                Belum pernah ada hitung fisik di unit kerja ini.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />

      {/* Absent rather than disabled for a grant that cannot open one — a
          permanently dead button is a promise the session cannot keep. */}
      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Buka sesi hitung"
            icon="plus"
            onPress={() => router.push('/stok-opname/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

function OpnameRowCard({
  row,
  first,
  last,
  onPress,
}: {
  row: OpnameRow;
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
        accessibilityLabel={`${row.nomor}, ${row.namaRuang}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.grow}>
          {/* The room leads, not the document number. Somebody scanning this
              list is looking for a *place* — "is the main warehouse frozen" —
              and the SO number is what they read once they have found it. */}
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.namaRuang || `Ruang #${row.idRuang}`}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {`${row.nomor} · dibuka ${formatTanggal(row.tglBuka)}`}
          </Text>
        </View>
        <RamahBadge label={meta.label} tone={meta.tone} />
      </Pressable>
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
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.cardGap },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: {
    borderBottomLeftRadius: R.card,
    borderBottomRightRadius: R.card,
    marginBottom: L.groupGap,
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.grey50 },
  rowTitle: { ...T.rowTitle, color: C.textTitle },
  rowSub: { ...T.caption, color: C.textBody },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.caption, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.cardGap,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
