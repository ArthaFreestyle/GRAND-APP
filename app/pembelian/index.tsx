/**
 * Pembelian — the list of purchase documents.
 *
 * Search, both status filters, and paging are server-side: `GET /pembelian`
 * takes `page`, `size`, `search`, `status`, `status_penerimaan`, `id_supplier`,
 * and a date range. `search` matches the document number **or** the supplier's
 * invoice number — not the supplier's name, which the old in-memory filter did
 * match and this one honestly cannot.
 *
 * **The chips are the document's own status.** They used to read
 * "lunas / belum lunas", computed from a `dibayar` column that the contract does
 * not have: money out is `/pembayaran-utang`, a separate document group with its
 * own allocations and posting. What a pembelian knows about payment is the
 * server-side `status_pembayaran` cache, which rides along as a field.
 *
 * **The three KPI tiles are gone.** "Total hutang berjalan" summed the whole
 * seeded dataset; a paged endpoint hands over twenty rows and a count, and
 * summing those would put a confident rupiah figure on screen that means the
 * page rather than the books. The supplier detail has the real balance, one
 * supplier at a time, from `GET /supplier/{id}/utang`.
 *
 * **"Perlu diurus" (issue #26) is a real answer, not a KPI.** The guide's
 * "angka dulu, aksi sesudahnya" principle asks this list to answer, inside
 * three seconds, "ada faktur yang menunggu saya?" — so the card at the top
 * carries the three counts the contract can actually answer honestly, each a
 * `size=1` read via `getPembelianCounts()` (shared with Beranda's own
 * "Menunggu persetujuan" metric, so the two screens cannot disagree about that
 * number): draf, menunggu posting, dan kiriman kurang. Tapping one sets the
 * matching filter below it, which is what let the "kiriman" chip row go —
 * `terima` is still a real filter, just driven from the card instead of a
 * second row of chips nine readers out of ten never touched.
 *
 * The issue leaves one thing to decide — whether SUPERADMIN sees "Menunggu
 * posting" first, since that count is the one *they* clear. This keeps the
 * order identical for every role instead: CLAUDE.md already decided the same
 * question for Beranda ("two people at the same counter should see the same
 * screen and be able to talk about it"), and a reordered card is one more
 * thing a gudang and a supervisor standing at the same desk cannot point at
 * together.
 *
 * **The table is gone too.** Four fixed columns wanted 880pt; a phone has ~354.
 * Ported to Ramah alongside `app/penerimaan-susulan/index.tsx`, which this
 * screen now matches shape for shape: a docked green pill, cards assembled row
 * by row rather than through `RamahStackCard` (this list appends pages, and
 * wrapping every row in one element would give up the windowing a `FlatList`
 * does), and a second caption line that prints only what is actually worth
 * chasing — a short delivery, an unpaid POSTED invoice — rather than repeating
 * "Diterima lengkap" or "Lunas" on rows where it says nothing.
 *
 * **This section sits beside the tabs, not inside them — see `_layout.tsx`.**
 * It was the third tab root until this screen's own docked pill turned up
 * sitting under the bar rather than above it, and Beranda's "Pembelian" tile
 * was already a second, redundant door to the same place. Reached now the way
 * Katalog is: pushed from Beranda, with a back arrow rather than a tab.
 *
 * Opening a document and creating one are routes (`[id]` and `baru`), so this
 * screen keeps its rows, its pages, and its scroll while either is on top of it.
 * What happens up there arrives over `pembelianBus`.
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
import Feather from '@expo/vector-icons/Feather';

import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import { BAYAR_META, DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatNumber, formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahTileTone,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import {
  getPembelianCounts,
  listPembelian,
  pembelianBus,
  type PembelianCounts,
  type PembelianRow,
  type StatusDokumen,
  type StatusPenerimaan,
} from '@/services/pembelian';
import { useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusDokumen;
type TerimaFilter = 'semua' | StatusPenerimaan;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'DIAJUKAN', label: 'Diajukan' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

export default function PembelianListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('pembelian');
  /**
   * Only the bottom inset here — `_layout.tsx` pays top, left and right outside
   * this screen, the same box `produk` and `pengaturan` use. `useDockPadding`
   * swaps it for the keyboard's height while the IME is up, because under
   * edge-to-edge Android does not resize the window for it and the two are
   * alternatives, never a sum.
   */
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.cardGap);

  const [rows, setRows] = useState<PembelianRow[]>([]);
  const [listErr, setListErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [terima, setTerima] = useState<TerimaFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Loading is derived — "the key I want loaded" against "the key I have
   * loaded" — the shape `app/produk/index.tsx` established, rather than a
   * `setLoading(true)` written at the top of the fetch effect. That used to
   * carry an `eslint-disable-next-line react-hooks/set-state-in-effect` here,
   * queued for exactly this port.
   */
  const requestKey = `${search}|${status}|${terima}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState('');
  const listLoading = loadedKey !== requestKey;

  const reloadList = useCallback(() => setReloadToken((n) => n + 1), []);

  /**
   * The "Perlu diurus" card's own three counts, on a token independent of the
   * search/status/terima filters below it — the card answers the same
   * question no matter what the list is currently filtered to. Tied to the
   * same `RefreshControl` and record bus as the list, so a pull-to-refresh or
   * a document changing elsewhere re-reads both together.
   */
  const [countsToken, setCountsToken] = useState(0);
  const [counts, setCounts] = useState<PembelianCounts | null>(null);
  const [countsReadAt, setCountsReadAt] = useState<Date | null>(null);
  const [countsLoadedToken, setCountsLoadedToken] = useState(-1);
  const countsLoading = countsLoadedToken !== countsToken;
  const reloadCounts = useCallback(() => setCountsToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    getPembelianCounts().then((c) => {
      if (!alive) return;
      setCounts(c);
      setCountsReadAt(new Date());
      setCountsLoadedToken(countsToken);
    });
    return () => {
      alive = false;
    };
  }, [countsToken]);

  // The pull spinner just mirrors `listLoading` rather than tracking its own
  // "did a manual refresh land yet" flag — a filter chip tapped mid-pull would
  // otherwise leave a `refreshing` boolean nothing ever clears.
  const onRefresh = useCallback(() => {
    reloadList();
    reloadCounts();
  }, [reloadList, reloadCounts]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await listPembelian({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
          statusPenerimaan: terima === 'semua' ? undefined : terima,
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
        setListErr(messageOf(e, 'Gagal memuat daftar pembelian.'));
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
  }, [search, status, terima, reloadToken, requestKey]);

  // What the detail did while this screen sat underneath it. A posted or
  // cancelled document is patched into the rows already on screen; a new one
  // could be anywhere in a list sorted by date, so it re-reads.
  //
  // A patch can leave a row that no longer belongs under the active chip — a
  // draft submitted while "Draft" is selected. It is left visible on purpose:
  // silently vanishing the record someone just acted on reads as a bug, and the
  // next reload settles it honestly.
  useRecordBus(pembelianBus, (change) => {
    // Any change to any document can move the three counts — a submission
    // leaves DRAFT, a posting can leave a short line behind — so every event
    // re-reads them, not only a full-list "reload".
    reloadCounts();
    if (change.kind === 'reload') {
      reloadList();
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
        const result = await listPembelian({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
          statusPenerimaan: terima === 'semua' ? undefined : terima,
        });
        // Offset paging, no cursor: a document posted while the reader is
        // scrolling shifts the window and the same row can arrive twice.
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
    [loadingMore, listLoading, hasMore, moreErr, page, search, status, terima]
  );

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/pembelian/[id]', params: { id } });
    },
    [router]
  );

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `back()` is offered to
    // whatever navigator sits above it first, which for a section pushed over
    // the tabs may answer by switching tabs instead of popping this screen.
    // The `replace` covers a cold deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: PembelianRow; index: number }) => (
      <PembelianCard
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={openDetail}
      />
    ),
    [rows.length, openDetail]
  );

  const filtered = search !== '' || status !== 'semua' || terima !== 'semua';

  /** What each count of "Perlu diurus" filters the list to, when pressed. */
  const pilihPerlu = (target: 'draft' | 'diajukan' | 'kurang') => {
    setStatus(target === 'draft' ? 'DRAFT' : target === 'diajukan' ? 'DIAJUKAN' : 'POSTED');
    setTerima(target === 'kurang' ? 'KURANG' : 'semua');
  };

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pembelian" onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        // Only after the first page has actually landed — otherwise the pull
        // spinner and the empty placeholder's own `ActivityIndicator` show at
        // once for the very first read.
        refreshControl={
          <RefreshControl
            refreshing={rows.length > 0 && listLoading}
            onRefresh={onRefresh}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }
        ListHeaderComponent={
          <View style={styles.controls}>
            {/* "Perlu diurus" (issue #26): the three-second question this list
                answers before anything else — is there a faktur waiting on me,
                for one of the three reasons the contract can actually answer.
                Each count is real `total_item`, from `getPembelianCounts()`
                (shared with Beranda), never summed from the page already on
                screen. Tapping one sets the filter it names. */}
            <View style={styles.needCard}>
              <View style={styles.needRow}>
                <NeedCell
                  label="Draf"
                  value={counts && counts.draft >= 0 ? counts.draft : null}
                  selected={status === 'DRAFT' && terima === 'semua'}
                  onPress={() => pilihPerlu('draft')}
                />
                <View style={styles.needDivider} />
                <NeedCell
                  label="Menunggu posting"
                  value={counts && counts.menungguPosting >= 0 ? counts.menungguPosting : null}
                  selected={status === 'DIAJUKAN' && terima === 'semua'}
                  onPress={() => pilihPerlu('diajukan')}
                />
                <View style={styles.needDivider} />
                <NeedCell
                  label="Kiriman kurang"
                  value={counts && counts.kirimanKurang >= 0 ? counts.kirimanKurang : null}
                  selected={status === 'POSTED' && terima === 'KURANG'}
                  onPress={() => pilihPerlu('kurang')}
                />
              </View>
              <Pressable
                onPress={reloadCounts}
                accessibilityRole="button"
                accessibilityLabel="Muat ulang hitungan"
                style={styles.needFoot}>
                <Text style={styles.needFootText}>
                  {countsReadAt ? `Terakhir update: ${stempelPembaruan(countsReadAt)}` : 'Membaca…'}
                </Text>
                {countsLoading ? (
                  <ActivityIndicator color={C.iconMuted} size="small" />
                ) : (
                  <Feather name="refresh-cw" size={RamahIcon.meta} color={C.iconMuted} />
                )}
              </Pressable>
            </View>

            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nomor dokumen atau no. faktur supplier"
            />
            {/* One row of status chips. The "kiriman" row is gone — its one
                query anyone actually used, `KURANG`, is now the "Kiriman
                kurang" count above, which sets `terima` itself. */}
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
            {listErr ? <RamahInlineError message={listErr} onRetry={reloadList} /> : null}
          </View>
        }
        ListEmptyComponent={
          <ListPlaceholder loading={listLoading} error={listErr} filtered={filtered} />
        }
        ListFooterComponent={
          <ListFooter
            loading={loadingMore}
            error={moreErr}
            onRetry={() => loadMore(true)}
          />
        }
      />

      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Faktur baru"
            icon="plus"
            onPress={() => router.push('/pembelian/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One count of the "Perlu diurus" card. `value: null` covers both "still
 * reading" and "could not be read" — an em dash either way, distinct from a
 * real zero, which is shown plainly: zero waiting is an answer, not a gap to
 * hide. `selected` marks whichever count the list below is currently filtered
 * to, so the card and the chip row never quietly disagree.
 */
function NeedCell({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${value === null ? 'tidak terbaca' : value}. Saring daftar`}
      style={[styles.needCell, down && styles.needCellDown]}>
      <Text style={styles.needLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.needValue}>{value === null ? '—' : formatNumber(value)}</Text>
    </Pressable>
  );
}

/**
 * One document, as a card.
 *
 * The supplier is the title because that is what anyone hunting a paper
 * invoice on a desk actually remembers; the document number and the date are
 * the line under it, along with the supplier's own invoice number when there
 * is one — the other thing that gets matched against paper.
 *
 * The second caption line is the layout-economy rule applied to this row:
 * "Diterima lengkap" on nine rows out of ten is a column that says nothing, so
 * it prints only when there is something to chase — a short delivery, or an
 * invoice that has been posted and is not yet settled.
 */
function PembelianCard({
  row,
  first,
  last,
  onPress,
}: {
  row: PembelianRow;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  const total = formatRupiah(decimalToNumber(row.total));

  const catatan: string[] = [];
  if (row.statusTerima === 'KURANG') catatan.push('Kiriman kurang');
  if (row.status === 'POSTED' && row.statusBayar !== 'LUNAS') {
    catatan.push(BAYAR_META[row.statusBayar].label);
  }

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.namaSupplier || 'Tanpa pemasok'}, ${row.nomor}, ${total}, ${meta.label}${
          catatan.length ? `, ${catatan.join(', ')}` : ''
        }`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.rowIcon}>
          <Feather name="file-text" size={RamahIcon.row} color={RamahTileTone.dokumen.ink} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.namaSupplier || '—'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {`${row.nomor} · ${formatTanggal(row.tanggal)}${
              row.noFakturSupplier ? ` · faktur ${row.noFakturSupplier}` : ''
            }`}
          </Text>
          {catatan.length ? (
            <Text style={styles.rowNote} numberOfLines={1}>
              {catatan.join(' · ')}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {total}
          </Text>
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
  // The error already has its own line above the list, with the retry on it.
  if (error) return null;
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>
        {filtered ? 'Tidak ada yang cocok' : 'Belum ada faktur pembelian'}
      </Text>
      <Text style={styles.placeholderSub}>
        {filtered
          ? 'Coba kata kunci lain, atau lepas filternya.'
          : 'Dokumen pembelian yang dibuat di unit kerja sesi ini akan terdaftar di sini.'}
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

/**
 * No top, left or right inset here: `_layout.tsx` pays all three for the
 * section, outside the navigator. The bottom is this screen's own and is read
 * in the component — an inset is a runtime value and is often zero.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },

  controls: { gap: L.cardGap, paddingTop: L.space1, paddingBottom: L.cardGap },
  chipRow: { gap: 10, paddingRight: L.gutter },

  // The "Perlu diurus" card, the same white-card-over-hairline shape Beranda's
  // own two-metric card uses, extended to three counts with a divider between
  // each rather than just one.
  needCard: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  needRow: { flexDirection: 'row', padding: L.cardPad, gap: L.metricGap },
  needCell: { flex: 1, minWidth: 0, gap: 6 },
  needCellDown: { opacity: 0.7 },
  needDivider: { width: 1, backgroundColor: C.borderHairline },
  needLabel: { ...T.caption, color: C.textBody },
  needValue: { ...T.metric, color: C.textTitle },
  needFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingVertical: 11,
    paddingHorizontal: L.cardPad,
    backgroundColor: C.grey50,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  needFootText: { ...T.caption, color: C.textMuted },

  // The group card, assembled row by row rather than with `RamahStackCard`:
  // this list appends pages, and wrapping every row in one element would give
  // up the windowing a `FlatList` does. Each row draws the edges it owns.
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
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RamahTileTone.dokumen.tint,
  },
  rowTitle: { ...T.rowTitle, color: C.textTitle },
  rowSub: { ...T.caption, color: C.textMuted, marginTop: 2 },
  rowNote: { ...T.caption, color: C.orange600, marginTop: 2 },
  rowRight: { flexShrink: 0, maxWidth: 148, alignItems: 'flex-end', gap: 6 },
  rowValue: { ...T.rowTitle, color: C.textTitle, textAlign: 'right' },

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center' },
  placeholderTitle: { ...T.groupTitle, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.caption, color: C.textBody, textAlign: 'center' },

  footer: { paddingVertical: L.space4, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: 10,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
