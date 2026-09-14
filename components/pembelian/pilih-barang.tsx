/**
 * E1 of `Papan Layar.dc.html` — "Stok minimum", drawn as `LayarGudang.dc.html`
 * draws it at `screen: 'minimum'`, and the screen `Papan Layar OCR.dc.html`
 * adds its new entry point to.
 *
 * **One question: what do I need to buy, and how much of it.** The reorder queue
 * comes from `GET /product/stok-minimum`, which *is* the definition of "below
 * minimum" — membership in that list, not a comparison this screen makes. It is
 * pre-sorted worst-first and never includes a product still at the
 * `stok_minimum = 0` default, because zero is the column default meaning "not
 * set" rather than "may run out".
 *
 * ## The green card at the top is the OCR board's whole contribution to E1
 *
 * `Papan Layar OCR.dc.html` adds one element to this screen and nothing else:
 * a card that opens the photo step. Its own note says the card "bypasses the
 * list" — with OCR the lines would come off the faktur and no box here would
 * need ticking. Without `/ocr/faktur` it cannot bypass anything, so it does the
 * honest version of the same thing: the photos are collected, they ride along
 * with the flow, and they end up attached to the nota this screen is on its way
 * to creating. The card says how many pages it is holding once it holds any,
 * because a flow carrying three photographs invisibly is a flow that loses them.
 *
 * ## Quantity is the shortfall, and that is a decision the board explains
 *
 * A checked row fills with `selisih` — `stok_minimum - total_stok` — not with a
 * reorder suggestion, because **no endpoint carries one**. The board says this
 * outright ("bukan angka saran: data itu tidak ada di API"), and inventing an
 * economic order quantity to fill the field would be a number somebody acts on.
 *
 * ## What appending pages costs here, stated rather than hidden
 *
 * The two group headings partition *what is loaded*. The queue is sorted by
 * shortfall, so the worst rows are on page one and the grouping only ever
 * re-files rows already in hand — but a product whose stock is zero while its
 * shortfall is small sits further down the list than the heading "Habis"
 * suggests, and is not under it until its page is.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  RamahChip,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { listStokMinimum, type StokMinimumRow } from '@/services/produk';
import type { RuangRow } from '@/services/ruang';

/** One line of the nota being assembled, as this flow carries it. */
export interface BarangDipilih {
  id: number;
  nama: string;
  /**
   * In **base units**, always. `stok_minimum`, `total_stok` and `selisih` are
   * all counted in the product's base unit, so the shortfall this is seeded
   * from is too — and the line is later sent against `id_satuan_dasar` for the
   * same reason. Sending the shortfall against a DUS of twelve would order
   * twelve times what was asked for.
   */
  qty: number;
  /**
   * `id_satuan_dasar`, resolved by the flow with one `GET /product/{id}` when
   * the row is ticked. Zero until that answers: `StokMinimum` carries no unit
   * at all, and no endpoint in the contract reports the base unit for a set of
   * arbitrary product ids in one read.
   */
  idSatuanDasar: number;
  /** Empty until the same read answers; the stepper says "satuan dasar" meanwhile. */
  namaSatuanDasar: string;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

/** The list, flattened — same reasoning as `app/produk/index.tsx`'s `Entry`. */
type Entry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; row: StokMinimumRow; first: boolean; last: boolean };

export function PilihBarangStep({
  ruangList,
  ruangId,
  onPickRuang,
  ruangErr,
  selection,
  onToggle,
  onQty,
  jumlahHalaman,
  onFoto,
  onBack,
  onLanjut,
  dockPad,
}: {
  ruangList: readonly RuangRow[];
  ruangId: number | null;
  onPickRuang: (id: number) => void;
  ruangErr: string;
  selection: ReadonlyMap<number, BarangDipilih>;
  onToggle: (row: StokMinimumRow) => void;
  onQty: (id: number, qty: number) => void;
  jumlahHalaman: number;
  onFoto: () => void;
  onBack: () => void;
  onLanjut: () => void;
  dockPad: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [rows, setRows] = useState<StokMinimumRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  /**
   * Loading is derived, never stored: the key the screen *wants* loaded is built
   * during render, the key it *has* loaded is written once when a read settles,
   * and the spinner is the two disagreeing. A `setLoading(true)` at the head of
   * the fetch effect is what `react-hooks/set-state-in-effect` promotes to an
   * error, and the rule is right — it forces a second render before a byte has
   * been asked for, and a stale response can un-set a flag the next request just
   * set. `app/produk/index.tsx` is where this shape was worked out.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = ruangId === null ? '' : `${ruangId}|${search}|${reloadToken}`;
  const loading = ruangId !== null && loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // The endpoint filters in SQL — `search` was added to it on this branch — so
  // the field is debounced rather than filtering an array a few pages deep,
  // which would only ever find the items that happened to be loaded.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (ruangId === null) return;
    let alive = true;
    (async () => {
      try {
        const answer = await listStokMinimum({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          id_ruang: ruangId,
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
        setListErr(messageOf(e, 'Gagal memuat daftar stok minimum.'));
      } finally {
        if (!alive) return;
        // Page one is what just landed, so any halted append belongs to a query
        // that no longer exists.
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ruangId, search, reloadToken, requestKey]);

  /**
   * `onEndReached` fires more than once on one approach, so the in-flight flag
   * is the guard and the threshold is not one. A failed page halts the loop
   * behind a "Coba lagi" rather than a spinner that never ends.
   */
  const loadMore = useCallback(
    async (force = false) => {
      if (ruangId === null || loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listStokMinimum({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          id_ruang: ruangId,
        });
        // Paging is offset-based with no cursor, so a posting that lands while
        // somebody is scrolling shifts the window and the same row can arrive
        // twice. Merging by id keeps that from becoming a duplicate key.
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
    [ruangId, loadingMore, loading, hasMore, moreErr, page, search]
  );

  const entries = useMemo<Entry[]>(() => {
    const groups = [
      { label: 'Habis', rows: rows.filter((r) => r.totalStok <= 0) },
      { label: 'Di bawah minimum', rows: rows.filter((r) => r.totalStok > 0) },
    ];
    const out: Entry[] = [];
    for (const g of groups) {
      // An empty group is dropped rather than drawn as a heading over nothing:
      // "Habis" with no rows under it reads as a list that failed to render.
      if (g.rows.length === 0) continue;
      out.push({ kind: 'header', key: `h-${g.label}`, label: g.label });
      g.rows.forEach((row, i) =>
        out.push({
          kind: 'row',
          key: `r-${row.id}`,
          row,
          first: i === 0,
          last: i === g.rows.length - 1,
        })
      );
    }
    return out;
  }, [rows]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === 'header') return <RamahSectionHeader>{item.label}</RamahSectionHeader>;
      const picked = selection.get(item.row.id);
      return (
        <BarangRow
          row={item.row}
          picked={picked}
          first={item.first}
          last={item.last}
          onToggle={() => onToggle(item.row)}
          onQty={(q) => onQty(item.row.id, q)}
        />
      );
    },
    [selection, onToggle, onQty]
  );

  const activeRuang = ruangList.find((r) => r.id === ruangId) ?? null;
  const dipilih = [...selection.values()];

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pilih barang" onBack={onBack} />

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
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nama barang"
            />
            <View style={styles.chipRow}>
              {/* A shortfall means nothing without the room it was counted in,
                  and this is also the `id_ruang` every line of the nota will
                  land in — so the chip is load-bearing twice over. It stops
                  being a button when there is only one room to choose. */}
              <RamahChip
                label={activeRuang?.nama ?? 'Gudang'}
                selected
                iconRight={ruangList.length > 1 ? 'chevron-down' : undefined}
                onPress={ruangList.length > 1 ? () => setSheetOpen(true) : undefined}
                accessibilityLabel={
                  ruangList.length > 1
                    ? `Gudang ${activeRuang?.nama ?? ''}. Ganti gudang`
                    : `Gudang ${activeRuang?.nama ?? ''}`
                }
              />
            </View>

            <FotoNotaCard jumlah={jumlahHalaman} onPress={onFoto} />

            {ruangErr ? (
              <View style={styles.ruangErrBox}>
                <RamahInlineError message={ruangErr} />
                {/* Issue #23: a unit kerja with no ruang used to leave this
                    step — and the nota it feeds — permanently unbuildable. */}
                <RamahSecondaryButton
                  label="Atur gudang"
                  icon="settings"
                  onPress={() => router.push('/pengaturan')}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            blocked={ruangId === null && ruangErr !== ''}
            loading={loading}
            error={listErr}
            searching={search !== ''}
            onRetry={reload}
          />
        }
        ListFooterComponent={<Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {/* The chips *are* the summary. A count line beside them would say
            again what four visible chips already say, and the money the board
            puts on the right cannot be computed here — no price is known until
            a supplier has been picked, which is the very next step. */}
        {dipilih.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selChips}>
            {dipilih.map((b) => (
              <View key={b.id} style={styles.selChip}>
                <Text style={styles.selChipText} numberOfLines={1}>
                  {`${b.nama} · ${formatNumber(b.qty)}`}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.dockHint}>Centang barang yang mau dibeli.</Text>
        )}
        <RamahPrimaryButton
          label="Lanjut pilih pemasok"
          icon="arrow-right"
          onPress={onLanjut}
          disabled={dipilih.length === 0}
        />
      </View>

      <RamahSheet visible={sheetOpen} title="Pilih gudang" onClose={() => setSheetOpen(false)}>
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            // An open stock take makes the `kartu_stok` trigger refuse every
            // posting into that room, and finding that out at posting time is
            // the worst place to find it.
            sub={
              r.nomorOpnameBeku
                ? `Beku oleh opname ${r.nomorOpnameBeku}`
                : r.namaUnitKerja || undefined
            }
            selected={r.id === ruangId}
            onPress={() => {
              setSheetOpen(false);
              onPickRuang(r.id);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/**
 * The OCR board's one addition to this screen.
 *
 * Brand-tinted rather than a plain row because it is a second way *in*, not a
 * row of the list below it — the board draws it as the one coloured block on an
 * otherwise grey-and-white screen, and the separator under it is what says the
 * two paths reach the same nota.
 */
function FotoNotaCard({ jumlah, onPress }: { jumlah: number; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <>
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={
          jumlah
            ? `Foto nota pemasok, ${jumlah} halaman sudah diambil`
            : 'Foto nota pemasok'
        }
        style={[styles.ocrCard, down && styles.ocrCardDown]}>
        <View style={styles.ocrIcon}>
          <Feather name="camera" size={RamahIcon.row} color={C.brandInk} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.ocrTitle}>Foto nota pemasok</Text>
          {jumlah ? (
            <Text style={styles.ocrSub}>{`${jumlah} halaman siap dilampirkan`}</Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={RamahIcon.row} color={C.brandInk} />
      </Pressable>
      <Text style={styles.ocrSeparator}>atau pilih manual</Text>
    </>
  );
}

/**
 * One reorder row: what it is, how bad it is, and — once ticked — how many to
 * order.
 *
 * The stepper is inside the row rather than in a sheet because this is the only
 * thing anybody does on this screen, and a sheet per line for a queue of twelve
 * is twelve dismissals. Typing past the shortfall is allowed and deliberately
 * not corrected: buying ahead is ordinary, and a field that refuses to hold what
 * somebody meant to type is worse than one that holds it.
 */
function BarangRow({
  row,
  picked,
  first,
  last,
  onToggle,
  onQty,
}: {
  row: StokMinimumRow;
  picked: BarangDipilih | undefined;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onQty: (qty: number) => void;
}) {
  const habis = row.totalStok <= 0;
  const satuan = picked?.namaSatuanDasar || 'satuan dasar';

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!picked }}
        accessibilityLabel={`${row.nama}, sisa ${formatNumber(row.totalStok)}, minimum ${formatNumber(row.stokMin)}`}
        style={styles.row}>
        <View style={[styles.box, picked && styles.boxOn]}>
          {picked ? <Feather name="check" size={14} color={C.white} /> : null}
        </View>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {row.nama}
          </Text>
          <Text style={[styles.rowStatus, habis && styles.rowStatusHabis]} numberOfLines={1}>
            {habis ? 'Habis' : `Kurang ${formatNumber(row.selisih)} dari minimum`}
          </Text>
        </View>
        <Text style={styles.rowValue} numberOfLines={1}>
          {formatNumber(row.totalStok)}
        </Text>
      </Pressable>

      {picked ? (
        <View style={styles.stepper}>
          <RamahIconButton
            icon="minus"
            label={`Kurangi jumlah beli ${row.nama}`}
            variant="outline"
            size={44}
            disabled={picked.qty <= 1}
            onPress={() => onQty(Math.max(1, picked.qty - 1))}
          />
          <TextInput
            value={String(picked.qty)}
            onChangeText={(v) => {
              // Digits only, and an empty field reads as 1 rather than 0: zero
              // is not a quantity anybody means to order, and a line of zero
              // would be sent as one.
              const n = Number(v.replace(/[^0-9]/g, ''));
              onQty(Number.isFinite(n) && n > 0 ? n : 1);
            }}
            inputMode="numeric"
            keyboardType="number-pad"
            selectTextOnFocus
            accessibilityLabel={`Jumlah beli ${row.nama}`}
            style={styles.qtyInput}
          />
          <Text style={styles.stepLabel} numberOfLines={1}>
            {satuan}
          </Text>
          <View style={styles.grow} />
          <RamahIconButton
            icon="plus"
            label={`Tambah jumlah beli ${row.nama}`}
            variant="tint"
            size={44}
            onPress={() => onQty(picked.qty + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

function Placeholder({
  blocked,
  loading,
  error,
  searching,
  onRetry,
}: {
  blocked: boolean;
  loading: boolean;
  error: string;
  searching: boolean;
  onRetry: () => void;
}) {
  // With no gudang there is nothing to be empty *of*: the chip above already
  // carries the reason, and a line about an empty reorder queue would name a
  // gudang that does not exist.
  if (blocked) return null;
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
          ? 'Tidak ada barang yang cocok. Kosongkan pencarian untuk melihat seluruh daftar.'
          : 'Tidak ada barang yang sudah menyentuh stok minimumnya di gudang ini.'}
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
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.cardGap, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },
  ruangErrBox: { gap: L.space2, alignItems: 'flex-start' },

  ocrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPadDense,
    borderRadius: R.card,
    backgroundColor: C.brandTintSoft,
    borderWidth: 1,
    borderColor: C.green200,
  },
  ocrCardDown: { opacity: 0.85 },
  ocrIcon: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.green200,
  },
  ocrTitle: { ...T.rowTitle, color: C.textTitle },
  ocrSub: { ...T.caption, color: C.brandInk },
  ocrSeparator: { ...T.caption, color: C.textMuted, textAlign: 'center', paddingTop: L.space1 },

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
    alignItems: 'flex-start',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
  rowTitle: { ...T.rowTitle, color: C.textTitle },
  rowStatus: { ...T.caption, color: C.textBody },
  rowStatusHabis: { color: C.textDanger },
  rowValue: { ...T.rowTitle, color: C.textTitle, textAlign: 'right', maxWidth: 120 },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    paddingHorizontal: L.cardPad,
    paddingBottom: L.cardPadDense,
  },
  qtyInput: {
    width: 64,
    height: 44,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
    backgroundColor: C.surfacePage,
    textAlign: 'center',
    color: C.textTitle,
    ...T.rowTitle,
    paddingVertical: 0,
  },
  stepLabel: { ...T.caption, color: C.textBody },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.caption, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.cardGap,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  dockHint: { ...T.caption, color: C.textBody },
  selChips: { gap: 6, paddingBottom: 2 },
  selChip: {
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.grey100,
  },
  // Guide §7: 11px is for tile labels and counters. These chips are the
  // summary of what is going on the nota, which is read.
  selChipText: { ...T.caption, color: C.textBody },
});
