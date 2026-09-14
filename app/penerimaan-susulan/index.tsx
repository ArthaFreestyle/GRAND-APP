/**
 * Kiriman susulan — the list of follow-up deliveries.
 *
 * **The board does not draw this screen**, and that is worth knowing before
 * changing it. `Papan Layar.dc.html` runs the flow F1 → F2 → F3: a susulan is
 * started from the invoice that recorded the shortfall and ends on a
 * confirmation, and there is no index anywhere in the map. This list exists
 * anyway because the documents do — they have statuses, they wait for somebody
 * to post them, and "which susulan are still sitting in DIAJUKAN" is a question
 * the board's flow cannot answer at all. It is reached from Beranda's
 * "Lihat semua" sheet, never from the tab bar.
 *
 * So it is drawn the way this app draws a document list rather than the way the
 * board draws anything: search, the status filter, and paging are all
 * server-side. `GET /penerimaan-susulan` takes `page`, `size`, `search`,
 * `status`, `id_pembelian` and a date range.
 *
 * ## What a row says, and what it deliberately does not
 *
 * `search` matches **this** document's number or the source invoice's, and the
 * invoice's is the one that matters: a shortfall gets chased by the number
 * written on the delivery note, not by a number this document only received
 * after somebody typed it. So the row prints `atas PBL-…` and leaves its own
 * `PNS-…` for the detail — a field that is on every row and that nobody arrives
 * knowing is not a field.
 *
 * The one amount on the row is **not money owed**. A susulan adds stock and never
 * adds debt; `totalNilai` is what the late goods are worth going into inventory,
 * at the harga pokok the invoice already fixed. There is no payment status here
 * to print because there is no payment.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import Feather from '@expo/vector-icons/Feather';
import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahTileTone,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import type { StatusAlur } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { listSusulan, susulanBus, type SusulanRow } from '@/services/penerimaan-susulan';
import { useCanWrite } from '@/services/permissions';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | StatusAlur;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'DIAJUKAN', label: 'Diajukan' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

export default function PenerimaanSusulanListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('penerimaan-susulan');
  /**
   * Only the bottom inset. Top, left and right are paid by `_layout.tsx` outside
   * this screen; the bottom is the docked pill's, because there is no tab bar
   * under this section to pay it.
   */
  const insets = useSafeAreaInsets();
  /**
   * The docked control's bottom padding, keyboard included.
   *
   * Under edge-to-edge the Android window is not resized when the IME
   * opens, so a button sitting on the bottom edge is simply covered by it.
   * `useDockPadding` swaps the safe-area inset for the keyboard's height
   * while it is up — the two are alternatives, never a sum, because the
   * gesture bar that inset pays for is itself behind the keyboard.
   */
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [rows, setRows] = useState<SusulanRow[]>([]);
  const [listErr, setListErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Loading is **derived**, not stored — the shape `app/produk/index.tsx` uses
   * and the reason the `eslint-disable-next-line react-hooks/set-state-in-effect`
   * that used to sit on this screen's fetch effect is gone.
   *
   * The obvious version flips a `listLoading` boolean at the top of the effect,
   * which is a setState running synchronously inside one: React renders for the
   * new inputs, the effect fires, and the flag forces a second render before a
   * byte has been requested. Keeping "the key I want loaded" (built during
   * render) against "the key I have loaded" (written once when a read settles)
   * says the same thing without either the cascade or the risk that a stale
   * response un-sets a flag the next request just set.
   */
  const requestKey = `${search}|${status}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState('');
  const listLoading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await listSusulan({
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
        setListErr(messageOf(e, 'Gagal memuat daftar kiriman susulan.'));
      } finally {
        // Page one is what just landed, so any halted append belongs to a query
        // that no longer exists.
        if (alive) {
          setMoreErr('');
          setLoadedKey(requestKey);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [search, status, reloadToken, requestKey]);

  // What the detail did while this screen sat underneath it. A row left visible
  // under a chip it no longer matches is deliberate: silently vanishing the
  // record somebody just acted on reads as a bug, and the next reload settles it.
  useRecordBus(susulanBus, (change) => {
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
        const result = await listSusulan({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
        });
        // Offset paging, no cursor: a document posted while the reader scrolls
        // shifts the window and the same row can arrive twice.
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

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const openDetail = useCallback(
    (id: number) => {
      router.push({ pathname: '/penerimaan-susulan/[id]', params: { id } });
    },
    [router]
  );

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `back()` is offered to the
    // navigator containing the tabs first, which may answer by switching tabs.
    // The `replace` covers a cold deep link with nothing to pop.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: SusulanRow; index: number }) => (
      <SusulanCard
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
      <RamahHeader title="Kiriman susulan" onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nomor dokumen atau faktur asal"
            />
            {/* Horizontal rather than wrapped: five chips wrap to two rows on a
                ~354pt phone, and a filter row that changes height as it is used
                pushes the first record up and down under the reader's thumb. */}
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

      {/* One green pill, docked, with a verb in it — and it is the *secondary*
          way in on purpose. The primary one is the invoice that recorded the
          shortfall, which lands on the same form with the faktur already chosen;
          from here the form opens on an empty picker. */}
      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Kiriman susulan baru"
            icon="plus"
            onPress={() => router.push('/penerimaan-susulan/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One document, as a card.
 *
 * The supplier is the title because it is what somebody holding a delivery note
 * is looking for; the invoice number is the subtitle because it is what is
 * written on that note. The document's own number is on the detail — it is on
 * every row and nobody arrives knowing it.
 *
 * The status badge sits under the value rather than beside the title, so the
 * right-hand column reads as one answer: this much stock, in this state.
 */
function SusulanCard({
  row,
  first,
  last,
  onPress,
}: {
  row: SusulanRow;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  const nilai = formatRupiah(row.totalNilai);

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.namaSupplier || 'Tanpa pemasok'}, atas faktur ${row.nomorPembelian}, ${nilai}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.rowIcon}>
          <Feather name="truck" size={RamahIcon.row} color={RamahTileTone.laporan.ink} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.namaSupplier || '—'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {`atas ${row.nomorPembelian || '—'} · ${formatTanggal(row.tanggal)}`}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {nilai}
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
        {filtered ? 'Tidak ada yang cocok' : 'Belum ada kiriman susulan'}
      </Text>
      <Text style={styles.placeholderSub}>
        {filtered
          ? 'Coba kata kunci lain, atau lepas filter statusnya.'
          : 'Dokumen ini dibuat atas faktur pembelian yang sudah diposting dan kirimannya masih kurang. Biasanya dimulai dari faktur itu sendiri, bukan dari sini.'}
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
 * No top, left or right inset here: `app/penerimaan-susulan/_layout.tsx` pays all
 * three for the section, outside the navigator. The bottom is this screen's and
 * is read in the component — an inset is a runtime value and is often zero.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },

  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  chipRow: { gap: L.related, paddingRight: L.gutter },

  // The group card, assembled row by row rather than with `RamahStackCard`: this
  // list appends pages, and wrapping every row in one element would give up the
  // windowing a `FlatList` does. Each row draws the edges it owns.
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
    backgroundColor: RamahTileTone.laporan.tint,
  },
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
