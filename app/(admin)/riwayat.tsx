/**
 * Riwayat — tab 4 of the five-tab bar (issue #25): every nota penjualan,
 * grouped by day.
 *
 * `GET /penjualan` already has everything this screen reads by —
 * `tanggal_dari`/`tanggal_sampai`, `status`, `search` matching the document
 * number — so nothing new was needed on the contract for the list itself.
 * Search, the status chips and paging are all server-side, the same shape
 * `app/pembelian/index.tsx` already established for the sibling document
 * group.
 *
 * ## Why this grouping is careful about something the contract does not say
 *
 * `GET /pembelian` documents its own order in as many words — `tanggal DESC,
 * id DESC`, with the reason spelled out (no tie-breaker means one row can
 * repeat across two pages and another never appear at all). **`GET /penjualan`
 * carries no such line.** Heading an appended, paged list by calendar day is
 * only honest if two rows of the same day are guaranteed to arrive next to
 * each other — otherwise "Senin, 14 Sep" can print twice, with unrelated days
 * in between, and a reader has no way to know the second one is not a bug.
 *
 * So the grouping below is deliberately **not** a global group-by: it draws
 * one heading only for a run of *consecutive* rows sharing a calendar day, the
 * same way `app/produk/index.tsx` flattens rows with their headings rather
 * than trusting `RamahStackCard` to own the whole group. If the server's real
 * order ever lets the same day resurface later in the list, this prints a
 * second "Senin, 14 Sep" heading rather than silently merging two runs that
 * were never actually adjacent — a heading that reappears is a visible, honest
 * fact about the data; two runs quietly collapsed into one would be a claim
 * about ordering this screen cannot back up. Ask the contract to document
 * `GET /penjualan`'s order the way `GET /pembelian` already does, then this
 * can group globally and print a wider "Senin, 14 Sep — 3 nota" heading if
 * that turns out to be worth the extra query per page it would still need.
 *
 * **No per-day subtotal**, for the same reason: a sum is only honest once every
 * row of that day is known to be in hand, and an appended list can always have
 * more of today's rows sitting on a page not yet fetched. The issue that asked
 * for this screen names the fallback explicitly — read it from `laba-kotor` per
 * day, or do not show it — and `app/(admin)/pendapatan.tsx` is exactly that
 * per-day read; this list does not repeat it.
 *
 * ## DRAFT never appears here
 *
 * The chips are Semua / POSTED / BATAL — three, not four. `GET /penjualan`'s
 * `status` parameter takes one value, so "Semua" has to mean "no status sent",
 * which the server would still answer with DRAFT rows mixed in: a nota created
 * at the till but never posted, most often because a connection dropped
 * between the two calls `app/(admin)/kasir.tsx` makes to finish a sale (see
 * its own `draftId` note). That is not history yet — it is unfinished work at
 * the counter — so every row this screen renders is filtered to POSTED or
 * BATAL regardless of which chip is selected, client-side, after the request.
 * A DRAFT is still reachable by pressing "Coba posting lagi" back at the till
 * that made it, or — for whoever remembers its `nomor` — by opening
 * `/penjualan/[id]` directly, which shows every transition the active grant's
 * `AKSI` table actually allows for whatever status it finds.
 *
 * ## Where a row goes, and why it is not inside this tab
 *
 * A row pushes `/penjualan/[id]`, a section on the **root stack** beside the
 * tabs, not a route inside this one. Every tab in `(admin)` mounts eagerly and
 * keeps its own place in the navigator, so pushing a detail *inside* a tab
 * would land it on top of that tab's own history — CLAUDE.md's "Eager mounting
 * also changes where back goes" is written out in full for exactly this shape.
 * Because `/penjualan/[id]` sits outside `(admin)` entirely, `router.push`
 * always pushes it onto the stack that contains the tab bar, on top of
 * whichever tab is currently showing — so back lands exactly back on Riwayat.
 *
 * Posting at the till publishes `penjualanBus`'s `reload` (see
 * `app/(admin)/kasir.tsx`'s `selesai()`), and a cancellation from the detail
 * publishes `saved` with the row it changed — this screen answers both, the
 * same split `app/pembelian/index.tsx` already uses.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahBadge,
  RamahChip,
  RamahEmptySearch,
  RamahInlineError,
  RamahSearchField,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahTileTone,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { listPenjualan, penjualanBus, type PenjualanRow } from '@/services/penjualan';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = 'semua' | 'POSTED' | 'BATAL';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'BATAL', label: 'Batal' },
];

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function tanggalLokal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function labelHari(tanggal: string, hariIni: string): string {
  if (tanggal === hariIni) return 'Hari ini';
  const [y, m, d] = tanggal.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]}`;
}

function formatJam(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The list, flattened with its own day headings — the same shape
 * `app/produk/index.tsx`'s `Entry` uses, for the same reason: `RamahStackCard`
 * wraps its children, which would mean holding an unbounded appended list in
 * one element and giving up the windowing a `FlatList` does.
 */
type Entry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; row: PenjualanRow; first: boolean; last: boolean };

/**
 * One heading per **run** of consecutive same-day rows, not one per distinct
 * day — see the file header on why a global group-by is not honest here
 * without a documented sort on `GET /penjualan`.
 */
function toEntries(rows: PenjualanRow[]): Entry[] {
  const out: Entry[] = [];
  let runStart = 0;
  for (let i = 0; i <= rows.length; i++) {
    const sameDay = i < rows.length && rows[i].tanggal.slice(0, 10) === rows[runStart]?.tanggal.slice(0, 10);
    if (i < rows.length && sameDay) continue;
    if (i > runStart) {
      const day = rows[runStart].tanggal.slice(0, 10);
      out.push({ kind: 'header', key: `h-${runStart}-${day}`, label: day });
      for (let j = runStart; j < i; j++) {
        out.push({ kind: 'row', key: `r-${rows[j].id}`, row: rows[j], first: j === runStart, last: j === i - 1 });
      }
    }
    runStart = i;
  }
  return out;
}

export default function RiwayatScreen() {
  const router = useRouter();
  const hariIni = tanggalLokal(new Date());

  const [rows, setRows] = useState<PenjualanRow[]>([]);
  const [listErr, setListErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('semua');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

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
        const result = await listPenjualan({
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
        setListErr(messageOf(e, 'Gagal memuat riwayat penjualan.'));
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
  }, [search, status, reloadToken, requestKey]);

  // A posting at the till (`app/(admin)/kasir.tsx`) has no row to patch — it is
  // a new document, possibly the start of a new day's run — so it re-reads. A
  // cancellation from the detail patches the one row in place and keeps scroll.
  useRecordBus(penjualanBus, (change) => {
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
        const result = await listPenjualan({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          status: status === 'semua' ? undefined : status,
        });
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
    (id: number) => {
      router.push({ pathname: '/penjualan/[id]', params: { id } });
    },
    [router]
  );

  // DRAFT is never history — see the file header. Filtered after the request
  // rather than asked for by query, because `status` on `GET /penjualan` takes
  // one value and cannot express "anything but DRAFT".
  const finished = useMemo(() => rows.filter((r) => r.status !== 'DRAFT'), [rows]);
  const entries = useMemo(() => toEntries(finished), [finished]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) =>
      item.kind === 'header' ? (
        <View style={styles.listHeading}>
          <RamahSectionHeader>{labelHari(item.label, hariIni)}</RamahSectionHeader>
        </View>
      ) : (
        <RiwayatRow row={item.row} first={item.first} last={item.last} onPress={openDetail} />
      ),
    [openDetail, hariIni]
  );

  const filtered = search !== '' || status !== 'semua';

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderEntry}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <Text style={styles.title}>Riwayat</Text>
            <RamahSearchField value={query} onChangeText={setQuery} placeholder="Cari nomor nota" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chipRow}>
              {STATUS_OPTIONS.map((o) => (
                <RamahChip key={o.key} label={o.label} selected={status === o.key} onPress={() => setStatus(o.key)} />
              ))}
            </ScrollView>
            {listErr ? <RamahInlineError message={listErr} onRetry={reload} /> : null}
          </View>
        }
        ListEmptyComponent={<ListPlaceholder loading={listLoading} error={listErr} filtered={filtered} />}
        ListFooterComponent={<ListFooter loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />
    </View>
  );
}

/**
 * One nota, as a card. The supplier-equivalent title is the customer's name
 * when a KREDIT note has one; a cash note at the counter almost never does,
 * so the number and the time carry the row instead.
 */
function RiwayatRow({
  row,
  first,
  last,
  onPress,
}: {
  row: PenjualanRow;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const meta = DOKUMEN_RAMAH[row.status];
  const total = formatRupiah(decimalToNumber(row.total));
  const judul = row.namaPelanggan || row.nomor;
  const subtitle = row.namaPelanggan
    ? `${row.nomor} · ${formatJam(row.tanggal)}`
    : `${formatJam(row.tanggal)} · ${row.jenis === 'KREDIT' ? 'Kredit' : 'Tunai'}`;

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${judul}, ${total}, ${meta.label}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.rowIcon}>
          <Feather name="shopping-bag" size={RamahIcon.row} color={RamahTileTone.dokumen.ink} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {judul}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
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

function ListPlaceholder({ loading, error, filtered }: { loading: boolean; error: string; filtered: boolean }) {
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
        <RamahEmptySearch sub="Coba kata kunci lain, atau lepas filternya." />
      </View>
    );
  }
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Belum ada nota</Text>
      <Text style={styles.placeholderSub}>
        Nota yang diposting dari kasir di unit kerja sesi ini akan terdaftar di sini.
      </Text>
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

/**
 * No safe-area padding: this is a tab root, and `app/(admin)/_layout.tsx`
 * pads top and sides outside the navigator while the native bar owns the
 * bottom edge itself.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },

  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  title: { ...T.titleModerate, color: C.textTitle },
  chipRow: { gap: L.related, paddingRight: L.gutter },

  card: {
    backgroundColor: C.surfaceCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  cardFirst: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: R.card,
    borderBottomRightRadius: R.card,
    marginBottom: L.stack,
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  // A day opens a group: `group` above it (this, plus the `stack` the day
  // before leaves under its last row) and `related` down to its own notas.
  listHeading: { paddingTop: L.group - L.stack, paddingBottom: L.related },

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
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  rowRight: { flexShrink: 0, maxWidth: 148, alignItems: 'flex-end', gap: L.inline },
  rowValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right' },

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center' },
  placeholderTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },

  footer: { paddingVertical: L.space4, alignItems: 'center' },
});
