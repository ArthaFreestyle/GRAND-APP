/**
 * Pembelian — one purchase document.
 *
 * This is where the workflow lives. A pembelian is not an invoice that gets
 * saved; it is `DRAFT → DIAJUKAN → POSTED` (plus `BATAL`), four endpoints, and
 * **two different people**: `INVENTARIS` types it and submits it, `SUPERADMIN`
 * posts, rejects, or cancels. The buttons follow both the status and the active
 * grant's role, and a transition the grant cannot run is not rendered at all —
 * pressing "Posting" only to be told `role tidak mencukupi` teaches nobody who
 * to ask.
 *
 * Editing is only ever a `DRAFT` matter: `PATCH /pembelian/{id}` and
 * `PUT /pembelian/{id}/detail` both answer 409 once the document is submitted,
 * which is the entire point of submitting it. The header edits in a dialog (the
 * record is already on screen) and the lines edit in place, because
 * `PUT .../detail` replaces the whole set and there is no half of it to show.
 *
 * Four reads feed this screen and they fail independently:
 *   - `GET /pembelian/{id}` — the document. Without it there is no page.
 *   - `GET /pembelian/{id}/sisa` — the lines still owed, when any are.
 *   - `GET /supplier/{id}/utang` — what is still owed **in rupiah**. The
 *     document only caches BELUM / SEBAGIAN / LUNAS; the amount belongs to the
 *     payment module, and there is no `dibayar` column anywhere.
 *   - `GET /ekspedisi/{id}` — the carrier's name, which the document does not
 *     carry.
 *
 * The two documents that keep moving after posting — penerimaan susulan and
 * retur pembelian — are their own sections, and this screen is where they are
 * started from: a short line is chased from the invoice that recorded the
 * shortfall, and goods go back against the invoice they came in on. The buttons
 * carry `?idPembelian=` so the form opens with the source already chosen.
 *
 * `?ubah=1` opens the header dialog on arrival (that is how the list's "Ubah"
 * button gets here) and `?baru=1` says the create form just landed. Both are
 * read once on the way in: they seed the screen rather than driving it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EMPTY_HEADER,
  headerBody,
  headerOf,
  PembelianFormModal,
  type PembelianHeaderValues,
} from '@/components/pembelian/form';
import {
  draftOfLine,
  linesKoli,
  linesToInput,
  PembelianLineEditor,
  type LineDraft,
} from '@/components/pembelian/lines';
import { TERIMA_META } from '@/components/pembelian/status';
import { AppShell } from '@/components/shell/AppShell';
import { AksiDialog } from '@/components/shell/aksi-dialog';
import { BAYAR_META, DOKUMEN_META } from '@/components/shell/status-dokumen';
import {
  Badge,
  Card,
  CardHead,
  EmptyState,
  ErrorBanner,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  StatTile,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, rp, tanggal } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { decimalToNumber, formatDesimal } from '@/services/decimal';
import { getEkspedisi } from '@/services/ekspedisi';
import {
  aksiTersedia,
  bagiRataKoli,
  getPembelian,
  getSisaPembelian,
  jalankanAksi,
  pembelianBus,
  replacePembelianDetail,
  rowOf,
  updatePembelian,
  type AksiDokumen,
  type PembelianDoc,
  type PembelianLine,
  type SisaPembelian,
} from '@/services/pembelian';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import { listUtang, type UtangFaktur } from '@/services/supplier';

/**
 * How far into the supplier's open-bill queue to look for this document.
 *
 * The queue is oldest-first and per supplier, so one page normally holds the
 * whole of it. When it does not, the screen says the amount is unknown rather
 * than paging through a work list to answer a question about one row.
 */
const UTANG_SIZE = 100;

/** Cartons are decimal, so compare with a tolerance rather than `===`. */
const KOLI_EPSILON = 0.0001;

/**
 * Where the rupiah figure behind `status_pembayaran` stands.
 *
 * A boolean pair would collapse the two answers that matter most: "still
 * loading" and "the queue was too long to find it in" both leave `utang` null,
 * and rendering `Rp 0` for either would say the bill is settled when nothing of
 * the sort is known.
 */
type UtangState = 'nihil' | 'memuat' | 'ada' | 'takTerjangkau' | 'gagal';

export default function PembelianDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [doc, setDoc] = useState<PembelianDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [namaEkspedisi, setNamaEkspedisi] = useState('');
  const [sisa, setSisa] = useState<SisaPembelian | null>(null);
  const [sisaErr, setSisaErr] = useState('');
  const [utang, setUtang] = useState<UtangFaktur | null>(null);
  const [utangErr, setUtangErr] = useState('');
  const [utangState, setUtangState] = useState<UtangState>('nihil');

  const [draft, setDraft] = useState<PembelianHeaderValues | null>(null);
  const [draftErr, setDraftErr] = useState('');

  /** `null` means the lines are being read, not edited. */
  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [linesErr, setLinesErr] = useState('');

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pembelian');
  const canSusulan = useCanWrite('penerimaan-susulan');
  const canRetur = useCanWrite('retur-pembelian');
  const role = useActiveRole();

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
   * The three side reads, kept together so they can be re-run after a
   * transition — posting changes what every one of them answers. `alive`
   * belongs to the caller: a reader who leaves before these land must not set
   * state on the way out, and a slow answer must not repaint a screen that has
   * moved on.
   */
  const loadSideReads = useCallback((current: PembelianDoc, alive: () => boolean) => {
    setSisaErr('');
    setUtangErr('');

    if (current.idEkspedisi === null) {
      setNamaEkspedisi('');
    } else {
      const idEkspedisi = current.idEkspedisi;
      getEkspedisi(idEkspedisi)
        .then((e) => {
          if (alive()) setNamaEkspedisi(e.nama);
        })
        // A carrier that cannot be named is still a carrier that was chosen;
        // the id is the honest fallback, not an empty field.
        .catch(() => {
          if (alive()) setNamaEkspedisi(`Ekspedisi #${idEkspedisi}`);
        });
    }

    // Pre-filtered server-side to the lines that are actually short — the same
    // work list a follow-up delivery will be built from, so this screen reads it
    // rather than re-deriving it from `detail`.
    if (current.statusTerima === 'KURANG') {
      getSisaPembelian(current.id)
        .then((s) => {
          if (alive()) setSisa(s);
        })
        .catch((e) => {
          if (!alive()) return;
          setSisa(null);
          setSisaErr(messageOf(e, 'Gagal memuat sisa penerimaan.'));
        });
    } else {
      setSisa(null);
    }

    // Only a posted document owes anything, and a settled one owes nothing —
    // there is no bill to look up in either of the other cases.
    if (current.status !== 'POSTED' || current.statusBayar === 'LUNAS') {
      setUtang(null);
      setUtangState('nihil');
      return;
    }
    setUtangState('memuat');
    listUtang(current.idSupplier, { size: UTANG_SIZE })
      .then((page) => {
        if (!alive()) return;
        const found = page.data.find((f) => f.id_pembelian === current.id) ?? null;
        setUtang(found);
        setUtangState(found === null ? 'takTerjangkau' : 'ada');
      })
      .catch((e) => {
        if (!alive()) return;
        setUtang(null);
        setUtangState('gagal');
        setUtangErr(messageOf(e, 'Gagal memuat sisa utang faktur ini.'));
      });
  }, []);

  /**
   * Bumped whenever a newer set of reads starts, so an older set still in flight
   * knows to drop its answer instead of painting over the fresh one — a posting
   * followed quickly by a retry is exactly the case that looks like a bug.
   */
  const generation = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoading(false);
      setLoadErr('Alamat dokumen tidak dikenali.');
      return;
    }
    const mine = ++generation.current;
    // Two ways to go stale, and they are not the same one. `cancelled` is this
    // effect being torn down; the generation check is a reload started while
    // these were still in flight.
    let cancelled = false;
    const alive = () => !cancelled && generation.current === mine;

    setLoading(true);
    setLoadErr('');
    setSisa(null);
    setUtang(null);
    setUtangState('nihil');
    setNamaEkspedisi('');

    getPembelian(id)
      .then((current) => {
        if (!alive()) return;
        setDoc(current);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Dokumen ${current.nomor} tersimpan sebagai DRAFT`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          // Only a draft can be edited; arriving with `?ubah=1` on anything else
          // would open a dialog whose save is guaranteed to answer 409.
          if (current.status === 'DRAFT') setDraft(headerOf(current));
        }
        loadSideReads(current, alive);
      })
      .catch((e) => {
        if (!alive()) return;
        setDoc(null);
        // Arrived at cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page. A document in
        // a ruang outside the session's unit kerja answers 404 here, exactly
        // like an id that does not exist.
        setLoadErr(messageOf(e, 'Gagal memuat dokumen pembelian.'));
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, toast, loadSideReads]);

  /**
   * Every write answers with the whole document, including the four
   * transitions, so this is the only sync needed: replace the state, tell the
   * list, and re-read the three things that hang off the new status.
   */
  const applyDoc = useCallback(
    (saved: PembelianDoc) => {
      setDoc(saved);
      pembelianBus.publish({ kind: 'saved', row: rowOf(saved) });
      const mine = ++generation.current;
      loadSideReads(saved, () => generation.current === mine);
    },
    [loadSideReads]
  );

  const retrySideReads = useCallback(() => {
    if (!doc) return;
    const mine = ++generation.current;
    loadSideReads(doc, () => generation.current === mine);
  }, [doc, loadSideReads]);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pembelian');
  }, [router]);

  /**
   * The editor takes an updater rather than a value — choosing a product writes
   * to its line twice — while this screen holds `LineDraft[] | null`, where
   * `null` means "not editing". Bridging the two here keeps the null out of the
   * editor's contract.
   */
  const updateLines = useCallback((updater: (prev: LineDraft[]) => LineDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  const patchDraft = useCallback((patch: Partial<PembelianHeaderValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  async function saveHeader() {
    if (!doc || !draft || busy) return;
    const body = headerBody(draft);
    if (!body.ok) return setDraftErr(body.error);
    setBusy(true);
    try {
      applyDoc(await updatePembelian(doc.id, body.body));
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
    const detail = linesToInput(lines);
    if (!detail.ok) return setLinesErr(detail.error);
    setBusy(true);
    try {
      applyDoc(await replacePembelianDetail(doc.id, detail.detail));
      setLines(null);
      setLinesErr('');
      toast('Baris faktur diganti');
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal menyimpan baris.'));
    } finally {
      setBusy(false);
    }
  }

  async function ratakanKoli() {
    if (!doc || busy) return;
    setBusy(true);
    try {
      applyDoc(await bagiRataKoli(doc.id));
      toast('Koli dibagi rata sebanding qty dasar');
    } catch (e) {
      toast(messageOf(e, 'Gagal membagi koli.'));
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
      // carton total that does not add up, a balance that would go negative —
      // and no invented wording beats it.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  // ---- derived ----

  const editing = lines !== null;
  const isDraft = doc?.status === 'DRAFT';
  const bolehUbah = canWrite && isDraft;
  const aksiList = doc ? aksiTersedia(doc.status, role) : [];

  const totalKoli = doc ? decimalToNumber(doc.totalKoli) : 0;
  const koliBaris = doc ? doc.lines.reduce((s, l) => s + decimalToNumber(l.jumlahKoli), 0) : 0;
  // Posting refuses a document whose line cartons do not add up to the header's,
  // so this is worth saying while it can still be fixed rather than at posting.
  const koliTimpang =
    !!doc &&
    doc.status !== 'POSTED' &&
    doc.status !== 'BATAL' &&
    totalKoli > 0 &&
    Math.abs(koliBaris - totalKoli) > KOLI_EPSILON;

  const sisaUtang = utang ? decimalToNumber(utang.sisa_utang) : 0;

  /**
   * The two documents that can still be written against this one, and only while
   * they are genuinely possible.
   *
   * Both need the invoice POSTED: before that a line has no harga pokok to copy,
   * no settled remainder, and nothing that has arrived. Beyond that the two ask
   * different questions of the same lines — a susulan needs something still owed
   * (`status_penerimaan`, the server's own cache), a retur needs something that
   * actually arrived and has not gone back yet. A line can answer yes to both.
   */
  const bisaSusulan = canSusulan && doc?.status === 'POSTED' && doc.statusTerima === 'KURANG';
  const bisaRetur =
    canRetur && doc?.status === 'POSTED' && doc.lines.some((l) => l.qtyDapatDiretur > 0);

  return (
    <AppShell title={doc ? doc.nomor : 'Detail faktur'} onBack={goBack}>
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
                  <SecondaryButton label="Ubah header" onPress={() => setDraft(headerOf(doc, namaEkspedisi))} />
                  <SecondaryButton
                    label="Ubah baris"
                    onPress={() => {
                      setLines(doc.lines.map(draftOfLine));
                      setLinesErr('');
                    }}
                  />
                </>
              )}
              {/* The workflow buttons. `aksiTersedia` filters by status *and* by
                  the active grant's role, so an INVENTARIS grant sees "Ajukan"
                  and never sees "Posting". */}
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
                Baris pembaliknya bertanggal hari pembatalan, bukan tanggal dokumen — laporan per
                periode harus dibaca dari kartu stok, bukan dari status ini.
              </Text>
            </Card>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Total faktur"
              value={rp(decimalToNumber(doc.total))}
              sub={`${doc.lines.length} baris · ${doc.jenis === 'KREDIT' ? 'kredit' : 'tunai'}`}
            />
            <StatTile
              label="Biaya angkut"
              value={rp(decimalToNumber(doc.biayaAngkut))}
              sub={
                doc.ditanggungSupplier
                  ? 'Ditanggung supplier'
                  : 'Tagihan ekspedisi — di luar total faktur'
              }
            />
            <StatTile
              label="Sisa utang"
              value={
                doc.status !== 'POSTED'
                  ? '—'
                  : doc.statusBayar === 'LUNAS'
                    ? rp(0)
                    : utangState === 'memuat'
                      ? '…'
                      : utangState === 'ada'
                        ? rp(sisaUtang)
                        : '—'
              }
              valueClass={sisaUtang > 0 ? 'text-danger' : 'text-foreground'}
              sub={
                doc.status !== 'POSTED'
                  ? 'Belum diposting — belum jadi utang'
                  : utangState === 'gagal'
                    ? utangErr || 'Gagal dimuat'
                    : utangState === 'takTerjangkau'
                      ? `${BAYAR_META[doc.statusBayar].label} · nilainya di luar halaman antrean`
                      : BAYAR_META[doc.statusBayar].label
              }
              subClass={utangState === 'gagal' ? 'text-danger' : 'text-faint'}
            />
            <StatTile
              label="Penerimaan"
              value={TERIMA_META[doc.statusTerima].label}
              sub={
                doc.statusTerima === 'LENGKAP'
                  ? 'Semua yang difakturkan datang'
                  : `${doc.lines.filter((l) => l.sisaDasar > 0).length} baris masih ditunggu`
              }
            />
          </View>

          <Card>
            <CardHead
              title={doc.namaSupplier || '—'}
              right={<Text style={styles.cardRight}>Ruang {doc.namaRuang || '—'}</Text>}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Cell label="Tanggal dokumen" value={tanggal(doc.tanggal)} />
              <Cell label="No. faktur supplier" value={doc.noFakturSupplier || '—'} />
              <Cell label="Tanggal faktur" value={doc.tanggalFaktur ? tanggal(doc.tanggalFaktur) : '—'} />
              <Cell label="Ekspedisi" value={doc.idEkspedisi === null ? '—' : namaEkspedisi || '…'} />
              <Cell label="No. resi" value={doc.noResi || '—'} />
              <Cell
                label="Koli"
                value={
                  totalKoli > 0
                    ? `${formatDesimal(doc.totalKoli)} × ${rp(decimalToNumber(doc.tarifPerKoli))}`
                    : '—'
                }
              />
              <Cell label="Metode alokasi" value={doc.metodeAlokasi === 'KOLI' ? 'Per koli' : 'Per qty dasar'} />
              <Cell
                label="PPN"
                value={`${rp(decimalToNumber(doc.ppn))}${doc.ppnDikreditkan ? ' · dikreditkan' : ''}`}
              />
            </View>
            <View style={styles.jejakRow}>
              <Text style={styles.jejakText}>Dibuat {tanggal(doc.createdAt)}</Text>
              {doc.diajukanPada && <Text style={styles.jejakText}>· diajukan {tanggal(doc.diajukanPada)}</Text>}
              {doc.disetujuiPada && <Text style={styles.jejakText}>· disetujui {tanggal(doc.disetujuiPada)}</Text>}
              {doc.postedAt && <Text style={styles.jejakText}>· diposting {tanggal(doc.postedAt)}</Text>}
            </View>
          </Card>

          {koliTimpang && (
            <Card className="border-amber-line bg-amber-bg p-4">
              <Text style={styles.alasanLabel}>Koli baris belum cocok dengan header</Text>
              <Text style={styles.alasanText}>
                Header menyebut {formatDesimal(doc.totalKoli)} koli, seluruh baris berjumlah{' '}
                {formatDesimal(String(koliBaris))}. Posting akan ditolak selama keduanya berbeda.
              </Text>
              {bolehUbah && (
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <SecondaryButton label="Bagi rata koli" onPress={ratakanKoli} />
                </View>
              )}
            </Card>
          )}

          {editing && lines ? (
            <>
              <PembelianLineEditor
                lines={lines}
                onChange={updateLines}
                idSupplier={doc.idSupplier}
                pakaiKoli={!doc.ditanggungSupplier && totalKoli > 0}
                editable
              />
              <View style={{ alignItems: 'flex-end', gap: 10 }}>
                <Card className="w-[420px] max-w-full gap-2.5 p-4">
                  <Text style={styles.editNote}>
                    Menyimpan mengganti seluruh baris dokumen sekaligus — itu satu-satunya bentuk
                    yang ditawarkan kontrak, karena baris satu dokumen adalah satu kesatuan yang
                    diketik dari satu lembar kertas.
                  </Text>
                  {totalKoli > 0 && (
                    <Text style={styles.editNote}>
                      Koli baris saat ini {formatDesimal(String(linesKoli(lines)))} dari{' '}
                      {formatDesimal(doc.totalKoli)}.
                    </Text>
                  )}
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
                title="Baris faktur"
                right={<Text style={styles.cardRight}>{doc.lines.length} baris</Text>}
              />
              <Wide minWidth={820}>
                <View style={styles.itemsHeadRow}>
                  <Text style={[styles.thText, { flex: 1 }]}>PRODUK</Text>
                  <Text style={[styles.thText, { width: 120, textAlign: 'right' }]}>QTY</Text>
                  <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>HARGA</Text>
                  <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>SUBTOTAL</Text>
                  <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>HPP / DASAR</Text>
                </View>
                {doc.lines.map((line) => (
                  <LineRow key={line.id} line={line} />
                ))}
              </Wide>
              {doc.lines.length === 0 && (
                <EmptyState
                  title="Dokumen belum punya baris"
                  sub="Dokumen tanpa baris tidak bisa diajukan. Tambahkan lewat Ubah baris."
                />
              )}
              <View style={styles.totalsBox}>
                <SumRow label="Subtotal" value={rp(decimalToNumber(doc.subtotal))} />
                <SumRow label="Diskon nota" value={`− ${rp(decimalToNumber(doc.diskonNota))}`} />
                <SumRow label="PPN" value={rp(decimalToNumber(doc.ppn))} />
                <SumRow label="Pembulatan" value={rp(decimalToNumber(doc.pembulatan))} />
                <View style={styles.itemsFoot}>
                  <Text style={{ fontSize: 14, color: C.muted3 }}>Total faktur</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.2 }}>
                    {rp(decimalToNumber(doc.total))}
                  </Text>
                </View>
                <SumRow
                  label="Biaya angkut (di luar total)"
                  value={rp(decimalToNumber(doc.biayaAngkut))}
                />
              </View>
            </Card>
          )}

          {/* Started from here rather than from an empty picker in either
              section: the invoice is what somebody is holding when the second
              delivery turns up or the goods have to go back, and the form
              cannot be filled in without choosing it anyway. Each button is
              rendered only while the document it starts is actually possible. */}
          {(bisaSusulan || bisaRetur) && !editing && (
            <Card className="p-4">
              <Text style={styles.lanjutanLabel}>Dokumen lanjutan</Text>
              <Text style={styles.lanjutanText}>
                Faktur ini sudah diposting, jadi barisnya sudah punya harga pokok — keduanya
                menyalin angka itu, bukan rata-rata bergerak hari ini.
              </Text>
              <View style={styles.lanjutanBar}>
                {bisaSusulan && (
                  <SecondaryButton
                    label="Buat kiriman susulan"
                    onPress={() =>
                      router.push({
                        pathname: '/penerimaan-susulan/baru',
                        params: { idPembelian: doc.id },
                      })
                    }
                  />
                )}
                {bisaRetur && (
                  <SecondaryButton
                    label="Buat retur pembelian"
                    onPress={() =>
                      router.push({
                        pathname: '/retur-pembelian/baru',
                        params: { idPembelian: doc.id },
                      })
                    }
                  />
                )}
              </View>
            </Card>
          )}

          {(sisa || sisaErr !== '') && (
            <Card>
              <CardHead
                title="Belum datang"
                right={
                  <Text style={styles.cardRight}>
                    {sisa ? `${sisa.baris?.length ?? 0} baris` : '—'}
                  </Text>
                }
              />
              {sisaErr !== '' ? (
                <View style={styles.centerBox}>
                  <Text style={styles.errText}>{sisaErr}</Text>
                  <GhostButton label="Coba lagi" onPress={retrySideReads} />
                </View>
              ) : (sisa?.baris?.length ?? 0) === 0 ? (
                <EmptyState
                  title="Tidak ada sisa"
                  sub="Semua yang difakturkan sudah tercatat diterima."
                />
              ) : (
                <>
                  <Wide minWidth={700}>
                    {sisa?.baris?.map((b) => (
                      <View key={b.id_pembelian_detail} style={styles.sisaRow}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={styles.itemNama} numberOfLines={1}>
                            {b.nama_product}
                          </Text>
                          <Text style={styles.itemKode} numberOfLines={1}>
                            {b.kode_barang}
                            {b.keterangan_selisih ? ` · ${b.keterangan_selisih}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.sisaAngka}>
                          {num(b.qty_diterima_dasar ?? 0)} + {num(b.qty_susulan_dasar ?? 0)} dari{' '}
                          {num(b.qty_dasar ?? 0)} {b.nama_satuan_dasar}
                        </Text>
                        <Text style={styles.sisaKurang}>
                          kurang {num(b.sisa_dasar ?? 0)} {b.nama_satuan_dasar}
                        </Text>
                      </View>
                    ))}
                  </Wide>
                  <View style={styles.sisaNoteBox}>
                    <Text style={styles.sisaNote}>
                      Kekurangan kiriman dikejar dengan penerimaan susulan — dokumen tersendiri
                      yang menambah stok tanpa menambah utang, karena fakturnya sudah terbit
                      penuh di kiriman pertama. Bukan dengan retur: yang tidak pernah datang
                      tidak bisa dikirim balik.
                    </Text>
                  </View>
                </>
              )}
            </Card>
          )}
        </ScrollView>
      )}

      <PembelianFormModal
        visible={draft !== null}
        values={draft ?? EMPTY_HEADER}
        onChange={patchDraft}
        error={draftErr}
        onCancel={() => {
          setDraft(null);
          setDraftErr('');
        }}
        onSave={saveHeader}
      />

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

/**
 * One stored line.
 *
 * The four quantities are two pairs on different axes, so they are written as
 * two sentences under the product rather than four columns: what arrived
 * against what was invoiced, and — separately — what could still go back to the
 * supplier. A line can be short *and* returnable at the same time.
 */
function LineRow({ line }: { line: PembelianLine }) {
  const kurang = line.sisaDasar > 0;
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.itemNama} numberOfLines={1}>
          {line.nama}
        </Text>
        <Text style={styles.itemKode} numberOfLines={1}>
          {line.kode} · {formatDesimal(line.qtyFaktur)} {line.namaSatuan}
          {line.faktor === 1 ? '' : ` (×${line.faktor})`}
        </Text>
        <Text style={[styles.itemMeta, kurang && { color: C.amber }]} numberOfLines={2}>
          Diterima {num(line.qtyDiterimaDasar)} dari {num(line.qtyDasar)} {line.namaSatuanDasar}
          {line.qtySusulanDasar > 0 ? ` · susulan ${num(line.qtySusulanDasar)}` : ''}
          {kurang ? ` · kurang ${num(line.sisaDasar)}` : ''}
          {line.qtyReturDasar > 0 ? ` · diretur ${num(line.qtyReturDasar)}` : ''}
        </Text>
        {line.keteranganSelisih ? (
          <Text style={styles.itemMeta} numberOfLines={2}>
            {line.keteranganSelisih}
          </Text>
        ) : null}
      </View>
      <Text style={styles.itemQty}>
        {formatDesimal(line.qtyFaktur)} {line.namaSatuan}
      </Text>
      <Text style={styles.itemHarga}>
        {rp(decimalToNumber(line.hargaSatuanInput))}
        {decimalToNumber(line.diskonBaris) > 0
          ? `\n− ${rp(decimalToNumber(line.diskonBaris))}`
          : ''}
      </Text>
      <Text style={styles.itemSubtotal}>{rp(decimalToNumber(line.subtotal))}</Text>
      <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
        {/* Null until posting: not yet known, rather than missing. It is also
            not `harga_satuan_input / faktor` — the invoice discount, the PPN
            share, and the freight allocation are all inside it. */}
        <Text style={styles.itemHpp}>
          {line.hppDasar === null ? '—' : rp(decimalToNumber(line.hppDasar))}
        </Text>
        {decimalToNumber(line.alokasiBiaya) > 0 && (
          <Text style={styles.itemMeta}>angkut {rp(decimalToNumber(line.alokasiBiaya))}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * A row group wide enough to need scrolling on a phone.
 *
 * Not `DataTable`: that one is built to fill a flex parent and scrolls
 * vertically inside itself, which collapses to nothing inside the page's own
 * ScrollView. Here the page scrolls down and this scrolls across, which is the
 * arrangement a detail wants — the whole document should be reachable by one
 * downward scroll.
 */
function Wide({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <ScrollView horizontal persistentScrollbar showsHorizontalScrollIndicator>
      <View style={{ minWidth }}>{children}</View>
    </ScrollView>
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

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontFamily: 'monospace',
    color: C.text,
  },
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
  itemsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 40,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
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
  itemQty: { width: 120, textAlign: 'right', fontSize: 15, color: C.text },
  itemHarga: { width: 130, textAlign: 'right', fontSize: 14.5, color: C.dark2 },
  itemSubtotal: { width: 130, textAlign: 'right', fontSize: 16, fontWeight: '600', color: C.text },
  itemHpp: { fontSize: 14.5, color: C.dark2 },
  totalsBox: { padding: 14, gap: 8, backgroundColor: C.tableHeaderBg },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sumLabel: { fontSize: 13.5, color: C.muted3 },
  sumValue: { fontSize: 14.5, color: C.dark2 },
  itemsFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingTop: 10,
  },
  sisaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 58,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  sisaAngka: { width: 220, textAlign: 'right', fontSize: 14, color: C.dark2 },
  sisaKurang: { width: 150, textAlign: 'right', fontSize: 14.5, fontWeight: '600', color: C.amber },
  lanjutanLabel: { fontSize: 13.5, fontWeight: '700', color: C.text },
  lanjutanText: { fontSize: 12.5, color: C.muted3, lineHeight: 18, marginTop: 4 },
  lanjutanBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sisaNoteBox: { padding: 14, backgroundColor: C.tableHeaderBg },
  sisaNote: { fontSize: 12.5, color: C.muted3, lineHeight: 18 },
  editNote: { fontSize: 12.5, color: C.muted3, lineHeight: 18 },
});
