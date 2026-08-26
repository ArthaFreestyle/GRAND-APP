import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppShell } from '@/components/shell/AppShell';
import { HargaModal, ProductFormModal, SatuanModal, Toast } from '@/components/produk/modals';
import {
  INITIAL_PRODUCTS,
  ProdukColors as C,
  ProductHargaRow,
  ProductItem,
  ProductSatuanRow,
  RUANG_LIST,
  Role,
  SATUAN_MASTER,
  formatNumber,
  formatRupiah,
  formatTanggal,
  satuanNama,
  todayISO,
} from '@/constants/produk';

const PAGE_SIZE = 8;
const CURRENT_USER = 'admin.rina';
const ROLE: Role = 'ADMIN';

type ModalKind = 'new' | 'edit' | null;

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

export default function ProdukScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [seq, setSeq] = useState(900);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<ModalKind>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [modalErr, setModalErr] = useState('');

  const [satuanForm, setSatuanForm] = useState<SatuanFormState | null>(null);
  const [hargaForm, setHargaForm] = useState<HargaFormState | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = ROLE !== 'STAFF';
  const canDeleteHarga = ROLE === 'SUPERADMIN';

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  function patchProduct(id: number, patch: Partial<ProductItem>) {
    setProducts((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, ...patch, updatedAt: nowLabel(), updatedBy: CURRENT_USER }
          : p
      )
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q)
    );
  }, [products, query]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = products.find((p) => p.id === openId) ?? null;

  const pagingLabel = filtered.length
    ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} dari ${filtered.length} · halaman ${currentPage}/${totalPage}`
    : '0 hasil';

  // ---- product form ----

  function openNewModal() {
    setDraft({ id: null, kode: '', nama: '', stokMin: '0', aktif: true, idDasar: SATUAN_MASTER[0].id });
    setModalErr('');
    setModal('new');
  }

  function openEditModal(p: ProductItem) {
    setDraft({ id: p.id, kode: p.kode, nama: p.nama, stokMin: String(p.stokMin), aktif: p.aktif, idDasar: p.idDasar });
    setModalErr('');
    setModal('edit');
  }

  function closeProductModal() {
    setModal(null);
    setDraft(EMPTY_DRAFT);
    setModalErr('');
  }

  function saveProduct() {
    const nama = draft.nama.trim();
    if (!nama) return setModalErr('400 — nama wajib diisi.');
    const stokMin = parseInt(draft.stokMin || '0', 10);
    if (Number.isNaN(stokMin) || stokMin < 0) return setModalErr('400 — stok minimum harus bilangan bulat ≥ 0.');

    if (modal === 'new') {
      const kode = draft.kode.trim();
      if (!kode) return setModalErr('400 — kode barang wajib diisi.');
      if (products.some((p) => p.kode.toLowerCase() === kode.toLowerCase())) {
        return setModalErr(`409 — kode barang ${kode} sudah dipakai produk lain.`);
      }
      const idDasar = draft.idDasar ?? SATUAN_MASTER[0].id;
      const id = seq + 1;
      const stok: Record<number, number> = {};
      RUANG_LIST.forEach((r) => (stok[r.id] = 0));
      const newProduct: ProductItem = {
        id,
        kode,
        nama,
        idDasar,
        stokMin,
        aktif: true,
        updatedAt: nowLabel(),
        updatedBy: CURRENT_USER,
        satuan: [{ id: id * 10, idSatuan: idDasar, faktor: 1, def: true }],
        harga: [],
        stok,
      };
      setProducts((list) => [...list, newProduct]);
      setSeq(id);
      closeProductModal();
      setView('detail');
      setOpenId(id);
      toast(`Produk dibuat · satuan dasar ${satuanNama(idDasar)} terdaftar otomatis faktor 1`);
      return;
    }

    if (draft.id != null) {
      patchProduct(draft.id, { nama, stokMin, aktif: draft.aktif });
    }
    closeProductModal();
    toast('Perubahan tersimpan');
  }

  // ---- satuan ----

  function openAddSatuan() {
    setSatuanForm({ idSatuan: SATUAN_MASTER[0].id, faktor: '', def: false, err: '' });
  }

  function saveSatuan() {
    if (!current || !satuanForm) return;
    const faktor = parseInt(satuanForm.faktor || '0', 10);
    const idSatuan = satuanForm.idSatuan;
    if (!idSatuan) return setSatuanForm({ ...satuanForm, err: '400 — pilih satuan dulu.' });
    if (Number.isNaN(faktor) || faktor < 1) {
      return setSatuanForm({ ...satuanForm, err: '400 — faktor harus bilangan bulat ≥ 1.' });
    }
    if (idSatuan === current.idDasar && faktor !== 1) {
      return setSatuanForm({ ...satuanForm, err: '400 — satuan dasar hanya boleh faktor 1.' });
    }
    const exists = current.satuan.find((s) => s.idSatuan === idSatuan);
    let satuan: ProductSatuanRow[];
    if (exists) {
      satuan = current.satuan.map((s) => (s.idSatuan === idSatuan ? { ...s, faktor } : s));
    } else {
      satuan = current.satuan.concat([{ id: Date.now(), idSatuan, faktor, def: false }]);
    }
    if (satuanForm.def) {
      satuan = satuan.map((s) => ({ ...s, def: s.idSatuan === idSatuan }));
    }
    satuan = [...satuan].sort((a, b) => a.faktor - b.faktor);
    patchProduct(current.id, { satuan });
    setSatuanForm(null);
    toast(exists ? `Faktor ${satuanNama(idSatuan)} diperbarui` : `Satuan ${satuanNama(idSatuan)} ditambahkan`);
  }

  function makeDefaultSatuan(idSatuan: number) {
    if (!current) return;
    patchProduct(current.id, {
      satuan: current.satuan.map((s) => ({ ...s, def: s.idSatuan === idSatuan })),
    });
    toast(`Default input pindah ke ${satuanNama(idSatuan)}`);
  }

  // ---- harga jual ----

  function openAddHarga() {
    if (!current) return;
    setHargaForm({
      editId: null,
      idSatuan: current.satuan[0] ? current.satuan[0].idSatuan : null,
      harga: '',
      dari: todayISO(),
      err: '',
    });
  }

  function openEditHarga(row: ProductHargaRow) {
    setHargaForm({ editId: row.id, idSatuan: row.idSatuan, harga: String(row.harga), dari: row.dari, err: '' });
  }

  function saveHarga() {
    if (!current || !hargaForm) return;
    const harga = parseInt(String(hargaForm.harga || '').replace(/\D/g, ''), 10);
    if (Number.isNaN(harga) || harga <= 0) {
      return setHargaForm({ ...hargaForm, err: '400 — harga wajib diisi.' });
    }

    if (hargaForm.editId) {
      const row = current.harga.find((h) => h.id === hargaForm.editId);
      if (row && row.dipakai > 0) {
        return setHargaForm({
          ...hargaForm,
          err: `409 — versi ini dirujuk ${row.dipakai} baris penjualan_detail. Hapus lalu ketik ulang tidak mungkin; biarkan apa adanya.`,
        });
      }
      patchProduct(current.id, {
        harga: current.harga.map((h) => (h.id === hargaForm.editId ? { ...h, harga } : h)),
      });
      setHargaForm(null);
      toast('Harga versi dikoreksi');
      return;
    }

    const idSatuan = hargaForm.idSatuan;
    const dari = hargaForm.dari || todayISO();
    if (!idSatuan) return setHargaForm({ ...hargaForm, err: '400 — pilih satuan dulu.' });
    if (!current.satuan.some((s) => s.idSatuan === idSatuan)) {
      return setHargaForm({ ...hargaForm, err: '400 — satuan itu belum terdaftar di produk ini.' });
    }
    const bentrok = current.harga.find(
      (h) => h.idSatuan === idSatuan && h.sampai !== null && h.dari <= dari && h.sampai > dari
    );
    if (bentrok) {
      return setHargaForm({
        ...hargaForm,
        err: `409 — periode tumpang tindih dengan versi ${formatTanggal(bentrok.dari)} → ${formatTanggal(bentrok.sampai)}.`,
      });
    }
    let harga2 = current.harga.map((h) =>
      h.idSatuan === idSatuan && h.sampai === null && h.dari <= dari ? { ...h, sampai: dari } : h
    );
    harga2 = [{ id: Date.now(), idSatuan, harga, dari, sampai: null, dipakai: 0 }, ...harga2];
    harga2.sort((a, b) => (a.dari < b.dari ? 1 : a.dari > b.dari ? -1 : 0));
    patchProduct(current.id, { harga: harga2 });
    setHargaForm(null);
    toast(`Versi harga baru berlaku mulai ${formatTanggal(dari)} · versi terbuka sebelumnya ditutup`);
  }

  function deleteHarga(row: ProductHargaRow) {
    if (!current) return;
    if (row.dipakai > 0) return toast(`409 — versi ini dirujuk ${row.dipakai} baris nota`);
    const sisa = current.harga.filter((h) => h.id !== row.id);
    const sebelum = sisa
      .filter((h) => h.idSatuan === row.idSatuan && h.dari < row.dari)
      .sort((a, b) => (a.dari < b.dari ? 1 : -1))[0];
    const harga = sisa.map((h) => (sebelum && h.id === sebelum.id ? { ...h, sampai: row.sampai } : h));
    patchProduct(current.id, { harga });
    toast(sebelum ? `Versi dihapus · versi ${formatTanggal(sebelum.dari)} dibuka kembali` : 'Versi dihapus');
  }

  const satuanMasterOptions = SATUAN_MASTER.map((x) => ({ value: String(x.id), label: x.nama }));
  const pakaiIds = current ? current.satuan.map((x) => x.idSatuan) : [];
  const satuanPickOptions = SATUAN_MASTER.map((x) => ({
    value: String(x.id),
    label: x.nama + (pakaiIds.includes(x.id) ? ' — sudah terdaftar, faktor akan diperbarui' : ''),
  }));
  const hargaSatuanOptions = current
    ? current.satuan.map((x) => ({ value: String(x.idSatuan), label: satuanNama(x.idSatuan) }))
    : [];

  return (
    <AppShell title="Master Produk">
        {view === 'list' && (
          <View style={styles.listWrap}>
            <View style={styles.toolbar}>
              <View style={styles.searchWrap}>
                <View style={styles.searchIcon} />
                <View style={styles.searchIconHandle} />
                <TextInput
                  value={query}
                  onChangeText={(t) => {
                    setQuery(t);
                    setPage(1);
                  }}
                  placeholder="Cari nama atau kode barang"
                  style={styles.searchInput}
                />
              </View>
              <Text style={styles.countLabel}>{filtered.length} produk</Text>
              <View style={{ flex: 1 }} />
              {canWrite && (
                <Pressable onPress={openNewModal} style={styles.newBtn}>
                  <Text style={styles.newBtnText}>Produk baru</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.thText, { width: 120 }]}>KODE BARANG</Text>
                <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
                <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>
                  STOK TOTAL{'\n'}
                  <Text style={{ color: '#B4BAC2', fontWeight: '500' }}>semua ruang</Text>
                </Text>
                <View style={{ width: 90 }} />
              </View>

              <ScrollView style={styles.tableBody}>
                {slice.map((r) => {
                  const unit = satuanNama(r.idDasar);
                  const total = RUANG_LIST.reduce((sum, rr) => sum + (r.stok[rr.id] || 0), 0);
                  return (
                    <View key={r.id} style={styles.row}>
                      <Pressable
                        style={styles.rowMain}
                        onPress={() => {
                          setView('detail');
                          setOpenId(r.id);
                          setSatuanForm(null);
                          setHargaForm(null);
                        }}>
                        <Text style={[styles.kodeText, { width: 120 }]}>{r.kode}</Text>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                            <Text
                              style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]}
                              numberOfLines={1}>
                              {r.nama}
                            </Text>
                            {!r.aktif && (
                              <View style={styles.badgeNeutral}>
                                <Text style={styles.badgeNeutralText}>Nonaktif</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.metaText} numberOfLines={1}>
                            Diperbarui {r.updatedAt} · {r.updatedBy}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.stokText,
                            { width: 150, color: r.aktif ? C.text : C.muted2 },
                          ]}>
                          {formatNumber(total)} {unit}
                        </Text>
                      </Pressable>
                      <View style={{ width: 90, alignItems: 'flex-end' }}>
                        {canWrite && (
                          <Pressable onPress={() => openEditModal(r)} style={styles.ubahBtn}>
                            <Text style={styles.ubahBtnText}>Ubah</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
                {slice.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Tidak ada produk yang cocok</Text>
                    <Text style={styles.emptySub}>Pencarian mencocokkan sebagian nama atau kode barang.</Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.pagingBar}>
                <Text style={styles.pagingLabel}>{pagingLabel}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                    style={styles.pageBtn}>
                    <Text style={styles.pageBtnText}>Sebelumnya</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPage((p) => Math.min(totalPage, p + 1))}
                    style={styles.pageBtn}>
                    <Text style={styles.pageBtnText}>Berikutnya</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        )}

        {view === 'detail' && current && (
          <ScrollView style={styles.detailWrap} contentContainerStyle={{ gap: 16, padding: 22 }}>
            <View style={styles.detailHead}>
              <Pressable
                onPress={() => {
                  setView('list');
                  setOpenId(null);
                  setSatuanForm(null);
                  setHargaForm(null);
                }}
                style={styles.backBtn}>
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
                  <Pressable
                    onPress={() => {
                      patchProduct(current.id, { aktif: !current.aktif });
                      toast(
                        current.aktif
                          ? 'Produk dinonaktifkan · tidak lagi muncul di kasir'
                          : 'Produk diaktifkan kembali'
                      );
                    }}
                    style={styles.smallBtn}>
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
                      <Text style={styles.satuanNama}>{satuanNama(s.idSatuan)}</Text>
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
                        <Pressable onPress={() => makeDefaultSatuan(s.idSatuan)} style={styles.tinyBtn}>
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
                    const canEdit = canWrite && h.dipakai === 0;
                    const canDelete = canDeleteHarga && h.dipakai === 0;
                    return (
                      <View key={h.id} style={styles.hargaRow}>
                        <Text style={styles.hargaSatuan}>{satuanNama(h.idSatuan)}</Text>
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
                  Total {formatNumber(RUANG_LIST.reduce((sum, r) => sum + (current.stok[r.id] || 0), 0))}{' '}
                  {satuanNama(current.idDasar)}
                </Text>
              </View>
              <View style={styles.stokHeadRow}>
                <Text style={[styles.thText, { flex: 1 }]}>RUANG</Text>
                <Text style={[styles.thText, { width: 120, textAlign: 'right' }]}>STOK</Text>
                <Text style={[styles.thText, { width: 100 }]}>SATUAN</Text>
              </View>
              {RUANG_LIST.map((r) => {
                const qty = current.stok[r.id] || 0;
                return (
                  <View key={r.id} style={styles.stokRow}>
                    <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '500', color: C.text }}>{r.nama}</Text>
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
                    <Text style={{ width: 100, fontSize: 14.5, color: C.muted3 }}>{satuanNama(current.idDasar)}</Text>
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

function nowLabel(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchWrap: { position: 'relative', flex: 1, maxWidth: 420, justifyContent: 'center' },
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
    height: 42,
    paddingLeft: 36,
    paddingRight: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    fontSize: 15.5,
    color: C.text,
  },
  countLabel: { fontSize: 14, color: C.muted3 },
  newBtn: { height: 42, paddingHorizontal: 16, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  newBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  tableCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    height: 48,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  tableBody: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
    minHeight: 74,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10 },
  kodeText: { fontFamily: 'monospace', fontSize: 14.5, color: C.dark2 },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted },
  stokText: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
  ubahBtn: { height: 40, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ubahBtnText: { fontSize: 14, fontWeight: '600', color: C.dark2 },
  emptyState: { padding: 44, alignItems: 'center' },
  emptyTitle: { fontSize: 15.5, fontWeight: '500', color: C.dark2 },
  emptySub: { marginTop: 5, fontSize: 14, color: C.muted2, textAlign: 'center' },
  pagingBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.tableHeaderBg,
  },
  pagingLabel: { fontSize: 14, color: C.muted3 },
  pageBtn: { height: 30, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pageBtnText: { fontSize: 14, fontWeight: '600', color: C.dark2 },
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
