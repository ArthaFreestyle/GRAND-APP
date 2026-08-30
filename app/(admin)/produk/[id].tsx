/**
 * Master Produk — one product.
 *
 * A route, so the product has a URL that can be deep linked, shared, and
 * reloaded, and so the Android back button pops it back to the list instead of
 * leaving the section. The list is still mounted underneath and keeps its
 * scroll; anything saved here is announced over `produkBus` so its row updates
 * without a refetch.
 *
 * `?ubah=1` opens the edit dialog on arrival — that is how the list's "Ubah
 * produk" row action gets here, since a reorder-list row is not a whole product
 * and this screen is the only place that holds one.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  HargaModal,
  ProductFormModal,
  SatuanModal,
  Toast,
  type ProductFormValues,
} from '@/components/produk/modals';
import { AppShell } from '@/components/shell/AppShell';
import { IconAction } from '@/components/shell/ui';
import {
  ProdukColors as C,
  formatNumber,
  formatRupiah,
  formatTanggal,
  todayISO,
} from '@/constants/produk';
import { atLeast, useBreakpoint } from '@/hooks/use-breakpoint';
import { messageOf } from '@/services/api';
import { rupiahToDecimal } from '@/services/decimal';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import {
  addHarga,
  deleteHarga as apiDeleteHarga,
  getProduct,
  listSatuan,
  listStok,
  produkBus,
  updateHarga,
  updateProduct,
  upsertSatuan,
  type ProductDetail,
  type ProductHargaRow,
  type ProductSatuanRow,
  type StokRuang,
} from '@/services/produk';
import type { components } from '@/types/api';

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

/** The edit dialog only ever fills itself from a product that is already loaded. */
function draftOf(p: ProductDetail): ProductFormValues {
  return {
    kode: p.kode,
    nama: p.nama,
    stokMin: String(p.stokMin),
    aktif: p.aktif,
    idDasar: p.idDasar,
  };
}

export default function ProdukDetailScreen() {
  // The two cards sit side by side once there is room for both at their
  // minimum widths, and stack otherwise.
  const wide = atLeast(useBreakpoint(), 'large');
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [current, setCurrent] = useState<ProductDetail | null>(null);
  const [stok, setStok] = useState<StokRuang[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [satuanMaster, setSatuanMaster] = useState<components['schemas']['Satuan'][]>([]);
  const [satuanForm, setSatuanForm] = useState<SatuanFormState | null>(null);
  const [hargaForm, setHargaForm] = useState<HargaFormState | null>(null);

  const [draft, setDraft] = useState<ProductFormValues | null>(null);
  const [draftErr, setDraftErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('produk');
  // Retiring a price version is a hard delete that rewrites the price history,
  // so it stays with SUPERADMIN even though the rest of the screen is INVENTARIS'.
  const canDeleteHarga = useActiveRole() === 'SUPERADMIN';

  // Read once, on the way in: the query parameter seeds the dialog rather than
  // driving it, so closing the dialog does not have to rewrite the URL.
  const openEditOnLoad = useRef(params.ubah === '1');
  // `baru=1` says the create form landed here. The explanation belongs on this
  // screen because the satuan dasar it names is only known once the product has
  // been read back.
  const announceCreated = useRef(params.baru === '1');

  const toast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ---- load ----

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoading(false);
      setLoadErr('Alamat produk tidak dikenali.');
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadErr('');
    setStok([]);
    getProduct(id)
      .then((detail) => {
        if (!alive) return;
        setCurrent(detail);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Produk dibuat · satuan dasar ${detail.namaSatuanDasar} terdaftar otomatis faktor 1`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          setDraft(draftOf(detail));
        }
        // Stock is a separate read: the product payload never carries it, and
        // asking for it per list row is the N+1 the contract warns against.
        listStok(id)
          .then((rows) => {
            if (alive) setStok(rows);
          })
          .catch(() => {
            if (alive) setStok([]);
          });
      })
      .catch((e) => {
        if (!alive) return;
        setCurrent(null);
        // A route can be arrived at cold - a deep link, a reload, a shared URL -
        // so a failure here needs a page that says so, not a toast over a list
        // that may not be behind this screen at all.
        setLoadErr(messageOf(e, 'Gagal memuat detail produk.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, toast]);

  useEffect(() => {
    listSatuan()
      .then(setSatuanMaster)
      .catch(() => {
        // The dropdowns degrade to empty; the forms report it when used.
      });
  }, []);

  const satuanNama = useCallback(
    (sid: number | null | undefined) => satuanMaster.find((s) => s.id === sid)?.nama ?? '—',
    [satuanMaster]
  );

  /**
   * Every write answers with the whole product, so this is the only sync
   * needed. Only the columns the list actually renders go onto the bus: handing
   * it satuan and harga would leave a second, quietly diverging copy of them in
   * a row that never draws either.
   */
  const applyDetail = useCallback((detail: ProductDetail) => {
    setCurrent(detail);
    const { id: rowId, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt } = detail;
    produkBus.publish({
      kind: 'saved',
      row: { id: rowId, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt },
    });
  }, []);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/produk');
  }, [router]);

  // ---- product form (edit only; creating one is `produk/baru`) ----

  const patchDraft = useCallback((patch: Partial<ProductFormValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
    setDraftErr('');
  }, []);

  async function saveProduct() {
    if (!current || !draft || saving) return;
    const nama = draft.nama.trim();
    if (!nama) return setDraftErr('Nama wajib diisi.');
    const stokMin = parseInt(draft.stokMin || '0', 10);
    if (Number.isNaN(stokMin) || stokMin < 0) {
      return setDraftErr('Stok minimum harus bilangan bulat ≥ 0.');
    }

    setSaving(true);
    try {
      // kode_barang and id_satuan_dasar are immutable, so they are not sent.
      applyDetail(
        await updateProduct(current.id, { nama, stok_minimum: stokMin, is_aktif: draft.aktif })
      );
      closeDraft();
      toast('Perubahan tersimpan');
    } catch (e) {
      setDraftErr(messageOf(e, 'Gagal menyimpan produk.'));
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
        await upsertSatuan(current.id, {
          id_satuan: idSatuan,
          faktor,
          is_default_input: satuanForm.def,
        })
      );
      setSatuanForm(null);
      toast(
        exists ? `Faktor ${satuanNama(idSatuan)} diperbarui` : `Satuan ${satuanNama(idSatuan)} ditambahkan`
      );
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

  const pakaiIds = current ? current.satuan.map((x) => x.idSatuan) : [];
  const satuanPickOptions = satuanMaster.map((x) => ({
    value: String(x.id),
    label:
      (x.nama ?? '') + (pakaiIds.includes(x.id ?? -1) ? ' — sudah terdaftar, faktor akan diperbarui' : ''),
  }));
  const hargaSatuanOptions = useMemo(
    () =>
      current
        ? current.satuan.map((x) => ({ value: String(x.idSatuan), label: x.nama || satuanNama(x.idSatuan) }))
        : [],
    [current, satuanNama]
  );

  const stokTotal = stok.reduce((sum, s) => sum + (s.stok_akhir ?? 0), 0);

  return (
    <AppShell
      title={current ? current.nama : 'Detail produk'}
      onBack={goBack}
      headerRight={
        current && canWrite ? (
          <>
            <IconAction
              name="edit-2"
              label="Ubah produk"
              onPress={() => setDraft(draftOf(current))}
            />
            {/* Archiving, not deleting — the contract has no `DELETE /product`,
                and `is_aktif: false` is the only removal there is. The bin is
                the icon everyone reads as "take this out of the way", and the
                way back is the same button pointing the other way. */}
            <IconAction
              name={current.aktif ? 'trash-2' : 'rotate-ccw'}
              label={current.aktif ? 'Arsipkan produk' : 'Aktifkan kembali'}
              tone={current.aktif ? 'danger' : 'primary'}
              onPress={toggleAktif}
              disabled={saving}
            />
          </>
        ) : undefined
      }>
      {loading && (
        <View style={styles.detailLoading}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {!loading && !current && (
        <View style={styles.detailLoading}>
          <Text style={styles.emptyTitle}>{loadErr || 'Produk tidak ditemukan.'}</Text>
          <Pressable onPress={goBack} style={[styles.backBtn, { marginTop: 14 }]}>
            <Text style={styles.backBtnText}>← Daftar</Text>
          </Pressable>
        </View>
      )}

      {!loading && current && (
        <ScrollView style={styles.detailWrap} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {/* Everything that acts on the product is in the header bar now.
              What the record *is* stays here. */}
          {!current.aktif && (
            <View style={styles.detailHead}>
              <View style={styles.badgeNeutral}>
                <Text style={styles.badgeNeutralText}>Nonaktif</Text>
              </View>
            </View>
          )}

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
        onPickSatuan={(sid) => setSatuanForm((f) => (f ? { ...f, idSatuan: sid, err: '' } : f))}
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
        onPickSatuan={(sid) => setHargaForm((f) => (f ? { ...f, idSatuan: sid, err: '' } : f))}
        onHargaChange={(v) => setHargaForm((f) => (f ? { ...f, harga: v, err: '' } : f))}
        onDariChange={(v) => setHargaForm((f) => (f ? { ...f, dari: v, err: '' } : f))}
        onCancel={() => setHargaForm(null)}
        onSave={saveHarga}
      />

      <ProductFormModal
        visible={!!draft}
        values={draft ?? { kode: '', nama: '', stokMin: '0', aktif: true, idDasar: null }}
        onChange={patchDraft}
        satuanDasarLabel={current ? current.namaSatuanDasar : ''}
        error={draftErr}
        onCancel={closeDraft}
        onSave={saveProduct}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  emptyState: { padding: 44, alignItems: 'center' },
  emptyTitle: { fontSize: 15.5, fontWeight: '500', color: C.dark2 },
  emptySub: { marginTop: 5, fontSize: 14, color: C.muted2, textAlign: 'center' },
  detailLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  detailWrap: { flex: 1 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  backBtn: { height: 38, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
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
