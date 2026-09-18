/**
 * Katalog produk — screen C1 of `Papan Layar.dc.html`, drawn as
 * `LayarGudang.dc.html` draws it at `screen: 'katalog'`.
 *
 * **One question, and the whole screen answers it: barang ini sisa berapa.**
 * Search at the top, the gudang the figures belong to under it, then the rows
 * split in two — what is at or below its reorder point first, everything else
 * after. Tapping a row opens the product (C2); the one green pill at the foot
 * starts a new one (G1). Nothing here writes.
 *
 * **It is pushed from the root stack, not a tab**, and `_layout.tsx` is where
 * that is argued and where the section's top/left/right insets are paid. The
 * bottom edge is this screen's, because the docked pill is what sits on it.
 *
 * This replaces the old Master Produk list, which was the same records under a
 * different question. That screen carried three filter chips, a bulk-archive
 * selection bar and an undo toast, none of which the board draws: archiving is
 * on the record now (`[id]`'s `headerRight`), where CLAUDE.md puts a section's
 * standing actions, and a catalogue that opens on "which of these is running
 * out" does not also need a chip to ask it.
 *
 * ## What the board draws that is not here, and why
 *
 * - **The "Urut nama" chip.** There is no sort parameter anywhere in the
 *   contract — not on `GET /product`, not on `GET /pos/product` — and this list
 *   *appends* pages, so sorting client-side would reorder only the pages already
 *   in hand. That is the same lie a client-side search over a paged list tells.
 * - **The tab bar.** Katalog gave up its tab to the till. The board's own
 *   navigation rule is that three roots have no back button and every other
 *   screen is a stack with a back arrow and no bar; this is the second kind.
 * - **The role chip.** The header's right slot is empty on a pushed screen, the
 *   rule `AppShell` already follows: the grant is not what anybody opened a
 *   catalogue to read, and it is one reach away on Beranda, whose konteks pill
 *   also names the unit kerja a chip has no room for.
 *
 * ## Why two endpoints
 *
 * The rows come from **`GET /pos/product`**, not `GET /product` — even though
 * the design's own endpoint note names the latter. The product list carries no
 * stock, no satuan and no harga at all (the keys are absent, not empty), so a
 * catalogue built on it would fetch three more things per row: twenty rows,
 * sixty requests, on a screen someone opens all day. `/pos/product` answers
 * product + satuan + harga + `stok_akhir` for a whole page in three queries.
 *
 * The grouping comes from **`GET /product/stok-minimum`**, because `PosProduct`
 * has no `stok_minimum` field and no endpoint carries stock and threshold
 * together. That list *is* the definition of the first group — it answers
 * exactly the active products whose balance has reached or fallen below their
 * own reorder point, and never those still at the `stok_minimum = 0` default,
 * which means "not set" rather than "may run out". So the whole set is read
 * once, kept as ids, and every catalogue row is filed by whether it is in there.
 * Both reads are narrowed to the same `id_ruang`, so the two are comparing the
 * same stock.
 *
 * **What that costs, stated rather than hidden.** The catalogue appends pages;
 * the group headings partition *what is loaded*, so a low item sitting on page
 * four is not on screen until page four is. The complete reorder queue is its
 * own screen (E1, `GET /product/stok-minimum` unpaginated by group) and the
 * home alert card is the path to it — this screen is a catalogue that marks
 * what is low, not the work list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import {
  RamahChip,
  RamahEmptySearch,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  listPosProducts,
  listStokMinimum,
  produkBus,
  type PosProductRow,
} from '@/services/produk';
import { listRuang, type RuangRow } from '@/services/ruang';

/** 20 per page, as everywhere else here: a screenful in one round trip. */
const PAGE_SIZE = 20;
/** Long enough that typing a code does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The reorder set is read at the contract's maximum page size and paged through
 * to the end, because a partial set would file low items into "Stok aman" —
 * a wrong answer that looks like a right one. The cap is a guard against a
 * server that reports a page count it never stops serving, not a business
 * limit: 20 × 100 is two thousand items already at their reorder point, and a
 * shop in that state has a bigger problem than this screen.
 */
const LOW_PAGE_SIZE = 100;
const LOW_PAGE_CAP = 20;

/** Which gudang the figures are for, remembered across launches. */
const RUANG_KEY = 'katalog.ruang';

/** One shared empty set, so the first render does not allocate a new identity. */
const NO_LOW: ReadonlySet<number> = new Set<number>();

/**
 * The list, flattened.
 *
 * `RamahStackCard` is the system's white card with hairlines between its rows,
 * and it is deliberately **not** used here: it wraps its children, which means
 * holding every row of an unbounded appending list in one element and giving up
 * the windowing a `FlatList` does. So the group card is assembled the other way
 * round — the rows are flattened with their group headings, and each row draws
 * the card edge it owns. `first`/`last` is what that costs, and it buys a list
 * that stays cheap at four hundred products.
 */
type Entry =
  | { kind: 'header'; key: string; label: string }
  | {
      kind: 'row';
      key: string;
      row: PosProductRow;
      low: boolean;
      first: boolean;
      last: boolean;
    };

export default function KatalogScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('produk');
  /**
   * Only the bottom inset. Top, left and right are spent by `_layout.tsx`
   * outside this screen; the bottom is the docked pill's, because nothing below
   * it pays for that edge — there is no tab bar under this screen.
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

  // ---- which gudang ----
  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [ruangErr, setRuangErr] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // ---- search ----
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // ---- the catalogue ----
  const [rows, setRows] = useState<PosProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  const [readAt, setReadAt] = useState<Date | null>(null);
  /**
   * Loading is *derived*, not stored.
   *
   * The obvious shape is a `listLoading` boolean flipped to `true` at the top of
   * the fetch effect, but that is a setState running synchronously inside an
   * effect: React renders once with the new inputs, the effect fires, and the
   * flag forces a second render before a single byte has been asked for.
   * `eslint-config-expo` 57 promotes exactly that to an error
   * (`react-hooks/set-state-in-effect`), and the rule is right — the render
   * cascade is real, it was there under SDK 54 too, and nothing warned.
   *
   * So the screen keeps two keys instead: the one it *wants* loaded, built from
   * the inputs during render, and the one it *has* loaded, written once when a
   * read settles. Loading is the two disagreeing. Nothing is set on the way in,
   * a stale response cannot un-set a flag the next request just set, and the
   * spinner is a pure function of state.
   */
  const [loadedKey, setLoadedKey] = useState('');
  /** False until `GET /ruang` has answered — before that there is nothing to load *from*. */
  const [ruangReady, setRuangReady] = useState(false);

  // ---- the reorder set, as ids ----
  const [lowIds, setLowIds] = useState<ReadonlySet<number>>(NO_LOW);
  const [lowErr, setLowErr] = useState('');

  /** Bumped to re-read everything: the refresh affordance, and a bus `reload`. */
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  /**
   * Everything the catalogue read depends on, as one string. Empty while there
   * is no gudang, because there is no read to describe yet.
   */
  const requestKey = ruangId === null ? '' : `${ruangId}|${search}|${reloadToken}`;
  const listLoading = !ruangReady || (ruangId !== null && loadedKey !== requestKey);

  // Searching is server-side on both endpoints, so the field is debounced
  // rather than filtering an array that is only ever a few pages deep.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  /**
   * The gudang list, once.
   *
   * `GET /ruang` already answers only the rooms inside the session's active
   * unit kerja, so whatever comes back is exactly the set that may be chosen —
   * no filtering here. A remembered choice is honoured only if it is still in
   * that set: a grant switch changes the unit kerja, and a room from the old
   * one would answer 404 on every read.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [answer, saved] = await Promise.all([
          // 100 is the contract's maximum page size. A unit kerja with more
          // rooms than that would need a picker that searches rather than one
          // that lists, which is a different control than the board draws.
          listRuang({ size: 100, is_aktif: true }),
          AsyncStorage.getItem(RUANG_KEY).catch(() => null),
        ]);
        if (!alive) return;
        setRuangList(answer.data);
        const remembered = answer.data.find((r) => r.id === Number(saved));
        const pick = remembered ?? answer.data[0];
        if (pick) {
          setRuangId(pick.id);
          setRuangErr('');
        } else {
          setRuangErr('Tidak ada gudang di unit kerja ini, jadi stok tidak bisa dibaca.');
        }
      } catch (e) {
        if (!alive) return;
        setRuangErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      } finally {
        // Answered either way. A failed read is still an answer: it is what
        // stops the spinner and lets the error line be the thing on screen.
        if (alive) setRuangReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Page one of the catalogue and the whole reorder set, together.
   *
   * They are read side by side rather than in sequence because neither depends
   * on the other, and settled rather than raced because they fail differently:
   * a catalogue that will not load is an empty screen, while a reorder set that
   * will not load is a catalogue that still lists everything correctly and only
   * cannot say which rows are low. The second is worth showing with a caption
   * instead of replacing with an error page.
   */
  useEffect(() => {
    if (ruangId === null) return;
    let alive = true;

    const readLowIds = async () => {
      const ids = new Set<number>();
      let p = 1;
      let totalPage = 1;
      while (p <= totalPage && p <= LOW_PAGE_CAP) {
        const answer = await listStokMinimum({
          page: p,
          size: LOW_PAGE_SIZE,
          search: search || undefined,
          id_ruang: ruangId,
        });
        for (const r of answer.data) ids.add(r.id);
        totalPage = Math.max(1, answer.paging.total_page ?? 1);
        p += 1;
      }
      return ids as ReadonlySet<number>;
    };

    (async () => {
      const [katalog, low] = await Promise.allSettled([
        listPosProducts({
          id_ruang: ruangId,
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
        }),
        readLowIds(),
      ]);
      if (!alive) return;

      if (katalog.status === 'fulfilled') {
        setRows(katalog.value.data);
        setPage(1);
        setHasMore(Math.max(1, katalog.value.paging.total_page ?? 1) > 1);
        setListErr('');
        // The stamp is when *this device* read the figures, which no payload
        // carries. The guide asks for it on every operational number: a number
        // with no time on it cannot be told from a stale one.
        setReadAt(new Date());
      } else {
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(katalog.reason, 'Gagal memuat katalog.'));
      }

      if (low.status === 'fulfilled') {
        setLowIds(low.value);
        setLowErr('');
      } else {
        setLowIds(NO_LOW);
        setLowErr('Stok minimum tidak terbaca, jadi baris di bawah minimum belum ditandai.');
      }

      // Page one is what just landed, so any halted append belongs to a query
      // that no longer exists.
      setMoreErr('');
      setLoadedKey(requestKey);
    })();

    return () => {
      alive = false;
    };
  }, [ruangId, search, reloadToken, requestKey]);

  /**
   * What the detail and the create form did while this screen sat underneath
   * them.
   *
   * A rename is patched in place, so the reader comes back to the same offset
   * with the new name already on the row. An archived product *leaves* — this
   * catalogue is `GET /pos/product`, which answers active products only and has
   * no parameter to see the others, because a retired item must not be
   * sellable.
   *
   * Group membership is recomputed rather than refetched, because the bus
   * carries the one field that decides it. The rule is the endpoint's own, in
   * two parts: `stok_minimum = 0` never appears in the reorder list (zero is
   * the column default, meaning "not set"), and the threshold is
   * `total_stok <= stok_minimum`, not `<` — reaching the reorder point *is* the
   * moment to reorder. `stokAkhir` here is the same room the reorder list was
   * narrowed to, so the two comparisons are over the same stock.
   */
  useRecordBus(produkBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    if (!saved.aktif) {
      setRows((list) => list.filter((r) => r.id !== saved.id));
      setLowIds((ids) => {
        if (!ids.has(saved.id)) return ids;
        const next = new Set(ids);
        next.delete(saved.id);
        return next;
      });
      return;
    }
    // `rows` is read from the closure rather than from inside an updater:
    // `useRecordBus` refreshes its handler on every render, so this sees the
    // current list, and one setState must never be called from inside
    // another's updater — those run in the render phase.
    const target = rows.find((r) => r.id === saved.id);
    if (!target) return;
    setRows((list) =>
      list.map((r) => (r.id === saved.id ? { ...r, nama: saved.nama, kode: saved.kode } : r))
    );
    const low = saved.stokMin > 0 && target.stokAkhir <= saved.stokMin;
    setLowIds((ids) => {
      if (ids.has(saved.id) === low) return ids;
      const next = new Set(ids);
      if (low) next.add(saved.id);
      else next.delete(saved.id);
      return next;
    });
  });

  /**
   * `onEndReached` fires more than once per approach, so the in-flight flag is
   * the guard and the threshold is not one. A page that failed halts the loop
   * behind a "Coba lagi" rather than a spinner that never ends.
   */
  const loadMore = useCallback(
    async (force = false) => {
      if (ruangId === null || loadingMore || listLoading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listPosProducts({
          id_ruang: ruangId,
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
        });
        // Paging is offset-based with no cursor anywhere, so a product created
        // while the reader is scrolling shifts the window and the same row can
        // arrive twice. Merging by id keeps that from becoming a duplicate key.
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
    [ruangId, loadingMore, listLoading, hasMore, moreErr, page, search]
  );

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const retryMore = useCallback(() => {
    setMoreErr('');
    loadMore(true);
  }, [loadMore]);

  const pickRuang = useCallback((id: number) => {
    setSheetOpen(false);
    setRuangId(id);
    AsyncStorage.setItem(RUANG_KEY, String(id)).catch(() => {
      // A preference that will not persist is not worth an error on a screen
      // that is otherwise working; the choice still holds for this session.
    });
  }, []);

  const openDetail = useCallback(
    (id: number, idRuang: number) => {
      // The gudang travels with the push, so the detail's kartu stok opens on
      // the same room these figures were counted in. Reading it back off
      // storage there would work until the two screens disagreed for one frame.
      router.push({ pathname: '/produk/[id]', params: { id, ruang: idRuang } });
    },
    [router]
  );

  const openBaru = useCallback(() => {
    router.push('/produk/baru');
  }, [router]);

  /**
   * Katalog is a pushed screen, not a tab root, so its header carries a back
   * arrow — which is what `LayarGudang.dc.html` draws at this screen
   * (`AppHeader … on-back="goHome"`).
   *
   * `dismiss()` targets this section's own `Stack`; `back()` would be offered to
   * the navigator that contains the tabs first, which may answer by switching
   * tabs instead of popping this screen. The `replace` covers a cold deep link
   * into `/produk` with nothing underneath it to pop.
   */
  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const activeRuang = ruangList.find((r) => r.id === ruangId) ?? null;

  const entries = useMemo<Entry[]>(() => {
    const groups = [
      { label: 'Di bawah minimum', low: true, rows: rows.filter((r) => lowIds.has(r.id)) },
      { label: 'Stok aman', low: false, rows: rows.filter((r) => !lowIds.has(r.id)) },
    ];
    const out: Entry[] = [];
    for (const g of groups) {
      if (g.rows.length === 0) continue;
      // An empty group is dropped rather than drawn as a heading over nothing:
      // "Di bawah minimum" with no rows under it reads as a broken list, and
      // its absence already says everything is above its reorder point.
      out.push({ kind: 'header', key: `h-${g.label}`, label: g.label });
      g.rows.forEach((row, i) =>
        out.push({
          kind: 'row',
          key: `r-${row.id}`,
          row,
          low: g.low,
          first: i === 0,
          last: i === g.rows.length - 1,
        })
      );
    }
    return out;
  }, [rows, lowIds]);

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === 'header')
        return (
          <View style={styles.listHeading}>
            <RamahSectionHeader>{item.label}</RamahSectionHeader>
          </View>
        );
      return (
        <KatalogRow
          row={item.row}
          low={item.low}
          first={item.first}
          last={item.last}
          onPress={(id) => openDetail(id, ruangId ?? 0)}
        />
      );
    },
    [openDetail, ruangId]
  );

  const searching = search !== '';

  return (
    <View style={styles.screen}>
      {/* The right slot is empty, as the board draws it. See the file header. */}
      <RamahHeader title="Katalog produk" onBack={goBack} />

      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderEntry}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        /*
          Pull to refresh. It replaces a "Muat ulang" link that sat beside the
          stamp — the gesture is what every other list in this app already
          answers to, and a link doing the same job on one screen is a control
          somebody has to find rather than one they already know.

          Only once page one has landed, so the pull spinner and the empty
          placeholder's own `ActivityIndicator` are never on screen together —
          the same guard `app/pembelian/index.tsx` uses.
        */
        refreshControl={
          <RefreshControl
            refreshing={rows.length > 0 && listLoading}
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
              placeholder="Cari nama atau kode barang"
            />
            <View style={styles.chipRow}>
              {/* The gudang is a chip and not a heading because a stock figure
                  means nothing without the room it was counted in. It stops
                  being a *button* when there is only one room to choose: a
                  control that cannot change anything still has to say what the
                  numbers are for, but should not invite a tap that does
                  nothing. */}
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
            {/* The stamp, and nothing else: re-reading is the pull gesture
                on the list now. It stays because a stock figure with no time on
                it cannot be told apart from a stale one. */}
            {readAt ? (
              <View style={styles.stamp}>
                <Feather name="clock" size={RamahIcon.meta} color={C.iconMuted} />
                <Text style={styles.stampText}>Stok per {stempelPembaruan(readAt)}</Text>
              </View>
            ) : null}
            {ruangErr ? (
              <View style={styles.ruangErrBox}>
                <RamahInlineError message={ruangErr} />
                {/* Issue #23: a unit kerja with no ruang used to be a dead end
                    with no way out of this screen. This is the fix — every
                    such stop now points at the settings section that can
                    actually add one. */}
                <RamahSecondaryButton
                  label="Atur gudang"
                  icon="settings"
                  onPress={() => router.push('/pengaturan')}
                />
              </View>
            ) : null}
            {lowErr ? <RamahInlineError message={lowErr} /> : null}
          </View>
        }
        ListEmptyComponent={
          <ListPlaceholder
            // With no gudang there is nothing to be empty *of*: the chip above
            // already carries the reason, and "belum ada produk di gudang ini"
            // under it would name a gudang that does not exist.
            blocked={ruangId === null && ruangErr !== ''}
            loading={listLoading}
            error={listErr}
            searching={searching}
            onRetry={reload}
          />
        }
        ListFooterComponent={
          <ListFooter loading={loadingMore} error={moreErr} onRetry={retryMore} />
        }
      />

      {/* Exactly one solid green pill on the screen, docked, with a verb in it.
          It is absent rather than disabled for a grant that cannot write: a
          permanently dead button is a promise the session cannot keep.

          The dock is also what owns the bottom inset on this screen — there is
          no tab bar under it to pay for that edge. */}
      {canWrite ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton label="Tambah produk" icon="plus" onPress={openBaru} />
        </View>
      ) : null}

      <RamahSheet visible={sheetOpen} title="Pilih gudang" onClose={() => setSheetOpen(false)}>
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            // The frozen-room number is worth carrying here for the same reason
            // it is on every other ruang picker: an open stock take makes the
            // `kartu_stok` trigger refuse every posting into that room, and
            // finding that out at posting time is the worst place to find it.
            sub={
              r.nomorOpnameBeku
                ? `Beku oleh opname ${r.nomorOpnameBeku}`
                : r.namaUnitKerja || undefined
            }
            selected={r.id === ruangId}
            onPress={() => pickRuang(r.id)}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/**
 * One catalogue row: what it is on the left, how much is left and what it
 * costs on the right.
 *
 * The kode is deliberately not printed. It is how the row is *found* — search
 * matches it server-side, and `GET /pos/product` sorts an exact `kode_barang`
 * match to the top, which is what a barcode scan needs — not what is read once
 * it has been; a second grey line under every one of thirty rows is thirty
 * lines nobody acts on. The code is on the detail, where reference data belongs.
 *
 * Red on the figure is what marks a low row, and the group heading above says
 * what red means. The shortfall itself ("kurang 12 pcs") belongs on the reorder
 * screen, where the next thing you do with it is type an order quantity.
 */
function KatalogRow({
  row,
  low,
  first,
  last,
  onPress,
}: {
  row: PosProductRow;
  low: boolean;
  first: boolean;
  last: boolean;
  onPress: (id: number) => void;
}) {
  const [down, setDown] = useState(false);
  const satuan = row.dasar?.nama ?? '';
  const stok = `${formatNumber(row.stokAkhir)}${satuan ? ` ${satuan}` : ''}`;
  // `null` is a fact the contract sends on purpose: a product with no price
  // version in force is still sellable, with the amount typed by hand. Saying
  // so beats printing "Rp 0", which is a price somebody could act on.
  const harga = row.dasar?.harga ? formatRupiah(row.dasar.harga) : 'Belum ada harga';

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={() => onPress(row.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.nama}, sisa ${stok}, ${harga}`}
        style={[styles.row, down && styles.rowDown]}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {row.nama}
        </Text>
        <View style={styles.rowValues}>
          <Text style={[styles.rowValue, low && styles.rowValueLow]} numberOfLines={1}>
            {stok}
          </Text>
          <Text style={styles.rowCaption} numberOfLines={1}>
            {harga}
          </Text>
        </View>
        <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
      </Pressable>
    </View>
  );
}

/** The three things an empty list can mean, kept apart. */
function ListPlaceholder({
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
  if (blocked) return null;
  if (loading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Katalog tidak terbaca</Text>
        <Text style={styles.placeholderSub}>{error}</Text>
        <View style={styles.placeholderAction}>
          <RamahInlineError message="Periksa koneksi, lalu baca ulang." onRetry={onRetry} />
        </View>
      </View>
    );
  }
  // Two different sentences, and only the first is a failed search. A catalogue
  // that is empty because nothing has been added yet has not failed to find
  // anything, so it keeps the plain text: the illustration would be saying
  // "tidak ditemukan" about a shelf nobody has stocked.
  if (searching) {
    return (
      <View style={styles.placeholder}>
        <RamahEmptySearch sub="Coba kata kunci lain, atau periksa gudang yang sedang dipilih." />
      </View>
    );
  }
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Katalog masih kosong</Text>
      <Text style={styles.placeholderSub}>
        Belum ada produk aktif di gudang ini. Tambahkan produk pertama untuk mulai mencatat stok
        dan harga.
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
 * No top, left or right inset here on purpose: `app/produk/_layout.tsx` pays all
 * three for the whole section, outside the navigator. An inset is applied
 * exactly once by whatever owns that edge, and doing it twice is invisible on a
 * device with no notch and obvious on every device with one. The bottom is this
 * screen's and is read in the component, because an inset is a runtime value —
 * rotation, a foldable, the keyboard — and must never be baked into a
 * module-level `StyleSheet.create`.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  // Full-bleed, so the list's own background reaches the edges; the gutter is
  // spent on the content instead.
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingBottom: L.space6 },

  controls: { gap: L.stack, paddingTop: L.space1, paddingBottom: L.stack },
  chipRow: { flexDirection: 'row', gap: L.related, flexWrap: 'wrap' },
  ruangErrBox: { gap: L.space2, alignItems: 'flex-start' },

  stamp: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  stampText: { ...T.bodySmall, color: C.textMuted, flexShrink: 1 },

  // The group card. Each row draws the edges it owns, so the two groups read as
  // two white blocks on the grey canvas without either being one element — see
  // the note on `Entry` for why this is not `RamahStackCard`.
  card: {
    backgroundColor: C.surfaceCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  cardFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
  },
  cardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: R.card,
    borderBottomRightRadius: R.card,
    marginBottom: L.stack,
  },
  // A heading opens a group: `group` above it (this, plus the `stack` the group
  // before leaves under its last card, or the controls leave under themselves)
  // and `related` down to the rows it names.
  listHeading: { paddingTop: L.group - L.stack, paddingBottom: L.related },
  // Inset by the card's own padding, so the divider separates the text rather
  // than cutting the card in half.
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.surfaceStack },
  rowTitle: { ...T.titleTiny, color: C.textTitle, flex: 1, minWidth: 0 },
  // Capped, so a long product name keeps the width it needs on a ~354pt phone.
  rowValues: { flexShrink: 0, maxWidth: 140, alignItems: 'flex-end', gap: L.inline },
  rowValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right' },
  rowValueLow: { color: C.textDanger },
  rowCaption: { ...T.bodySmall, color: C.textMuted, textAlign: 'right' },

  placeholder: { paddingTop: L.space10, gap: L.space2, alignItems: 'center' },
  placeholderTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  placeholderSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  placeholderAction: { paddingTop: L.space2 },

  footer: { paddingVertical: L.space4, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
