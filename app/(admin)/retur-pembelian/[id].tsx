/**
 * Retur pembelian — one document.
 *
 * The same workflow as a pembelian and the same split between two people:
 * `INVENTARIS` types and submits, `SUPERADMIN` posts, rejects, and cancels. A
 * transition the active grant cannot run is not rendered at all.
 *
 * Editing is a `DRAFT` matter only — `PATCH` and `PUT .../detail` both answer
 * 409 once the document is submitted. The header is two fields, `tanggal` and
 * `alasan`, and `alasan` may be changed but never emptied: create demands one, so
 * a patch that cleared it would leave a document that could not have been made.
 *
 * ### The three amounts on this page are three different questions
 *
 * `total` is the inventory value leaving, at the harga pokok the invoice fixed —
 * that is what makes the purchase and its return cancel out.
 * `nilai_kredit_utang` is what the supplier credits, `pembelian.total x
 * nilai_faktur_retur / pembelian.subtotal`, so the nota discount and the PPN
 * scale with it; it is smaller than `total` because harga pokok carries a share
 * of the freight paid to the carrier. And what `kartu_stok` will record is
 * neither: an outgoing line is valued at the moving average in force at the
 * time, because the goods mixed with older stock the moment they arrived. This
 * screen shows the first two and says plainly that it does not know the third.
 *
 * `?ubah=1` opens the header dialog on arrival and `?baru=1` says the create form
 * just landed. Both are read once on the way in.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AksiDialog } from '@/components/pembelian/aksi-dialog';
import { DOKUMEN_META } from '@/components/pembelian/status';
import {
  barisSumber,
  draftsDari,
  nilaiTurunan,
  turunanToInput,
  TurunanLineEditor,
  type TurunanDraft,
} from '@/components/pembelian/turunan';
import { AppShell } from '@/components/shell/AppShell';
import {
  Badge,
  Card,
  CardHead,
  EmptyState,
  ErrorBanner,
  Field,
  GhostButton,
  ModalFooter,
  ModalHead,
  ModalShell,
  PrimaryButton,
  SecondaryButton,
  StatTile,
  TextField,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, rp, tanggal } from '@/constants/theme-erp';
import type { AksiDokumen } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { decimalToNumber, formatDesimal } from '@/services/decimal';
import { getPembelian } from '@/services/pembelian';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import {
  aksiTersedia,
  getRetur,
  jalankanAksi,
  replaceReturDetail,
  returBus,
  rowOf,
  updateRetur,
  type ReturDoc,
} from '@/services/retur-pembelian';

interface HeaderDraft {
  tanggal: string;
  alasan: string;
}

export default function ReturPembelianDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [doc, setDoc] = useState<ReturDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [draft, setDraft] = useState<HeaderDraft | null>(null);
  const [draftErr, setDraftErr] = useState('');

  /** `null` means the lines are not being edited. */
  const [lines, setLines] = useState<TurunanDraft[] | null>(null);
  const [linesErr, setLinesErr] = useState('');
  const [linesLoading, setLinesLoading] = useState(false);

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('retur-pembelian');
  const role = useActiveRole();

  // Read once, on the way in.
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

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoading(false);
      setLoadErr('Alamat dokumen tidak dikenali.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadErr('');

    getRetur(id)
      .then((current) => {
        if (cancelled) return;
        setDoc(current);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Dokumen ${current.nomor} tersimpan sebagai DRAFT`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          // Only a draft can be edited; arriving with `?ubah=1` on anything else
          // would open a dialog whose save is guaranteed to answer 409.
          if (current.status === 'DRAFT') {
            setDraft({ tanggal: current.tanggal.slice(0, 10), alasan: current.alasan });
          }
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setDoc(null);
        // Arrived at cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page. A document whose
        // source invoice sits outside the session's unit kerja answers 404 here,
        // exactly like an id that does not exist.
        setLoadErr(messageOf(e, 'Gagal memuat dokumen retur pembelian.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  /** Every write answers with the whole document, so this is the only sync needed. */
  const applyDoc = useCallback((saved: ReturDoc) => {
    setDoc(saved);
    returBus.publish({ kind: 'saved', row: rowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching sections instead of popping this
    // screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/retur-pembelian');
  }, [router]);

  const updateLines = useCallback((updater: (prev: TurunanDraft[]) => TurunanDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  /**
   * Opening the line editor costs a `GET /pembelian/{id}`.
   *
   * What is returnable is not on this document — it is `qtyDapatDiretur` on the
   * source invoice's lines, recomputed there from every POSTED susulan and every
   * POSTED return. Reading it at the moment of editing also means it is current.
   */
  async function openLineEditor() {
    if (!doc || linesLoading) return;
    setLinesLoading(true);
    setLinesErr('');
    try {
      const sumber = await getPembelian(doc.idPembelian);
      // The lines this document already carries are kept in the list even if
      // their ceiling has since fallen to zero, so an over-limit row is visible
      // rather than silently dropped.
      const dipakai = doc.lines.map((l) => l.idPembelianDetail);
      setLines(draftsDari(barisSumber(sumber, 'retur', dipakai), doc.lines));
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal memuat faktur asal untuk menyunting baris.'));
    } finally {
      setLinesLoading(false);
    }
  }

  async function saveHeader() {
    if (!doc || !draft || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.tanggal)) {
      return setDraftErr('Tanggal dokumen harus dalam format YYYY-MM-DD.');
    }
    // Refused 400 server-side too, and for the same reason: create demands an
    // `alasan`, so a patch must not be able to produce a document create could
    // never have made.
    if (draft.alasan.trim() === '') {
      return setDraftErr('Alasan retur wajib diisi dan tidak bisa dikosongkan.');
    }
    setBusy(true);
    try {
      applyDoc(await updateRetur(doc.id, { tanggal: draft.tanggal, alasan: draft.alasan.trim() }));
      setDraft(null);
      setDraftErr('');
      toast('Header dokumen tersimpan');
    } catch (e) {
      // 409 here is the status guard: the document left DRAFT between opening
      // the dialog and saving it.
      setDraftErr(messageOf(e, 'Gagal menyimpan header.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    if (!doc || !lines || busy) return;
    const detail = turunanToInput(lines, 'retur');
    if (!detail.ok) return setLinesErr(detail.error);
    setBusy(true);
    try {
      applyDoc(await replaceReturDetail(doc.id, detail.detail));
      setLines(null);
      setLinesErr('');
      toast('Baris dokumen diganti');
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal menyimpan baris.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAksi() {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim() === '') return setAksiErr('Alasan wajib diisi.');
    setBusy(true);
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      applyDoc(saved);
      setAksi(null);
      setAlasan('');
      setAksiErr('');
      toast(`Dokumen ${saved.nomor} sekarang ${saved.status}`);
    } catch (e) {
      // The server's own message names the actual blocker — a closed period, a
      // stock balance that would go negative, a returnable quantity another
      // document consumed first.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  const editing = lines !== null;
  const bolehUbah = canWrite && doc?.status === 'DRAFT';
  const aksiList = doc ? aksiTersedia(doc.status, role) : [];
  const kredit = doc ? decimalToNumber(doc.nilaiKreditUtang) : 0;

  return (
    <AppShell title={doc ? doc.nomor : 'Detail retur'} onBack={goBack}>
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {!loading && !doc && (
        <View style={styles.centerBox}>
          <Text style={styles.errText}>{loadErr || 'Dokumen tidak ditemukan.'}</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      )}

      {!loading && doc && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {/* The document number and the way back are in the header bar; the
              status and the workflow buttons stay with the document. */}
          <View style={styles.detailHead}>
            <Badge label={DOKUMEN_META[doc.status].label} tone={DOKUMEN_META[doc.status].tone} />
            <View style={{ flex: 1 }} />
            <View style={styles.actionBar}>
              {bolehUbah && !editing && (
                <>
                  <SecondaryButton
                    label="Ubah header"
                    onPress={() =>
                      setDraft({ tanggal: doc.tanggal.slice(0, 10), alasan: doc.alasan })
                    }
                  />
                  <SecondaryButton
                    label={linesLoading ? 'Memuat…' : 'Ubah baris'}
                    onPress={openLineEditor}
                  />
                </>
              )}
              {!editing &&
                aksiList.map((a) =>
                  a.danger ? (
                    <SecondaryButton
                      key={a.key}
                      label={a.label}
                      tone="text-danger"
                      onPress={() => {
                        setAksi(a);
                        setAlasan('');
                        setAksiErr('');
                      }}
                    />
                  ) : (
                    <PrimaryButton
                      key={a.key}
                      label={a.label}
                      onPress={() => {
                        setAksi(a);
                        setAlasan('');
                        setAksiErr('');
                      }}
                    />
                  )
                )}
            </View>
          </View>

          {doc.status === 'DRAFT' && doc.alasanTolak && (
            <Card className="border-danger-line bg-danger-bg p-4">
              <Text style={styles.alasanLabel}>Pengajuan sebelumnya ditolak</Text>
              <Text style={styles.alasanText}>{doc.alasanTolak}</Text>
            </Card>
          )}
          {doc.status === 'BATAL' && doc.alasanBatal && (
            <Card className="border-danger-line bg-danger-bg p-4">
              <Text style={styles.alasanLabel}>Dokumen dibatalkan</Text>
              <Text style={styles.alasanText}>{doc.alasanBatal}</Text>
              <Text style={styles.alasanNote}>
                Barangnya sudah masuk kembali, dinilai persis sebesar yang tercatat saat ia keluar.
                Nilai kredit utang di bawah tetap tertinggal sebagai catatan berapa yang pernah
                diklaim — perhitungan utang hanya menjumlahkan retur POSTED.
              </Text>
            </Card>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Nilai barang keluar"
              value={rp(decimalToNumber(doc.total))}
              sub={`${doc.lines.length} baris · harga pokok faktur`}
            />
            <StatTile
              label="Kredit utang supplier"
              value={doc.status === 'DRAFT' || doc.status === 'DIAJUKAN' ? '—' : rp(kredit)}
              sub={
                doc.status === 'DRAFT' || doc.status === 'DIAJUKAN'
                  ? 'Dibekukan saat posting'
                  : 'Lebih kecil dari nilai barang: harga pokok memuat porsi ongkir'
              }
            />
            <StatTile
              label="Faktur asal"
              value={doc.nomorPembelian || '—'}
              sub={`Ruang ${doc.namaRuang || '—'}`}
            />
          </View>

          <Card>
            <CardHead
              title={doc.namaSupplier || '—'}
              right={<Text style={styles.cardRight}>Ruang {doc.namaRuang || '—'}</Text>}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Cell label="Tanggal dokumen" value={tanggal(doc.tanggal)} />
              <Cell label="Faktur asal" value={doc.nomorPembelian || '—'} />
              <Cell label="Alasan retur" value={doc.alasan || '—'} />
            </View>
            <View style={styles.jejakRow}>
              <Text style={styles.jejakText}>Dibuat {tanggal(doc.createdAt)}</Text>
              {doc.diajukanPada && (
                <Text style={styles.jejakText}>· diajukan {tanggal(doc.diajukanPada)}</Text>
              )}
              {doc.disetujuiPada && (
                <Text style={styles.jejakText}>· disetujui {tanggal(doc.disetujuiPada)}</Text>
              )}
              {doc.postedAt && <Text style={styles.jejakText}>· diposting {tanggal(doc.postedAt)}</Text>}
            </View>
          </Card>

          <ErrorBanner message={editing ? '' : linesErr} />

          {editing && lines ? (
            <>
              <TurunanLineEditor drafts={lines} onChange={updateLines} mode="retur" editable />
              <View style={{ alignItems: 'flex-end' }}>
                <Card className="w-[420px] max-w-full gap-2.5 p-4">
                  <Text style={styles.editNote}>
                    Menyimpan mengganti seluruh baris dokumen sekaligus — baris satu kiriman balik
                    dikemas dan dihitung bersamaan.
                  </Text>
                  <View style={styles.sumRow}>
                    <Text style={styles.sumLabel}>Nilai setelah diubah</Text>
                    <Text style={styles.sumValue}>{rp(nilaiTurunan(lines))}</Text>
                  </View>
                  <ErrorBanner message={linesErr} />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                    <SecondaryButton
                      label="Batal"
                      tone="text-dark2"
                      onPress={() => {
                        setLines(null);
                        setLinesErr('');
                      }}
                    />
                    <PrimaryButton
                      label={busy ? 'Menyimpan…' : 'Simpan baris'}
                      onPress={saveLines}
                    />
                  </View>
                </Card>
              </View>
            </>
          ) : (
            <Card>
              <CardHead
                title="Baris retur"
                right={<Text style={styles.cardRight}>{doc.lines.length} baris</Text>}
              />
              {doc.lines.map((line) => (
                <View key={line.id} style={styles.itemRow}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={styles.itemNama} numberOfLines={2}>
                      {line.nama}
                    </Text>
                    <Text style={styles.itemKode} numberOfLines={1}>
                      {line.kode} · {formatDesimal(line.qtyInput)} {line.namaSatuan}
                      {line.faktor === 1 ? '' : ` (×${line.faktor})`}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {num(line.qtyDasar)} {line.namaSatuanDasar} ×{' '}
                      {rp(decimalToNumber(line.hppDasar))} — harga pokok disalin dari faktur
                    </Text>
                  </View>
                  <Text style={styles.itemNilai}>{rp(decimalToNumber(line.nilai))}</Text>
                </View>
              ))}
              {doc.lines.length === 0 && (
                <EmptyState
                  title="Dokumen belum punya baris"
                  sub="Dokumen tanpa baris tidak bisa diajukan. Tambahkan lewat Ubah baris."
                />
              )}
              <View style={styles.totalsBox}>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Kredit utang supplier</Text>
                  <Text style={styles.sumValue}>
                    {doc.status === 'DRAFT' || doc.status === 'DIAJUKAN' ? '—' : rp(kredit)}
                  </Text>
                </View>
                <View style={styles.itemsFoot}>
                  <Text style={{ fontSize: 14, color: C.muted3 }}>Nilai barang keluar</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.2 }}>
                    {rp(decimalToNumber(doc.total))}
                  </Text>
                </View>
                <Text style={styles.totalsNote}>
                  Kartu stok mencatat angka ketiga lagi: barang keluar dinilai pada rata-rata
                  bergerak yang berlaku saat itu, karena sejak datang ia sudah tercampur stok lama.
                  Ketiganya benar untuk pertanyaan yang berbeda.
                </Text>
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      <ModalShell
        visible={draft !== null}
        width={520}
        onRequestClose={() => {
          setDraft(null);
          setDraftErr('');
        }}>
        {draft && (
          <>
            <ModalHead
              title="Ubah header"
              sub="Hanya tanggal dan alasan yang milik operator. Faktur asal, supplier, dan ruang menentukan dokumen ini retur atas apa."
            />
            <View style={{ padding: 20, gap: 14 }}>
              <Field label="Tanggal dokumen" hint="Menentukan bulan penomoran dan periodenya.">
                <TextField
                  value={draft.tanggal}
                  onChangeText={(v) => {
                    setDraft((d) => (d ? { ...d, tanggal: v } : d));
                    setDraftErr('');
                  }}
                  placeholder="YYYY-MM-DD"
                  mono
                />
              </Field>
              <Field label="Alasan retur" hint="Wajib, dan tidak bisa dikosongkan.">
                <TextField
                  value={draft.alasan}
                  onChangeText={(v) => {
                    setDraft((d) => (d ? { ...d, alasan: v } : d));
                    setDraftErr('');
                  }}
                  placeholder="Barang rusak saat diterima, segel dus sobek"
                  multiline
                />
              </Field>
              <ErrorBanner message={draftErr} />
            </View>
            <ModalFooter
              onCancel={() => {
                setDraft(null);
                setDraftErr('');
              }}
              onSave={saveHeader}
              saveLabel={busy ? 'Menyimpan…' : 'Simpan'}
            />
          </>
        )}
      </ModalShell>

      <AksiDialog
        aksi={aksi}
        alasan={alasan}
        onChangeAlasan={(v) => {
          setAlasan(v);
          setAksiErr('');
        }}
        error={aksiErr}
        busy={busy}
        onCancel={() => {
          setAksi(null);
          setAlasan('');
          setAksiErr('');
        }}
        onConfirm={confirmAksi}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.kLabel}>{label}</Text>
      <Text style={styles.kVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  actionBar: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  alasanLabel: { fontSize: 13.5, fontWeight: '700', color: C.red },
  alasanText: { fontSize: 14, color: C.dark2, lineHeight: 20, marginTop: 4 },
  alasanNote: { fontSize: 12.5, color: C.muted3, lineHeight: 17, marginTop: 8 },
  cardRight: { fontSize: 13.5, color: C.muted3 },
  cell: {
    flexGrow: 1,
    flexBasis: 180,
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: C.borderLighter,
    gap: 3,
  },
  kLabel: { fontSize: 12.5, color: C.muted2 },
  kVal: { fontSize: 15, color: C.text, lineHeight: 20 },
  jejakRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
  },
  jejakText: { fontSize: 12.5, color: C.muted2 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  itemNama: { fontSize: 15.5, fontWeight: '500', color: C.text },
  itemKode: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  itemMeta: { fontSize: 12.5, color: C.muted3 },
  itemNilai: { minWidth: 120, textAlign: 'right', fontSize: 16, fontWeight: '600', color: C.text },
  totalsBox: { padding: 14, gap: 8, backgroundColor: C.tableHeaderBg },
  totalsNote: { fontSize: 12, color: C.muted2, lineHeight: 16 },
  itemsFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingTop: 10,
  },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sumLabel: { fontSize: 13.5, color: C.muted3 },
  sumValue: { fontSize: 16, fontWeight: '700', color: C.text },
  editNote: { fontSize: 12.5, color: C.muted3, lineHeight: 18 },
});
