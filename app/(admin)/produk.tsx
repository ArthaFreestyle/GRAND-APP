import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppShell } from '@/components/shell/AppShell';
import { HargaModal, ProductFormModal, SatuanModal, Toast } from '@/components/produk/modals';
import {
  RecordList,
  UndoBar,
  type RecordAction,
  type RecordItem,
} from '@/components/shell/record-list';
import { FilterPills } from '@/components/shell/ui';
import { atLeast, useBreakpoint } from '@/hooks/use-breakpoint';
import {
  ProdukColors as C,
  formatNumber,
  formatRupiah,
  formatTanggal,
  todayISO,
} from '@/constants/produk';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/services/api';
import { rupiahToDecimal } from '@/services/decimal';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import {
  addHarga,
  createProduct,
  deleteHarga as apiDeleteHarga,
  getProduct,
  listProducts,
  listSatuan,
  listStok,
  listStokMinimum,
  updateHarga,
  updateProduct,
  upsertSatuan,
  type ProductDetail,
  type ProductHargaRow,
  type ProductRow,
  type ProductSatuanRow,
  type StokMinimumRow,
  type StokRuang,
} from '@/services/produk';
import type { components } from '@/types/api';

// 20 per page: the list is text-only, so the fetch is small and the reader gets
// a screenful in one round trip. Halve it if a row ever carries an image.
const PAGE_SIZE = 20;
/** Long enough that typing a code doesn't fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

type ModalKind = 'new' | 'edit' | null;

/**
 * What the chips can actually ask the API for.
 *
 * "Stok menipis" is `GET /product/stok-minimum`, a different endpoint rather
 * than a parameter: the product list carries no stock at all. There is
 * deliberately no "Habis" chip - a product sitting at zero with `stok_minimum`
 * still at its 0 default never appears in that endpoint, so the chip would be
 * telling a comfortable lie - and no "Draft", which the `Product` schema has no
 * field for.
 */
type Filter = 'semua' | 'menipis' | 'nonaktif';

/**
 * The chip is remembered across launches. There is no sort parameter on
 * `GET /product` to persist instead, and this is the nearest thing to one:
 * whoever minds the stock wants the reorder list, which arrives sorted
 * worst-first, and should not have to ask for it every morning.
 */
const FILTER_KEY = 'produk.filter';

const FILTER_OPTIONS: { key: Filter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'menipis', label: 'Stok menipis' },
  { key: 'nonaktif', label: 'Nonaktif' },
];

// Module-level so each row's `actions` array keeps the same identity between
// renders and `RecordRow`'s `memo` holds. Archiving is reversible - it flips
// `is_aktif`, the only removal the contract offers - so it is a safe swipe with
// an undo behind it rather than a `danger` action behind a confirmation.
const ACTIONS_AKTIF: RecordAction[] = [
  { key: 'ubah', label: 'Ubah produk' },
  { key: 'arsip', label: 'Arsipkan', quick: true },
];
const ACTIONS_NONAKTIF: RecordAction[] = [
  { key: 'ubah', label: 'Ubah produk' },
  { key: 'aktifkan', label: 'Aktifkan', quick: true },
];
const ACTIONS_READONLY: RecordAction[] = [];

interface ProductDraft {
  id: number | null;
  kode: string;
  nama: string;
  stokMin: string;
  aktif: boolean;
  idDasar: number | null;
}

interface SatuanFormState {
  idSatuan: number | null;
  faktor: string;
  def: boolean;
  err: string;
}

interface HargaFormState {
  editId: number | null;
  idSatuan: number | null;
  harga: string;
  dari: string;
  err: string;
}

const EMPTY_DRAFT: ProductDraft = { id: null, kode: '', nama: '', stokMin: '0', aktif: true, idDasar: null };

/** The server's own wording is the useful one; this only covers a thrown non-ApiError. */
function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export default function ProdukScreen() {
  // Detail view: the two cards sit side by side once there is room for both at
  // their minimum widths, and stack otherwise.
  const wide = atLeast(useBreakpoint(), 'large');

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [current, setCurrent] = useState<ProductDetail | null>(null);
  const [stok, setStok] = useState<StokRuang[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('semua');
  /** Rows for the "Stok menipis" chip, which answers a different shape. */
  const [lowRows, setLowRows] = useState<StokMinimumRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  /**
   * Where the list was left. Opening a product swaps this screen's `view`,
   * which unmounts the list, so the offset is parked here and handed back on
   * the way in - an infinite list that snaps to the top after every detail
   * visit makes the reader re-scroll everything they already read.
   */
  const scrollY = useRef(0);
  const [undo, setUndo] = useState<{ message: string; revert: () => Promise<void> } | null>(null);

  const [satuanMaster, setSatuanMaster] = useState<components['schemas']['Satuan'][]>([]);

  const [modal, setModal] = useState<ModalKind>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [modalErr, setModalErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [satuanForm, setSatuanForm] = useState<SatuanFormState | null>(null);
  const [hargaForm, setHargaForm] = useState<HargaFormState | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('produk');
  // Retiring a price version is a hard delete that rewrites the price history,
  // so it stays with SUPERADMIN even though the rest of the screen is INVENTARIS'.
  const canDeleteHarga = useActiveRole() === 'SUPERADMIN';

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // ---- list ----

  /**
   * One page from whichever endpoint the active chip means. The reorder list is
   * its own endpoint and takes no `search`, so the search field is disabled
   * while that chip is on rather than quietly ignoring what is typed into it.
   */
  const fetchPage = useCallback(
    async (p: number) => {
      if (filter === 'menipis') {
        const result = await listStokMinimum({ page: p, size: PAGE_SIZE });
        return { low: result.data, rows: [] as ProductRow[], paging: result.paging };
      }
      const result = await listProducts({
        page: p,
        size: PAGE_SIZE,
        search: search || undefined,
        is_aktif: filter === 'nonaktif' ? false : undefined,
      });
      return { low: [] as StokMinimumRow[], rows: result.data, paging: result.paging };
    },
    [filter, search]
  );

  const reloadList = useCallback(async () => {
    setListLoading(true);
    setMoreErr('');
    try {
      const r = await fetchPage(1);
      setRows(r.rows);
      setLowRows(r.low);
      setPage(1);
      setHasMore(Math.max(1, r.paging.total_page ?? 1) > 1);
      setListErr('');
      scrollY.current = 0;
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar produk.'));
      setRows([]);
      setLowRows([]);
      setHasMore(false);
    } finally {
      setListLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  /**
   * `onEndReached` fires more than once per approach, so the in-flight flag is
   * the guard, not the threshold. A page that failed stops the loop until the
   * reader asks again - otherwise every scroll nudge retries a broken request.
   */
  const loadMore = useCallback(async (force = false) => {
    if (loadingMore || listLoading || !hasMore) return;
    if (!force && moreErr !== '') return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const r = await fetchPage(next);
      // The contract pages by offset, not cursor: a product created while the
      // reader is scrolling shifts the window, and the same row can arrive
      // twice. Merging by id keeps that from becoming a duplicate-key render.
      setRows((list) => {
        const seen = new Set(list.map((x) => x.id));
        return [...list, ...r.rows.filter((x) => !seen.has(x.id))];
      });
      setLowRows((list) => {
        const seen = new Set(list.map((x) => x.id));
        return [...list, ...r.low.filter((x) => !seen.has(x.id))];
      });
      setPage(next);
      setHasMore(next < Math.max(1, r.paging.total_page ?? 1));
      setMoreErr('');
    } catch (e) {
      setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, listLoading, hasMore, moreErr, page, fetchPage]);

  const retryMore = useCallback(() => {
    setMoreErr('');
    loadMore(true);
  }, [loadMore]);

  // Searching is server-side now, so the field is debounced rather than
  // filtering an array that is only ever one page deep.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    listSatuan()
      .then(setSatuanMaster)
      .catch(() => {
        // The dropdowns degrade to empty; the forms report it when used.
      });
  }, []);

  const satuanNama = useCallback(
    (id: number | null | undefined) => satuanMaster.find((s) => s.id === id)?.nama ?? '—',
    [satuanMaster]
  );

  // ---- detail ----

  const openDetail = useCallback(async (id: number) => {
    setView('detail');
    setSatuanForm(null);
    setHargaForm(null);
    setDetailLoading(true);
    setStok([]);
    try {
      const detail = await getProduct(id);
      setCurrent(detail);
      // Stock is a separate read: the product payload never carries it, and
      // asking for it per list row is the N+1 the contract warns against.
      listStok(id)
        .then(setStok)
        .catch(() => setStok([]));
    } catch (e) {
      setCurrent(null);
      setView('list');
      toast(messageOf(e, 'Gagal memuat detail produk.'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** Every write answers with the whole product, so this is the only sync needed. */
  function applyDetail(detail: ProductDetail) {
    setCurrent(detail);
    // Only the columns the list actually renders: copying satuan and harga into
    // a row would leave a second, quietly diverging copy of them behind.
    const { id, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt } = detail;
    setRows((list) =>
      list.map((r) =>
        r.id === id ? { id, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt } : r
      )
    );
  }

  function closeDetail() {
    setView('list');
    setCurrent(null);
    setStok([]);
    setSatuanForm(null);
    setHargaForm(null);
  }

  // ---- product form ----

  function openNewModal() {
    setDraft({ id: null, kode: '', nama: '', stokMin: '0', aktif: true, idDasar: satuanMaster[0]?.id ?? null });
    setModalErr('');
    setModal('new');
  }

  function openEditModal(p: ProductRow | ProductDetail) {
    setDraft({
      id: p.id,
      kode: p.kode,
      nama: p.nama,
      stokMin: String(p.stokMin),
      aktif: p.aktif,
      idDasar: 'idDasar' in p ? p.idDasar : null,
    });
    setModalErr('');
    setModal('edit');
  }

  function closeProductModal() {
    setModal(null);
    setDraft(EMPTY_DRAFT);
    setModalErr('');
  }

  async function saveProduct() {
    if (saving) return;
    const nama = draft.nama.trim();
    if (!nama) return setModalErr('Nama wajib diisi.');
    const stokMin = parseInt(draft.stokMin || '0', 10);
    if (Number.isNaN(stokMin) || stokMin < 0) {
      return setModalErr('Stok minimum harus bilangan bulat ≥ 0.');
    }

    setSaving(true);
    try {
      if (modal === 'new') {
        const kode = draft.kode.trim();
        if (!kode) return setModalErr('Kode barang wajib diisi.');
        if (!draft.idDasar) return setModalErr('Pilih satuan dasar dulu.');
        const created = await createProduct({
          kode_barang: kode,
          nama,
          id_satuan_dasar: draft.idDasar,
          stok_minimum: stokMin,
        });
        closeProductModal();
        await reloadList();
        setCurrent(created);
        setStok([]);
        setView('detail');
        toast(`Produk dibuat · satuan dasar ${satuanNama(created.idDasar)} terdaftar otomatis faktor 1`);
        return;
      }

      if (draft.id != null) {
        // kode_barang and id_satuan_dasar are immutable, so they are not sent.
        const updated = await updateProduct(draft.id, {
          nama,
          stok_minimum: stokMin,
          is_aktif: draft.aktif,
        });
        applyDetail(updated);
        closeProductModal();
        toast('Perubahan tersimpan');
      }
    } catch (e) {
      // 409 is the duplicate kode_barang; the server's message names it.
      setModalErr(messageOf(e, 'Gagal menyimpan produk.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAktif() {
    if (!current || saving) return;
    const next = !current.aktif;
    setSaving(true);
    try {
      applyDetail(await updateProduct(current.id, { is_aktif: next }));
      toast(next ? 'Produk diaktifkan kembali' : 'Produk dinonaktifkan · tidak lagi muncul di kasir');
    } catch (e) {
      toast(messageOf(e, 'Gagal mengubah status produk.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- satuan ----

  function openAddSatuan() {
    setSatuanForm({ idSatuan: satuanMaster[0]?.id ?? null, faktor: '', def: false, err: '' });
  }

  async function saveSatuan() {
    if (!current || !satuanForm || saving) return;
    const faktor = parseInt(satuanForm.faktor || '0', 10);
    const idSatuan = satuanForm.idSatuan;
    if (!idSatuan) return setSatuanForm({ ...satuanForm, err: 'Pilih satuan dulu.' });
    if (Number.isNaN(faktor) || faktor < 1) {
      return setSatuanForm({ ...satuanForm, err: 'Faktor harus bilangan bulat ≥ 1.' });
    }
    const exists = current.satuan.some((s) => s.idSatuan === idSatuan);
    setSaving(true);
    try {
      // The endpoint upserts: an already-registered satuan has its faktor updated.
      applyDetail(
        await upsertSatuan(current.id, { id_satuan: idSatuan, faktor, is_default_input: satuanForm.def })
      );
      setSatuanForm(null);
      toast(exists ? `Faktor ${satuanNama(idSatuan)} diperbarui` : `Satuan ${satuanNama(idSatuan)} ditambahkan`);
    } catch (e) {
      setSatuanForm({ ...satuanForm, err: messageOf(e, 'Gagal menyimpan satuan.') });
    } finally {
      setSaving(false);
    }
  }

  async function makeDefaultSatuan(row: ProductSatuanRow) {
    if (!current || saving) return;
    setSaving(true);
    try {
      // Re-sending the existing faktor: the flag moves, the conversion doesn't.
      applyDetail(
        await upsertSatuan(current.id, {
          id_satuan: row.idSatuan,
          faktor: row.faktor,
          is_default_input: true,
        })
      );
      toast(`Default input pindah ke ${row.nama || satuanNama(row.idSatuan)}`);
    } catch (e) {
      toast(messageOf(e, 'Gagal memindahkan default input.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- harga jual ----

  function openAddHarga() {
    if (!current) return;
    setHargaForm({
      editId: null,
      idSatuan: current.satuan[0]?.idSatuan ?? null,
      harga: '',
      dari: todayISO(),
      err: '',
    });
  }

  function openEditHarga(row: ProductHargaRow) {
    setHargaForm({
      editId: row.id,
      idSatuan: row.idSatuan,
      harga: row.harga.split('.')[0],
      dari: row.dari,
      err: '',
    });
  }

  async function saveHarga() {
    if (!current || !hargaForm || saving) return;
    const digits = String(hargaForm.harga || '').replace(/[^0-9]/g, '');
    if (!digits || parseInt(digits, 10) <= 0) {
      return setHargaForm({ ...hargaForm, err: 'Harga wajib diisi.' });
    }
    const harga = rupiahToDecimal(digits);

    setSaving(true);
    try {
      if (hargaForm.editId) {
        applyDetail(await updateHarga(current.id, hargaForm.editId, harga));
        setHargaForm(null);
        toast('Harga versi dikoreksi');
        return;
      }

      const idSatuan = hargaForm.idSatuan;
      if (!idSatuan) return setHargaForm({ ...hargaForm, err: 'Pilih satuan dulu.' });
      const dari = hargaForm.dari || todayISO();
      applyDetail(await addHarga(current.id, { id_satuan: idSatuan, harga, berlaku_dari: dari }));
      setHargaForm(null);
      toast(`Versi harga baru berlaku mulai ${formatTanggal(dari)} · versi terbuka sebelumnya ditutup`);
    } catch (e) {
      // 409 covers both an overlapping period and a version a nota already
      // references — the exclusion constraint is the only real guard, so the
      // message is the server's.
      setHargaForm({ ...hargaForm, err: messageOf(e, 'Gagal menyimpan harga.') });
    } finally {
      setSaving(false);
    }
  }

  async function deleteHarga(row: ProductHargaRow) {
    if (!current || saving) return;
    setSaving(true);
    try {
      applyDetail(await apiDeleteHarga(current.id, row.id));
      toast('Versi dihapus · versi sebelumnya dibuka kembali');
    } catch (e) {
      toast(messageOf(e, 'Gagal menghapus versi harga.'));
    } finally {
      setSaving(false);
    }
  }

  const satuanMasterOptions = useMemo(
    () => satuanMaster.map((x) => ({ value: String(x.id), label: x.nama ?? '' })),
    [satuanMaster]
  );
  const pakaiIds = current ? current.satuan.map((x) => x.idSatuan) : [];
  const satuanPickOptions = satuanMaster.map((x) => ({
    value: String(x.id),
    label: (x.nama ?? '') + (pakaiIds.includes(x.id ?? -1) ? ' — sudah terdaftar, faktor akan diperbarui' : ''),
  }));
  const hargaSatuanOptions = current
    ? current.satuan.map((x) => ({ value: String(x.idSatuan), label: x.nama || satuanNama(x.idSatuan) }))
    : [];

  // ---- list rows and their actions ----

  /**
   * The two sources answer different shapes, so both are flattened to what the
   * list actually draws. Building it here keeps `RecordList` unaware of what a
   * product is, and the memo keeps each row's `actions` array stable.
   */
  const items = useMemo<RecordItem[]>(() => {
    if (filter === 'menipis') {
      return lowRows.map((r) => ({
        id: r.id,
        title: r.nama,
        meta: `${r.kode || 'tanpa kode'} · kurang ${formatNumber(r.selisih)}`,
        fields: [
          { label: 'Stok', value: formatNumber(r.totalStok), danger: true, width: 110 },
          { label: 'Minimum', value: formatNumber(r.stokMin), width: 110 },
        ],
        // The endpoint answers only active products, so the archive direction
        // is the only one that applies here.
        actions: canWrite ? ACTIONS_AKTIF : ACTIONS_READONLY,
      }));
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.nama,
      badge: r.aktif ? undefined : 'Nonaktif',
      dimmed: !r.aktif,
      meta: `${r.kode} · diperbarui ${formatTanggal(r.updatedAt)}`,
      fields: [
        {
          label: 'Stok minimum',
          value: `${formatNumber(r.stokMin)} ${r.namaSatuanDasar}`,
          width: 150,
        },
      ],
      actions: !canWrite ? ACTIONS_READONLY : r.aktif ? ACTIONS_AKTIF : ACTIONS_NONAKTIF,
    }));
  }, [filter, lowRows, rows, canWrite]);

  const bulkActions = useMemo<RecordAction[]>(() => {
    if (!canWrite) return ACTIONS_READONLY;
    return filter === 'nonaktif'
      ? [{ key: 'aktifkan', label: 'Aktifkan' }]
      : [{ key: 'arsip', label: 'Arsipkan' }];
  }, [canWrite, filter]);

  /**
   * Runs first and offers to undo, rather than asking first. Flipping
   * `is_aktif` is the only removal the contract has - there is no
   * `DELETE /product` - so nothing here is unrecoverable, and a confirmation
   * dialog on every archive would cost more taps than the rare undo saves.
   */
  const setAktif = useCallback(
    async (ids: number[], aktif: boolean, label: string) => {
      try {
        await Promise.all(ids.map((id) => updateProduct(id, { is_aktif: aktif })));
      } catch (e) {
        toast(messageOf(e, 'Gagal mengubah status produk.'));
        reloadList();
        return;
      }
      setRows((list) => list.map((r) => (ids.includes(r.id) ? { ...r, aktif } : r)));
      // An archived product leaves the reorder list; the endpoint only answers
      // active ones.
      if (!aktif) setLowRows((list) => list.filter((r) => !ids.includes(r.id)));
      setUndo({
        message: `${label} ${aktif ? 'diaktifkan' : 'diarsipkan'}`,
        revert: async () => {
          await Promise.all(ids.map((id) => updateProduct(id, { is_aktif: !aktif })));
          reloadList();
        },
      });
    },
    [reloadList]
  );

  // Read through a ref, not a dependency: `rows` grows with every appended page,
  // and a handler that changes identity each time would hand every row a new
  // `onAction` and re-render the whole list.
  const rowsRef = useRef<ProductRow[]>([]);
  rowsRef.current = rows;

  const runRowAction = useCallback(
    (key: string, item: RecordItem) => {
      if (key === 'ubah') {
        const row = rowsRef.current.find((r) => r.id === item.id);
        if (row) openEditModal(row);
        // A reorder-list row is not a `ProductRow`, so the form is fed from the
        // detail endpoint instead of half-filled from what the list happens to
        // carry.
        else getProduct(item.id).then(openEditModal).catch(() => toast('Gagal memuat produk.'));
        return;
      }
      if (key === 'arsip' || key === 'aktifkan') {
        setAktif([item.id], key === 'aktifkan', item.title);
      }
    },
    [setAktif]
  );

  const runBulkAction = useCallback(
    (key: string, ids: number[]) => {
      setAktif(ids, key === 'aktifkan', `${ids.length} produk`);
    },
    [setAktif]
  );

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FILTER_KEY)
      .then((saved) => {
        if (!alive) return;
        if (saved === 'menipis' || saved === 'nonaktif') setFilter(saved);
      })
      .catch(() => {
        // A missing preference is not an error; 'semua' is the right default.
      });
    return () => {
      alive = false;
    };
  }, []);

  const pickFilter = useCallback((k: Filter) => {
    setFilter(k);
    AsyncStorage.setItem(FILTER_KEY, k).catch(() => {});
    // The reorder endpoint takes no `search`, so leaving a query sitting in the
    // now-disabled field would show text that no longer does anything.
    if (k === 'menipis') setQuery('');
  }, []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setFilter('semua');
    AsyncStorage.setItem(FILTER_KEY, 'semua').catch(() => {});
  }, []);

  const forgetUndo = useCallback(() => setUndo(null), []);

  const rememberScroll = useCallback((y: number) => {
    scrollY.current = y;
  }, []);

  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const undoLast = useCallback(() => {
    const pending = undo;
    setUndo(null);
    pending?.revert().catch(() => toast('Gagal membatalkan.'));
  }, [undo]);

  const stokTotal = stok.reduce((sum, s) => sum + (s.stok_akhir ?? 0), 0);

  return (
    <AppShell title="Master Produk">
        {view === 'list' && (
          <View style={styles.listWrap}>
            <RecordList
              items={items}
              loading={listLoading}
              error={listErr}
              filtered={search !== '' || filter !== 'semua'}
              bulkActions={bulkActions}
              onOpen={openDetail}
              onAction={runRowAction}
              onBulkAction={runBulkAction}
              onRetry={reloadList}
              onClearFilter={clearFilter}
              onCreate={canWrite ? openNewModal : undefined}
              createLabel="Produk baru"
              emptyTitle="Belum ada produk"
              emptySub="Master produk masih kosong. Tambahkan produk pertama untuk mulai mencatat stok dan harga."
              header={
                <View style={styles.listHeader}>
                  {/* The search field has the width to itself. It is the control
                      that gets used on every visit; the count was decoration and
                      creating a product moved into the list as its first row. */}
                  <View style={styles.searchWrap}>
                    <View style={styles.searchIcon} />
                    <View style={styles.searchIconHandle} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      editable={filter !== 'menipis'}
                      placeholder={
                        filter === 'menipis'
                          ? 'Pencarian tidak berlaku di daftar stok menipis'
                          : 'Cari nama atau kode barang'
                      }
                      style={[styles.searchInput, filter === 'menipis' && styles.searchInputOff]}
                    />
                  </View>
                  <FilterPills options={FILTER_OPTIONS} active={filter} onPick={pickFilter} />
                </View>
              }
              leadRow={
                canWrite ? (
                  <Pressable onPress={openNewModal} style={styles.newRow}>
                    <View style={styles.newRowPlus}>
                      <Text style={styles.newRowPlusText}>+</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.newRowTitle}>Produk baru</Text>
                      <Text style={styles.newRowSub}>Tambahkan barang ke master produk</Text>
                    </View>
                  </Pressable>
                ) : null
              }
              onEndReached={onEndReached}
              loadingMore={loadingMore}
              moreError={moreErr}
              onRetryMore={retryMore}
              initialScrollOffset={scrollY.current}
              onScrollOffset={rememberScroll}
            />
            <UndoBar message={undo?.message ?? null} onUndo={undoLast} onExpire={forgetUndo} />
          </View>
        )}

        {view === 'detail' && detailLoading && (
          <View style={styles.detailLoading}>
            <ActivityIndicator color={C.primary} />
          </View>
        )}

        {view === 'detail' && !detailLoading && current && (
          <ScrollView style={styles.detailWrap} contentContainerStyle={{ gap: 16, padding: 22 }}>
            <View style={styles.detailHead}>
              <Pressable onPress={closeDetail} style={styles.backBtn}>
                <Text style={styles.backBtnText}>← Daftar</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
                <Text style={styles.detailTitle}>{current.nama}</Text>
                {!current.aktif && (
                  <View style={styles.badgeNeutral}>
                    <Text style={styles.badgeNeutralText}>Nonaktif</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }} />
              {canWrite && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => openEditModal(current)} style={styles.smallBtn}>
                    <Text style={styles.smallBtnText}>Ubah produk</Text>
                  </Pressable>
                  <Pressable onPress={toggleAktif} disabled={saving} style={styles.smallBtn}>
                    <Text style={[styles.smallBtnText, { color: current.aktif ? C.red : C.primary }]}>
                      {current.aktif ? 'Nonaktifkan' : 'Aktifkan kembali'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
              <View style={[styles.card, wide ? { flex: 1, minWidth: 320 } : { width: '100%' }]}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardHeadText}>Satuan konversi</Text>
                  {canWrite && (
                    <Pressable onPress={openAddSatuan} style={styles.ghostBtn}>
                      <Text style={styles.ghostBtnText}>Tambah satuan</Text>
                    </Pressable>
                  )}
                </View>
                {current.satuan.map((s) => (
                  <View key={s.id} style={styles.satuanRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Text style={styles.satuanNama}>{s.nama || satuanNama(s.idSatuan)}</Text>
                      {s.idSatuan === current.idDasar && (
                        <View style={styles.badgeNeutral}>
                          <Text style={styles.badgeNeutralText}>Dasar</Text>
                        </View>
                      )}
                      {s.def && (
                        <View style={styles.badgeTint}>
                          <Text style={styles.badgeTintText}>Default input</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.satuanFaktor}>× {s.faktor}</Text>
                    <View style={{ width: 128, alignItems: 'flex-end' }}>
                      {canWrite && !s.def && (
                        <Pressable onPress={() => makeDefaultSatuan(s)} style={styles.tinyBtn}>
                          <Text style={styles.tinyBtnText}>Jadikan default</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.card, wide ? { flex: 2, minWidth: 420 } : { width: '100%' }]}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardHeadText}>Harga jual</Text>
                  {canWrite && (
                    <Pressable onPress={openAddHarga} style={styles.ghostBtn}>
                      <Text style={styles.ghostBtnText}>Versi harga baru</Text>
                    </Pressable>
                  )}
                </View>
                {current.harga.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Belum ada versi harga</Text>
                    <Text style={styles.emptySub}>Produk tanpa harga berlaku tidak muncul di layar kasir.</Text>
                  </View>
                ) : (
                  current.harga.map((h) => {
                    const today = todayISO();
                    const aktif = h.dari <= today && (h.sampai === null || h.sampai > today);
                    const belum = h.dari > today;
                    // Whether a nota already references this version is not in
                    // the payload; the server answers 409 and that message is
                    // what the user sees.
                    const canEdit = canWrite;
                    const canDelete = canDeleteHarga;
                    return (
                      <View key={h.id} style={styles.hargaRow}>
                        <Text style={styles.hargaSatuan}>{h.nama || satuanNama(h.idSatuan)}</Text>
                        <Text style={[styles.hargaValue, { color: aktif ? C.text : C.muted3 }]}>
                          {formatRupiah(h.harga)}
                        </Text>
                        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {aktif ? (
                            <View style={styles.badgeGreen}>
                              <Text style={styles.badgeGreenText}>Berlaku</Text>
                            </View>
                          ) : (
                            <View style={styles.badgeNeutral}>
                              <Text style={styles.badgeNeutralText}>{belum ? 'Terjadwal' : 'Lampau'}</Text>
                            </View>
                          )}
                          <Text style={styles.periodeText} numberOfLines={1}>
                            {formatTanggal(h.dari)} → {h.sampai ? formatTanggal(h.sampai) : 'tanpa batas'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {canEdit && (
                            <Pressable onPress={() => openEditHarga(h)} style={styles.tinyBtn}>
                              <Text style={styles.tinyBtnText}>Koreksi</Text>
                            </Pressable>
                          )}
                          {canDelete && (
                            <Pressable onPress={() => deleteHarga(h)} style={styles.tinyBtnDanger}>
                              <Text style={styles.tinyBtnDangerText}>Hapus</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadText}>Stok per ruang</Text>
                <Text style={styles.stokTotalText}>
                  Total {formatNumber(stokTotal)} {current.namaSatuanDasar}
                </Text>
              </View>
              <View style={styles.stokHeadRow}>
                <Text style={[styles.thText, { flex: 1 }]}>RUANG</Text>
                <Text style={[styles.thText, { width: 120, textAlign: 'right' }]}>STOK</Text>
                <Text style={[styles.thText, { width: 100 }]}>SATUAN</Text>
              </View>
              {stok.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Belum pernah bergerak</Text>
                  <Text style={styles.emptySub}>
                    Ruang hanya muncul setelah produk ini pernah masuk atau keluar darinya.
                  </Text>
                </View>
              )}
              {stok.map((r) => {
                const qty = r.stok_akhir ?? 0;
                return (
                  <View key={r.id_ruang} style={styles.stokRow}>
                    <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '500', color: C.text }}>{r.nama_ruang}</Text>
                    <Text
                      style={{
                        width: 120,
                        textAlign: 'right',
                        fontSize: 17,
                        fontWeight: '600',
                        color: qty === 0 ? C.muted : C.text,
                      }}>
                      {formatNumber(qty)}
                    </Text>
                    <Text style={{ width: 100, fontSize: 14.5, color: C.muted3 }}>{current.namaSatuanDasar}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

      <SatuanModal
        visible={!!satuanForm}
        satuanOptions={satuanPickOptions}
        idSatuan={satuanForm?.idSatuan ?? null}
        faktor={satuanForm?.faktor ?? ''}
        def={satuanForm?.def ?? false}
        error={satuanForm?.err ?? ''}
        onPickSatuan={(id) => setSatuanForm((f) => (f ? { ...f, idSatuan: id, err: '' } : f))}
        onFaktorChange={(v) => setSatuanForm((f) => (f ? { ...f, faktor: v, err: '' } : f))}
        onToggleDefault={() => setSatuanForm((f) => (f ? { ...f, def: !f.def } : f))}
        onCancel={() => setSatuanForm(null)}
        onSave={saveSatuan}
      />

      <HargaModal
        visible={!!hargaForm}
        isEdit={!!hargaForm?.editId}
        satuanOptions={hargaSatuanOptions}
        idSatuan={hargaForm?.idSatuan ?? null}
        harga={hargaForm?.harga ?? ''}
        dari={hargaForm?.dari ?? todayISO()}
        error={hargaForm?.err ?? ''}
        onPickSatuan={(id) => setHargaForm((f) => (f ? { ...f, idSatuan: id, err: '' } : f))}
        onHargaChange={(v) => setHargaForm((f) => (f ? { ...f, harga: v, err: '' } : f))}
        onDariChange={(v) => setHargaForm((f) => (f ? { ...f, dari: v, err: '' } : f))}
        onCancel={() => setHargaForm(null)}
        onSave={saveHarga}
      />

      <ProductFormModal
        visible={!!modal}
        isNew={modal === 'new'}
        kode={draft.kode}
        onKodeChange={(v) => {
          setDraft((d) => ({ ...d, kode: v }));
          setModalErr('');
        }}
        nama={draft.nama}
        onNamaChange={(v) => {
          setDraft((d) => ({ ...d, nama: v }));
          setModalErr('');
        }}
        stokMin={draft.stokMin}
        onStokMinChange={(v) => {
          setDraft((d) => ({ ...d, stokMin: v }));
          setModalErr('');
        }}
        satuanMasterOptions={satuanMasterOptions}
        idDasar={draft.idDasar}
        onIdDasarChange={(id) => setDraft((d) => ({ ...d, idDasar: id }))}
        satuanDasarLabel={draft.idDasar ? satuanNama(draft.idDasar) : ''}
        aktif={draft.aktif}
        onToggleAktif={() => setDraft((d) => ({ ...d, aktif: !d.aktif }))}
        error={modalErr}
        onCancel={closeProductModal}
        onSave={saveProduct}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  // Search and chips sit inside the list card and never scroll away with
  // the rows - on a long list they are the only way back out.
  listHeader: { gap: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight, padding: 14 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: {
    position: 'absolute',
    left: 13,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.muted,
    zIndex: 1,
  },
  searchIconHandle: {
    position: 'absolute',
    left: 24,
    top: 25,
    width: 8,
    height: 2,
    backgroundColor: C.muted,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  searchInput: {
    minHeight: 52,
    paddingLeft: 42,
    paddingRight: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    fontSize: 16.5,
    color: C.text,
  },
  searchInputOff: { backgroundColor: C.tableHeaderBg, color: C.muted2 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
    backgroundColor: C.tableHeaderBg,
  },
  newRowPlus: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRowPlusText: { fontSize: 19, lineHeight: 22, fontWeight: '600', color: '#fff' },
  newRowTitle: { fontSize: 15.5, fontWeight: '600', color: C.primaryDark },
  newRowSub: { marginTop: 2, fontSize: 13, color: C.muted3 },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  emptyState: { padding: 44, alignItems: 'center' },
  emptyTitle: { fontSize: 15.5, fontWeight: '500', color: C.dark2 },
  emptySub: { marginTop: 5, fontSize: 14, color: C.muted2, textAlign: 'center' },
  detailLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  detailWrap: { flex: 1 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  backBtn: { height: 38, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  detailTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  smallBtn: { height: 38, paddingHorizontal: 15, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  cardHead: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  cardHeadText: { fontSize: 16.5, fontWeight: '700', color: C.text },
  ghostBtn: { height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: C.primary },
  satuanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  satuanNama: { fontSize: 15.5, fontWeight: '500', color: C.text },
  satuanFaktor: { width: 80, fontSize: 14.5, color: C.dark2, textAlign: 'right' },
  tinyBtn: { height: 28, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tinyBtnText: { fontSize: 13.5, fontWeight: '600', color: C.dark2 },
  tinyBtnDanger: { height: 28, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: C.redBorder2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tinyBtnDangerText: { fontSize: 13.5, fontWeight: '600', color: C.red },
  badgeNeutral: { height: 20, paddingHorizontal: 8, borderRadius: 6, backgroundColor: C.badgeBg, borderWidth: 1, borderColor: C.borderCard, alignItems: 'center', justifyContent: 'center' },
  badgeNeutralText: { fontSize: 12.5, fontWeight: '600', color: C.muted3 },
  badgeTint: { height: 20, paddingHorizontal: 8, borderRadius: 6, backgroundColor: C.primaryTintBg, borderWidth: 1, borderColor: C.primaryTintBorder, alignItems: 'center', justifyContent: 'center' },
  badgeTintText: { fontSize: 12, fontWeight: '600', color: C.primaryDark },
  badgeGreen: { height: 22, paddingHorizontal: 9, borderRadius: 6, backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder, alignItems: 'center', justifyContent: 'center' },
  badgeGreenText: { fontSize: 12.5, fontWeight: '600', color: C.green },
  hargaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 66,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
    flexWrap: 'wrap',
    paddingVertical: 8,
  },
  hargaSatuan: { width: 60, fontSize: 15, color: C.dark2 },
  hargaValue: { width: 130, fontSize: 18, fontWeight: '700', textAlign: 'right' },
  periodeText: { fontSize: 13.5, color: C.muted3 },
  stokTotalText: { fontSize: 14.5, fontWeight: '600', color: C.primaryDark },
  stokHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 38,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  stokRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
});
