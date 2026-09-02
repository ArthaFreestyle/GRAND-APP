/**
 * Penjualan — one sales note.
 *
 * This is where the flow lives, and it is a **shorter** flow than pembelian's:
 * `DRAFT → POSTED`, plus `BATAL`. There is no `ajukan` and no `tolak` — the
 * endpoints do not exist — because a cashier cannot make a buyer standing at the
 * counter wait for a supervisor to approve a cash note typed in seconds.
 *
 * The two-person control did not disappear, it moved. `CASHIER` types the note,
 * its lines, and posts it; `SUPERADMIN` is the only one who may cancel a posted
 * one. So the person who wrote the note cannot quietly unwrite it. The buttons
 * follow both the status and the active grant, and a transition the grant cannot
 * run is not rendered at all.
 *
 * Editing is only ever a `DRAFT` matter: `PATCH /penjualan/{id}` and
 * `PUT /penjualan/{id}/detail` both answer 409 once the note is posted. The
 * header edits in a dialog (the record is already on screen) and the lines edit
 * in place, because `PUT .../detail` replaces the whole set and there is no half
 * of it to show.
 *
 * Three reads feed this screen and they fail independently:
 *   - `GET /penjualan/{id}` — the note **and its lines**. Without it there is no
 *     page. There is no separate `GET .../detail`: that path only takes the PUT.
 *   - `GET /pelanggan/{id}/piutang` — what is still owed **in rupiah**. The note
 *     only caches BELUM / SEBAGIAN / LUNAS; the amount belongs to
 *     `/penerimaan-pembayaran`, and there is no `dibayar` column anywhere.
 *   - `GET /pelanggan/{id}` — the credit limit, which the note does not carry.
 *
 * The last two are also what makes a **credit check before posting** possible,
 * and that is worth the requests. Posting is the one and only place
 * `plafon_kredit` is enforced, there is no superadmin override, and a refusal at
 * posting happens with a customer standing at the counter. Reading the running
 * receivable while the note is still a draft turns that into something anybody
 * can see coming.
 *
 * `?ubah=1` opens the header dialog on arrival (that is how the list's edit gets
 * here) and `?baru=1` says the create form just landed. Both are read once on
 * the way in: they seed the screen rather than driving it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EMPTY_HEADER,
  headerBody,
  headerOf,
  PenjualanFormModal,
  type PenjualanHeaderValues,
} from '@/components/penjualan/form';
import {
  draftOfLine,
  linesToInput,
  PenjualanLineEditor,
  type LineDraft,
} from '@/components/penjualan/lines';
import { AksiDialog } from '@/components/shell/aksi-dialog';
import { AppShell } from '@/components/shell/AppShell';
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
import { getPelanggan, listPiutang, type PiutangNota } from '@/services/pelanggan';
import {
  aksiTersedia,
  getPenjualan,
  jalankanAksi,
  penjualanBus,
  replacePenjualanDetail,
  rowOf,
  updatePenjualan,
  type AksiDokumen,
  type PenjualanDoc,
  type PenjualanLine,
} from '@/services/penjualan';
import { useActiveRole, useCanWrite } from '@/services/permissions';

/**
 * How far into the customer's open-note queue to look.
 *
 * The queue is oldest-first and per customer, so one page normally holds the
 * whole of it. When it does not, the screen says the amount is unknown rather
 * than paging through a collection list to answer a question about one note.
 */
const PIUTANG_SIZE = 100;

/**
 * Where the customer's receivable stands.
 *
 * A boolean pair would collapse the two answers that matter most: "still
 * loading" and "the queue was longer than one page" both leave the figures
 * empty, and rendering `Rp 0` for either would say nothing is owed when nothing
 * of the sort is known.
 */
type PiutangState = 'nihil' | 'memuat' | 'ada' | 'takTerjangkau' | 'gagal';

interface PiutangInfo {
  /** Every open note of this customer that fitted on one page. */
  notas: PiutangNota[];
  /** Their `sisa_piutang` summed — the running receivable posting measures. */
  berjalan: number;
  /** This note's own row, when it is one of them. */
  sendiri: PiutangNota | null;
  /** `null` means no limit at all; `0` blocks every credit sale. Opposites. */
  plafon: number | null;
}

export default function PenjualanDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [doc, setDoc] = useState<PenjualanDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [piutang, setPiutang] = useState<PiutangInfo | null>(null);
  const [piutangErr, setPiutangErr] = useState('');
  const [piutangState, setPiutangState] = useState<PiutangState>('nihil');

  const [draft, setDraft] = useState<PenjualanHeaderValues | null>(null);
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

  const canWrite = useCanWrite('penjualan');
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
   * The customer's side of the note, kept together so it can be re-run after a
   * transition — posting a credit note is exactly what changes the answer.
   *
   * Nothing is read for a note with no customer: a cash sale at the counter owes
   * nobody anything and has no limit to check. `alive` belongs to the caller — a
   * reader who leaves before these land must not set state on the way out, and a
   * slow answer must not repaint a screen that has moved on.
   */
  const loadPiutang = useCallback((current: PenjualanDoc, alive: () => boolean) => {
    setPiutangErr('');
    const idPelanggan = current.idPelanggan;
    if (idPelanggan === null) {
      setPiutang(null);
      setPiutangState('nihil');
      return;
    }
    setPiutangState('memuat');
    // The two reads answer different questions and neither substitutes for the
    // other: the queue is what is owed, the master record is what is allowed.
    Promise.all([listPiutang(idPelanggan, { size: PIUTANG_SIZE }), getPelanggan(idPelanggan)])
      .then(([page, pelanggan]) => {
        if (!alive()) return;
        const notas = page.data;
        const berjalan = notas.reduce((s, n) => s + decimalToNumber(n.sisa_piutang), 0);
        const sendiri = notas.find((n) => n.id_penjualan === current.id) ?? null;
        setPiutang({
          notas,
          berjalan,
          sendiri,
          plafon: pelanggan.plafon === null ? null : decimalToNumber(pelanggan.plafon),
        });
        // Summing a page and calling it the balance would be a lie the moment
        // the queue is longer than the page, so that case is named rather than
        // rounded off.
        setPiutangState(notas.length < (page.paging.total_item ?? notas.length) ? 'takTerjangkau' : 'ada');
      })
      .catch((e) => {
        if (!alive()) return;
        setPiutang(null);
        setPiutangState('gagal');
        setPiutangErr(messageOf(e, 'Gagal memuat piutang pelanggan.'));
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
      setLoadErr('Alamat nota tidak dikenali.');
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
    setPiutang(null);
    setPiutangState('nihil');

    getPenjualan(id)
      .then((current) => {
        if (!alive()) return;
        setDoc(current);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Nota ${current.nomor} tersimpan sebagai DRAFT`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          // Only a draft can be edited; arriving with `?ubah=1` on anything else
          // would open a dialog whose save is guaranteed to answer 409.
          if (current.status === 'DRAFT') setDraft(headerOf(current));
        }
        loadPiutang(current, alive);
      })
      .catch((e) => {
        if (!alive()) return;
        setDoc(null);
        // Arrived at cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page. A nota in a
        // ruang outside the session's unit kerja answers 404 here, exactly like
        // an id that does not exist.
        setLoadErr(messageOf(e, 'Gagal memuat nota penjualan.'));
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, toast, loadPiutang]);

  /**
   * Every write answers with the whole document, both transitions included, so
   * this is the only sync needed: replace the state, tell the list, and re-read
   * what hangs off the new status.
   */
  const applyDoc = useCallback(
    (saved: PenjualanDoc) => {
      setDoc(saved);
      penjualanBus.publish({ kind: 'saved', row: rowOf(saved) });
      const mine = ++generation.current;
      loadPiutang(saved, () => generation.current === mine);
    },
    [loadPiutang]
  );

  const retryPiutang = useCallback(() => {
    if (!doc) return;
    const mine = ++generation.current;
    loadPiutang(doc, () => generation.current === mine);
  }, [doc, loadPiutang]);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penjualan');
  }, [router]);

  /**
   * The editor takes an updater rather than a value — choosing a product writes
   * to its line three times — while this screen holds `LineDraft[] | null`,
   * where `null` means "not editing". Bridging the two here keeps the null out
   * of the editor's contract.
   */
  const updateLines = useCallback((updater: (prev: LineDraft[]) => LineDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  const patchDraft = useCallback((patch: Partial<PenjualanHeaderValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  async function saveHeader() {
    if (!doc || !draft || busy) return;
    const body = headerBody(draft);
    if (!body.ok) return setDraftErr(body.error);
    setBusy(true);
    try {
      applyDoc(await updatePenjualan(doc.id, body.body));
      setDraft(null);
      setDraftErr('');
      toast('Header nota tersimpan');
    } catch (e) {
      // 409 here is the status guard: the note left DRAFT between opening the
      // dialog and saving it.
      setDraftErr(messageOf(e, 'Gagal menyimpan header.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    if (!doc || !lines || busy) return;
    // `PUT .../detail` requires at least one line even though `POST` allows
    // none, so an emptied set is refused here rather than at the server.
    const detail = linesToInput(lines, doc.tanggal.slice(0, 10));
    if (!detail.ok) return setLinesErr(detail.error);
    setBusy(true);
    try {
      applyDoc(await replacePenjualanDetail(doc.id, detail.detail));
      setLines(null);
      setLinesErr('');
      toast('Baris nota diganti');
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
      toast(`Nota ${saved.nomor} sekarang ${saved.status}`);
    } catch (e) {
      // The server's own message names the actual blocker — a closed period, a
      // room balance that would go negative, a credit limit that would be
      // exceeded — and no invented wording beats it.
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

  const total = doc ? decimalToNumber(doc.total) : 0;
  const totalHpp = doc?.totalHpp === null || doc === null ? null : decimalToNumber(doc.totalHpp);
  const margin = totalHpp === null ? null : total - totalHpp;

  /**
   * What posting will measure this note against, and only while it is still a
   * question.
   *
   * `plafon_kredit` is enforced at posting and nowhere else, with no override for
   * anybody — so a draft credit note that would breach it is refused at the
   * counter unless somebody has already looked. `berjalan` excludes this note,
   * because a draft is not a receivable yet; posting is what makes it one.
   */
  const cekPlafon =
    doc !== null &&
    doc.status === 'DRAFT' &&
    doc.jenis === 'KREDIT' &&
    piutang !== null &&
    piutang.plafon !== null;
  const sesudahPosting = piutang ? piutang.berjalan + total : 0;
  const lewatPlafon = cekPlafon && piutang !== null && sesudahPosting > (piutang.plafon as number);

  const sisaNota = piutang?.sendiri ? decimalToNumber(piutang.sendiri.sisa_piutang) : 0;

  return (
    <AppShell title={doc ? doc.nomor : 'Detail nota'} onBack={goBack}>
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {!loading && !doc && (
        <View style={styles.centerBox}>
          <Text style={styles.errText}>{loadErr || 'Nota tidak ditemukan.'}</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      )}

      {!loading && doc && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {/* The note number and the way back are in the header bar; the status
              and the flow buttons stay with the document. */}
          <View style={styles.detailHead}>
            <Badge label={DOKUMEN_META[doc.status].label} tone={DOKUMEN_META[doc.status].tone} />
            {doc.status === 'POSTED' && doc.jenis === 'KREDIT' && (
              <Badge
                label={BAYAR_META[doc.statusBayar].label}
                tone={BAYAR_META[doc.statusBayar].tone}
              />
            )}
            <View style={{ flex: 1 }} />
            <View style={styles.actionBar}>
              {bolehUbah && !editing && (
                <>
                  <SecondaryButton label="Ubah header" onPress={() => setDraft(headerOf(doc))} />
                  <SecondaryButton
                    label="Ubah baris"
                    onPress={() => {
                      setLines(doc.lines.map((l) => draftOfLine(l, doc.tanggal.slice(0, 10))));
                      setLinesErr('');
                    }}
                  />
                </>
              )}
              {/* `aksiTersedia` filters by status *and* by the active grant's
                  role, so a CASHIER grant sees "Posting" and never sees
                  "Batalkan" — that one is the supervisor's, and it is the only
                  brake once a nota is posted. */}
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

          {doc.status === 'BATAL' && doc.alasanBatal && (
            <Card className="border-danger-line bg-danger-bg p-4">
              <Text style={styles.alasanLabel}>Nota dibatalkan</Text>
              <Text style={styles.alasanText}>{doc.alasanBatal}</Text>
              <Text style={styles.alasanNote}>
                Baris pembaliknya bertanggal hari pembatalan, bukan tanggal nota, dan dinilai
                dengan rata-rata bergerak yang berlaku saat itu. Harga pokok di bawah tidak
                dikosongkan — itu catatan apa yang benar-benar terjadi.
              </Text>
            </Card>
          )}

          {/* Only while it can still be acted on: once the nota is posted the
              limit has already had its say, and repeating it is noise. */}
          {cekPlafon && piutang !== null && (
            <Card
              className={
                lewatPlafon ? 'border-danger-line bg-danger-bg p-4' : 'border-amber-line bg-amber-bg p-4'
              }>
              <Text style={lewatPlafon ? styles.alasanLabel : styles.amberLabel}>
                {lewatPlafon ? 'Plafon kredit akan terlampaui' : 'Plafon kredit pelanggan'}
              </Text>
              <Text style={styles.alasanText}>
                Piutang berjalan {rp(piutang.berjalan)} + nota ini {rp(total)} ={' '}
                {rp(sesudahPosting)}, dari plafon {rp(piutang.plafon as number)}.
                {lewatPlafon
                  ? ' Posting akan ditolak — itu satu-satunya tempat plafon diperiksa, dan tidak ada jalur tembus untuk siapa pun.'
                  : ''}
              </Text>
              {piutangState === 'takTerjangkau' && (
                <Text style={styles.alasanNote}>
                  Antrean piutang pelanggan ini lebih panjang dari satu halaman, jadi angka di atas
                  belum tentu seluruhnya.
                </Text>
              )}
            </Card>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Total nota"
              value={rp(total)}
              sub={`${doc.lines.length} baris · ${doc.jenis === 'KREDIT' ? 'kredit' : 'tunai'}`}
            />
            <StatTile
              label="Harga pokok"
              value={totalHpp === null ? '—' : rp(totalHpp)}
              sub={
                totalHpp === null
                  ? 'Baru terisi saat diposting, dari kartu stok'
                  : `Margin ${rp(margin ?? 0)}`
              }
            />
            <StatTile
              label="Sisa piutang nota"
              value={
                doc.status !== 'POSTED'
                  ? '—'
                  : doc.jenis === 'TUNAI'
                    ? rp(0)
                    : piutangState === 'memuat'
                      ? '…'
                      : piutang?.sendiri
                        ? rp(sisaNota)
                        : piutangState === 'ada'
                          ? rp(0)
                          : '—'
              }
              valueClass={sisaNota > 0 ? 'text-danger' : 'text-foreground'}
              sub={
                doc.status !== 'POSTED'
                  ? 'Belum diposting — belum jadi piutang'
                  : doc.jenis === 'TUNAI'
                    ? 'Tunai — uangnya diterima di meja'
                    : piutangState === 'gagal'
                      ? piutangErr || 'Gagal dimuat'
                      : piutangState === 'takTerjangkau' && !piutang?.sendiri
                        ? `${BAYAR_META[doc.statusBayar].label} · nilainya di luar halaman antrean`
                        : BAYAR_META[doc.statusBayar].label
              }
              subClass={piutangState === 'gagal' ? 'text-danger' : 'text-faint'}
            />
          </View>

          {piutangState === 'gagal' && (
            <Card className="p-4">
              <Text style={styles.alasanText}>{piutangErr}</Text>
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                <GhostButton label="Coba lagi" onPress={retryPiutang} />
              </View>
            </Card>
          )}

          <Card>
            <CardHead
              title={doc.namaPelanggan || 'Tunai di meja — tanpa pelanggan terdaftar'}
              right={<Text style={styles.cardRight}>Ruang {doc.namaRuang || '—'}</Text>}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Cell label="Tanggal nota" value={tanggal(doc.tanggal)} />
              <Cell label="Jenis pembayaran" value={doc.jenis === 'KREDIT' ? 'Kredit' : 'Tunai'} />
              <Cell
                label="Plafon pelanggan"
                value={
                  doc.idPelanggan === null
                    ? '—'
                    : piutang === null
                      ? '…'
                      : piutang.plafon === null
                        ? 'Tanpa batas'
                        : rp(piutang.plafon)
                }
              />
              <Cell
                label="Piutang berjalan"
                value={
                  doc.idPelanggan === null ? '—' : piutang === null ? '…' : rp(piutang.berjalan)
                }
              />
            </View>
            <View style={styles.jejakRow}>
              <Text style={styles.jejakText}>Dibuat {tanggal(doc.createdAt)}</Text>
              {doc.postedAt && (
                <Text style={styles.jejakText}>· diposting {tanggal(doc.postedAt)}</Text>
              )}
            </View>
          </Card>

          {editing && lines ? (
            <>
              <PenjualanLineEditor
                lines={lines}
                onChange={updateLines}
                tanggal={doc.tanggal.slice(0, 10)}
                idRuang={doc.idRuang}
                editable
              />
              <View style={{ alignItems: 'flex-end', gap: 10 }}>
                <Card className="w-[420px] max-w-full gap-2.5 p-4">
                  <Text style={styles.editNote}>
                    Menyimpan mengganti seluruh baris nota sekaligus — itu satu-satunya bentuk yang
                    ditawarkan kontrak, dan di sini minimal satu baris wajib ada.
                  </Text>
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
                title="Baris nota"
                right={<Text style={styles.cardRight}>{doc.lines.length} baris</Text>}
              />
              <Wide minWidth={780}>
                <View style={styles.itemsHeadRow}>
                  <Text style={[styles.thText, { flex: 1 }]}>PRODUK</Text>
                  <Text style={[styles.thText, { width: 120, textAlign: 'right' }]}>QTY</Text>
                  <Text style={[styles.thText, { width: 140, textAlign: 'right' }]}>HARGA</Text>
                  <Text style={[styles.thText, { width: 140, textAlign: 'right' }]}>SUBTOTAL</Text>
                  <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>HPP / DASAR</Text>
                </View>
                {doc.lines.map((line) => (
                  <LineRow key={line.id} line={line} />
                ))}
              </Wide>
              {doc.lines.length === 0 && (
                <EmptyState
                  title="Nota belum punya baris"
                  sub="Nota tanpa baris boleh disimpan sebagai draft, tapi tidak bisa diposting. Tambahkan lewat Ubah baris."
                />
              )}
              <View style={styles.totalsBox}>
                <SumRow label="Subtotal" value={rp(decimalToNumber(doc.subtotal))} />
                <SumRow label="Diskon nota" value={`− ${rp(decimalToNumber(doc.diskonNota))}`} />
                <SumRow label="Pembulatan" value={rp(decimalToNumber(doc.pembulatan))} />
                <View style={styles.itemsFoot}>
                  <Text style={{ fontSize: 14, color: C.muted3 }}>Total nota</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.2 }}>
                    {rp(total)}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      <PenjualanFormModal
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
 * The price version sits under the product rather than in a column of its own:
 * it is an id, nobody reads it as a number, and what is worth saying about it is
 * whether there *is* one — "harga ketik manual" is a fact about how the line was
 * priced, and a column full of `#412` is not.
 */
function LineRow({ line }: { line: PenjualanLine }) {
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.itemNama} numberOfLines={1}>
          {line.nama}
        </Text>
        <Text style={styles.itemKode} numberOfLines={1}>
          {line.kode} · {formatDesimal(line.qtyInput)} {line.namaSatuan}
          {line.faktor === 1 ? '' : ` (×${line.faktor})`}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {num(line.qtyDasar)} {line.namaSatuanDasar}
          {line.idHargaJual === null ? ' · harga ketik manual' : ' · dari daftar harga'}
        </Text>
      </View>
      <Text style={styles.itemQty}>
        {formatDesimal(line.qtyInput)} {line.namaSatuan}
      </Text>
      <Text style={styles.itemHarga}>
        {rp(decimalToNumber(line.hargaSatuanInput))}
        {decimalToNumber(line.diskonBaris) > 0
          ? `\n− ${rp(decimalToNumber(line.diskonBaris))}`
          : ''}
      </Text>
      <Text style={styles.itemSubtotal}>{rp(decimalToNumber(line.subtotal))}</Text>
      <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
        {/* Null until posting: not yet known, rather than missing. It is the
            moving average `kartu_stok` actually charged out, not a figure this
            screen could reproduce. */}
        <Text style={styles.itemHpp}>
          {line.hppDasar === null ? '—' : rp(decimalToNumber(line.hppDasar))}
        </Text>
        {line.hppTotal !== null && (
          <Text style={styles.itemMeta}>
            margin {rp(decimalToNumber(line.subtotal) - decimalToNumber(line.hppTotal))}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * A row group wide enough to need scrolling on a phone. The page scrolls down
 * and this scrolls across, which is the arrangement a detail wants — the whole
 * document reachable by one downward scroll.
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
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  actionBar: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  alasanLabel: { fontSize: 13.5, fontWeight: '700', color: C.red },
  amberLabel: { fontSize: 13.5, fontWeight: '700', color: C.amber },
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
  itemHarga: { width: 140, textAlign: 'right', fontSize: 14.5, color: C.dark2 },
  itemSubtotal: { width: 140, textAlign: 'right', fontSize: 16, fontWeight: '600', color: C.text },
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
  editNote: { fontSize: 12.5, color: C.muted3, lineHeight: 18 },
});
