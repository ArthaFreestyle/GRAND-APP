/**
 * Supplier — one supplier.
 *
 * Three reads, one screen: `GET /supplier/{id}` for the record,
 * `GET /supplier/{id}/utang` for the bills still open, and
 * `GET /pembelian?id_supplier=` for what has been bought. The record decides
 * whether this page can render at all; the two lists beside it are allowed to
 * fail on their own and say so, because an empty debt queue and an unreachable
 * one are different facts — the contract is explicit about that — and the tiles
 * must not blur them into one reassuring "Rp 0".
 *
 * The old "Jatuh tempo" chips are gone with `tempo`. Nothing in the contract
 * carries a due date: not `Pembelian`, not `UtangSupplier`. What the server does
 * know about a bill is `status_pembayaran` — BELUM / SEBAGIAN / LUNAS — so that
 * is what the rows show.
 *
 * `?ubah=1` opens the edit dialog on arrival (that is how the list's "Ubah"
 * button gets here) and `?baru=1` says the create form just landed. Both are
 * read once on the way in: they seed the screen rather than driving it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BAYAR_META, DOKUMEN_META } from '@/components/pembelian/status';
import { AppShell } from '@/components/shell/AppShell';
import {
  Badge,
  Card,
  CardHead,
  EmptyState,
  GhostButton,
  IconAction,
  NeutralBadge,
  StatTile,
  Toast,
} from '@/components/shell/ui';
import {
  EMPTY_SUPPLIER,
  SupplierFormModal,
  type SupplierFormValues,
} from '@/components/supplier/form';
import { Colors as C, num, rp, tanggal } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { listPembelian, type PembelianRow } from '@/services/pembelian';
import { useCanWrite } from '@/services/permissions';
import {
  getSupplier,
  listUtang,
  supplierBus,
  updateSupplier,
  type Supplier,
  type UtangFaktur,
} from '@/services/supplier';

/**
 * The open-invoice queue is read as one page rather than paged in here: a
 * supplier holding more than this many unpaid bills is a bookkeeping emergency,
 * not a browsing problem. `paging.total_item` still reports the real count, so
 * the tiles can admit when they are summing only part of it.
 */
const UTANG_SIZE = 50;

/** Recent history, not an archive — the full ledger belongs to layar Pembelian (#8). */
const RIWAYAT_SIZE = 15;

/** The dialog only ever fills itself from a supplier that is already loaded. */
function draftOf(s: Supplier): SupplierFormValues {
  return {
    kode: s.kode,
    nama: s.nama,
    telepon: s.telepon,
    alamat: s.alamat,
    npwp: s.npwp,
    aktif: s.aktif,
  };
}

export default function SupplierDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [current, setCurrent] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [utang, setUtang] = useState<UtangFaktur[]>([]);
  const [utangTotal, setUtangTotal] = useState(0);
  const [utangErr, setUtangErr] = useState('');
  const [riwayat, setRiwayat] = useState<PembelianRow[]>([]);
  const [riwayatTotal, setRiwayatTotal] = useState(0);
  const [riwayatErr, setRiwayatErr] = useState('');

  const [draft, setDraft] = useState<SupplierFormValues | null>(null);
  const [draftErr, setDraftErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('supplier');

  // Read once, on the way in: the parameters seed this screen rather than
  // driving it, so closing the dialog does not have to rewrite the URL.
  const openEditOnLoad = useRef(params.ubah === '1');
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

  /**
   * The two side reads, kept together so the "Coba lagi" buttons can re-run them
   * without re-reading the supplier itself. `alive` belongs to the caller's
   * effect: a reader who leaves before these land must not set state on the way
   * out, and must not have a slow response repaint a screen that has moved on.
   */
  const loadSideLists = useCallback((supplierId: number, alive: () => boolean) => {
    setUtangErr('');
    setRiwayatErr('');

    listUtang(supplierId, { size: UTANG_SIZE })
      .then((p) => {
        if (!alive()) return;
        setUtang(p.data);
        setUtangTotal(p.paging.total_item ?? p.data.length);
      })
      .catch((e) => {
        if (!alive()) return;
        setUtang([]);
        setUtangTotal(0);
        setUtangErr(messageOf(e, 'Gagal memuat utang supplier.'));
      });

    listPembelian({ idSupplier: supplierId, size: RIWAYAT_SIZE })
      .then((p) => {
        if (!alive()) return;
        setRiwayat(p.data);
        setRiwayatTotal(p.paging.total_item ?? p.data.length);
      })
      .catch((e) => {
        if (!alive()) return;
        setRiwayat([]);
        setRiwayatTotal(0);
        setRiwayatErr(messageOf(e, 'Gagal memuat riwayat pembelian.'));
      });
  }, []);

  /**
   * Bumped whenever a newer set of side reads starts, so an older set that is
   * still in flight knows to drop its answer instead of painting over the fresh
   * one. Only a retry can cause that here, but a slow `utang` landing after the
   * reader has already retried is exactly the case that looks like a bug.
   */
  const generation = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoading(false);
      setLoadErr('Alamat supplier tidak dikenali.');
      return;
    }
    const mine = ++generation.current;
    // Two ways to go stale, and they are not the same one. `cancelled` is this
    // effect being torn down; the generation check is a retry started while
    // these were still in flight. The cleanup only touches the local, so it
    // never reads a ref that has moved on by the time it runs.
    let cancelled = false;
    const alive = () => !cancelled && generation.current === mine;

    setLoading(true);
    setLoadErr('');
    setUtang([]);
    setUtangTotal(0);
    setRiwayat([]);
    setRiwayatTotal(0);

    getSupplier(id)
      .then((detail) => {
        if (!alive()) return;
        setCurrent(detail);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Supplier ${detail.nama} ditambahkan`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          setDraft(draftOf(detail));
        }
        loadSideLists(id, alive);
      })
      .catch((e) => {
        if (!alive()) return;
        setCurrent(null);
        // Arrived at cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page.
        setLoadErr(messageOf(e, 'Gagal memuat detail supplier.'));
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, toast, loadSideLists]);

  const retrySideLists = useCallback(() => {
    if (!current) return;
    const mine = ++generation.current;
    loadSideLists(current.id, () => generation.current === mine);
  }, [current, loadSideLists]);

  /** Every write answers with the whole supplier, so this is the only sync needed. */
  const applyDetail = useCallback((saved: Supplier) => {
    setCurrent(saved);
    supplierBus.publish({ kind: 'saved', row: saved });
  }, []);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/supplier');
  }, [router]);

  const patchDraft = useCallback((patch: Partial<SupplierFormValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
    setDraftErr('');
  }, []);

  async function save() {
    if (!current || !draft || saving) return;
    const nama = draft.nama.trim();
    if (!nama) return setDraftErr('Nama wajib diisi.');

    setSaving(true);
    try {
      // `null` clears the column; an empty string would store one. The PATCH is
      // a true partial update, so that distinction reaches the database as typed.
      applyDetail(
        await updateSupplier(current.id, {
          kode: draft.kode.trim() || null,
          nama,
          telepon: draft.telepon.trim() || null,
          alamat: draft.alamat.trim() || null,
          npwp: draft.npwp.trim() || null,
          is_aktif: draft.aktif,
        })
      );
      closeDraft();
      toast('Perubahan tersimpan');
    } catch (e) {
      // 409 is a duplicate kode; the server names it.
      setDraftErr(messageOf(e, 'Gagal menyimpan supplier.'));
    } finally {
      setSaving(false);
    }
  }

  /** Archiving is `is_aktif: false` — there is no DELETE — so it stays a plain toggle. */
  async function toggleAktif() {
    if (!current || saving) return;
    const next = !current.aktif;
    setSaving(true);
    try {
      applyDetail(await updateSupplier(current.id, { is_aktif: next }));
      toast(next ? 'Supplier diaktifkan kembali' : 'Supplier dinonaktifkan');
    } catch (e) {
      toast(messageOf(e, 'Gagal mengubah status supplier.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- derived ----

  const utangJalan = utang.reduce((s, f) => s + decimalToNumber(f.sisa_utang), 0);
  const utangSebagian = utangTotal > utang.length;
  // The queue is oldest-first — the one list in the API sorted that way — so its
  // head is the bill that has waited longest, and the next one to pay.
  const tertua = utang.length ? utang[0] : null;
  const belanjaTerakhir = riwayat.length ? riwayat[0] : null;

  return (
    <AppShell
      title={current ? current.nama : 'Detail supplier'}
      onBack={goBack}
      headerRight={
        current && canWrite ? (
          <>
            <IconAction
              name="edit-2"
              label="Ubah supplier"
              onPress={() => setDraft(draftOf(current))}
            />
            {/* Archiving, not deleting: the contract has no DELETE for a
                supplier, and `is_aktif: false` is the only removal there is. The
                bin is what everyone reads as "take this out of the way", and
                the way back is the same button pointing the other way. */}
            <IconAction
              name={current.aktif ? 'trash-2' : 'rotate-ccw'}
              label={current.aktif ? 'Nonaktifkan supplier' : 'Aktifkan kembali'}
              tone={current.aktif ? 'danger' : 'primary'}
              onPress={toggleAktif}
              disabled={saving}
            />
          </>
        ) : undefined
      }>
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {!loading && !current && (
        <View style={styles.centerBox}>
          <Text style={styles.errText}>{loadErr || 'Supplier tidak ditemukan.'}</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      )}

      {!loading && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {/* Everything that acts on the record is in the header bar now.
              What the record *is* stays here. */}
          {!current.aktif && (
            <View style={styles.detailHead}>
              <NeutralBadge />
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Utang berjalan"
              value={utangErr ? '—' : rp(utangJalan)}
              valueClass={utangJalan > 0 ? 'text-danger' : 'text-foreground'}
              sub={
                utangErr
                  ? 'Gagal dimuat'
                  : utangSebagian
                    ? `dari ${utang.length} faktur terlama`
                    : utangJalan > 0
                      ? 'Sisa seluruh faktur terbuka'
                      : 'Tidak ada faktur terbuka'
              }
              subClass={utangErr ? 'text-danger' : 'text-faint'}
            />
            <StatTile
              label="Faktur terbuka"
              value={utangErr ? '—' : num(utangTotal)}
              valueClass={utangTotal > 0 ? 'text-danger' : 'text-foreground'}
              sub={utangSebagian ? `${utang.length} termuat di layar` : 'seluruhnya termuat'}
            />
            <StatTile
              label="Faktur terlama"
              value={tertua ? tanggal(tertua.tanggal) : '—'}
              sub={tertua ? `${tertua.nomor} · dibayar duluan` : 'Antrean pembayaran kosong'}
            />
            <StatTile
              label="Pembelian tercatat"
              value={riwayatErr ? '—' : num(riwayatTotal)}
              sub={
                riwayatErr
                  ? 'Gagal dimuat'
                  : belanjaTerakhir
                    ? `terakhir ${tanggal(belanjaTerakhir.tanggal)}`
                    : 'Belum pernah membeli'
              }
              subClass={riwayatErr ? 'text-danger' : 'text-faint'}
            />
          </View>

          <Card>
            <CardHead title="Kontak & alamat" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Kode</Text>
                <Text style={styles.kVal}>{current.kode || '—'}</Text>
              </View>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Telepon</Text>
                <Text style={styles.kVal}>{current.telepon || '—'}</Text>
              </View>
              <View style={[styles.contactCell, { borderRightWidth: 0 }]}>
                <Text style={styles.kLabel}>NPWP</Text>
                <Text style={styles.kVal}>{current.npwp || '—'}</Text>
              </View>
              <View style={[styles.contactCell, { flexBasis: '100%', borderRightWidth: 0 }]}>
                <Text style={styles.kLabel}>Alamat</Text>
                <Text style={styles.kVal}>{current.alamat || '—'}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <CardHead
              title="Utang berjalan"
              right={
                <Text style={{ fontSize: 14, color: C.muted3 }}>
                  {utangErr ? '—' : `${utangTotal} faktur`}
                </Text>
              }
            />
            {utangErr !== '' ? (
              <View style={styles.centerBox}>
                <Text style={styles.errText}>{utangErr}</Text>
                <GhostButton label="Coba lagi" onPress={retrySideLists} />
              </View>
            ) : utang.length === 0 ? (
              <EmptyState
                title="Tidak ada utang berjalan"
                sub="Hanya faktur pembelian yang sudah diposting dan masih punya sisa yang muncul di sini, paling lama di atas."
              />
            ) : (
              utang.map((f) => {
                const meta = BAYAR_META[f.status_pembayaran ?? 'BELUM'];
                return (
                  <View key={f.id_pembelian} style={styles.notaRow}>
                    <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>
                      {tanggal(f.tanggal)}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text
                        style={{ fontSize: 14, color: C.dark2, fontFamily: 'monospace' }}
                        numberOfLines={1}>
                        {f.nomor}
                      </Text>
                      <Text style={styles.metaText} numberOfLines={1}>
                        {f.no_faktur_supplier
                          ? `Faktur ${f.no_faktur_supplier}`
                          : 'Tanpa no. faktur'}
                        {f.jenis_pembayaran ? ` · ${f.jenis_pembayaran.toLowerCase()}` : ''}
                      </Text>
                    </View>
                    <View style={{ width: 150 }}>
                      <Badge label={meta.label} tone={meta.tone} small />
                    </View>
                    <Text style={{ width: 130, fontSize: 15, textAlign: 'right', color: C.muted3 }}>
                      {rp(decimalToNumber(f.total))}
                    </Text>
                    <Text
                      style={{
                        width: 130,
                        fontSize: 16,
                        fontWeight: '600',
                        textAlign: 'right',
                        color: C.red,
                      }}>
                      {rp(decimalToNumber(f.sisa_utang))}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>

          <Card>
            <CardHead
              title="Riwayat pembelian"
              right={
                <Text style={{ fontSize: 14, color: C.muted3 }}>
                  {riwayatErr
                    ? '—'
                    : riwayatTotal > riwayat.length
                      ? `${riwayat.length} terbaru dari ${riwayatTotal}`
                      : `${riwayatTotal} dokumen`}
                </Text>
              }
            />
            {riwayatErr !== '' ? (
              <View style={styles.centerBox}>
                <Text style={styles.errText}>{riwayatErr}</Text>
                <GhostButton label="Coba lagi" onPress={retrySideLists} />
              </View>
            ) : riwayat.length === 0 ? (
              <EmptyState
                title="Belum ada pembelian"
                sub="Dokumen pembelian dari supplier ini akan muncul di sini, terbaru di atas."
              />
            ) : (
              riwayat.map((h) => {
                const meta = DOKUMEN_META[h.status];
                return (
                  <View key={h.id} style={styles.notaRow}>
                    <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>
                      {tanggal(h.tanggal)}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text
                        style={{ fontSize: 14, color: C.dark2, fontFamily: 'monospace' }}
                        numberOfLines={1}>
                        {h.nomor}
                      </Text>
                      <Text style={styles.metaText} numberOfLines={1}>
                        {h.noFakturSupplier ? `Faktur ${h.noFakturSupplier}` : 'Tanpa no. faktur'}
                        {h.tanggalFaktur ? ` · ${tanggal(h.tanggalFaktur)}` : ''}
                      </Text>
                    </View>
                    <View style={{ width: 110 }}>
                      <Badge label={meta.label} tone={meta.tone} small />
                    </View>
                    <View style={{ width: 150 }}>
                      <Badge
                        label={BAYAR_META[h.statusBayar].label}
                        tone={BAYAR_META[h.statusBayar].tone}
                        small
                      />
                    </View>
                    <Text
                      style={{ width: 130, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>
                      {rp(decimalToNumber(h.total))}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
      )}

      <SupplierFormModal
        visible={!!draft}
        values={draft ?? EMPTY_SUPPLIER}
        onChange={patchDraft}
        error={draftErr}
        onCancel={closeDraft}
        onSave={save}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  metaText: { fontSize: 12.5, color: C.muted },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  detailTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  contactCell: {
    flexGrow: 1,
    flexBasis: 200,
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: C.borderLighter,
    gap: 3,
  },
  kLabel: { fontSize: 12.5, color: C.muted2 },
  kVal: { fontSize: 15, color: C.text, lineHeight: 20 },
  notaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 58,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
});
