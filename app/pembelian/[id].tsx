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
 * `PUT .../detail` both answer 409 once the document is submitted, which is the
 * entire point of submitting it. The header edits in a sheet (the record is
 * already on screen) and the lines edit in place, because `PUT .../detail`
 * replaces the whole set and there is no half of it to show.
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
 * Penerimaan susulan keeps moving after posting, is its own section, and this
 * screen is where it is started from: a short line is chased from the invoice
 * that recorded the shortfall. The button carries `?idPembelian=` so the form
 * opens with the source already chosen. Retur pembelian is the same shape and
 * belongs beside it, but its section was deleted with the seven others the
 * Ramah design does not draw.
 *
 * `?ubah=1` opens the header sheet on arrival (that is how the list's "Ubah"
 * button gets here) and `?baru=1` says the create form just landed. Both are
 * read once on the way in: they seed the screen rather than driving it.
 *
 * ## Ported to Ramah alongside `app/penerimaan-susulan/[id].tsx`
 *
 * That screen is this one's worked example: the same `RamahHeader` with the two
 * standing edit icons, the same dock that swaps between line-edit controls and
 * the workflow buttons, the same stable sort that pushes a destructive
 * transition to the end of the dock rather than to wherever `AKSI` in
 * `services/pembelian.ts` happens to declare it. The floating `Toast` is gone
 * with it — Ramah has no snackbar, and `RamahNote` sitting at the top of the
 * scroll (as `kabar`) is what every other ported document screen uses instead.
 *
 * ## Beside the tabs now, not inside them — see `_layout.tsx`
 *
 * The section used to be the third tab root; it moved to the root stack for
 * the reason written out there. `goBack` below unchanged its shape either way
 * — `dismiss()` to this section's own Stack, `replace('/pembelian')` for a cold
 * deep link — because a detail pushed from a tab root and one pushed from a
 * root-stack section pop the same way.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EMPTY_HEADER,
  headerBody,
  headerOf,
  PembelianHeaderSheet,
  type PembelianHeaderValues,
} from '@/components/pembelian/form';
import {
  draftOfLine,
  linesKoli,
  linesToInput,
  PembelianLineEditor,
  type LineDraft,
} from '@/components/pembelian/lines';
import { LampiranCard } from '@/components/pembelian/lampiran';
import { TERIMA_META } from '@/components/pembelian/status';
import { AksiDialog } from '@/components/shell/aksi-dialog';
import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahStackCard,
  RamahStatCard,
  RamahSummaryCard,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { BAYAR_META, DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
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
  const params = useLocalSearchParams<{
    id: string;
    ubah?: string;
    baru?: string;
    lampiranGagal?: string;
  }>();
  const id = Number(params.id);

  const [doc, setDoc] = useState<PembelianDoc | null>(null);
  /**
   * A malformed `:id` in the URL is a fact about the *route*, known the moment
   * the params arrive — so it is derived during render, not written into state
   * from an effect.
   */
  const idValid = Number.isFinite(id);
  const [loadErrState, setLoadErr] = useState('');
  /**
   * Loading is derived — "the id I want loaded" against "the id I have
   * loaded", the shape `app/produk/index.tsx` established and
   * `penerimaan-susulan/[id].tsx` copies for the same document shape. Nothing
   * is set on the way into the fetch effect, so there is no render cascade and
   * no stale response can un-set a flag the next request just set — which is
   * what this screen's `eslint-disable-next-line react-hooks/set-state-in-effect`
   * used to stand in for.
   */
  const [loadedId, setLoadedId] = useState(0);
  const loading = idValid && loadedId !== id;
  const loadErr = idValid ? loadErrState : 'Alamat dokumen tidak dikenali.';

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
  /** For "Bagi rata koli", which the koli-mismatch warning offers outside line editing. */
  const [koliErr, setKoliErr] = useState('');

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  const canWrite = useCanWrite('pembelian');
  const canSusulan = useCanWrite('penerimaan-susulan');
  const role = useActiveRole();

  /**
   * Only the bottom inset — `_layout.tsx` pays top, left and right outside this
   * screen. `useDockPadding` swaps it for the keyboard's height while the IME
   * is up, because under edge-to-edge Android does not resize the window for
   * it and the two are alternatives, never a sum.
   */
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.space3);

  // Read once, on the way in: the parameters seed this screen rather than
  // driving it, so closing the sheet does not have to rewrite the URL.
  const openEditOnLoad = useRef(params.ubah === '1');
  const announceCreated = useRef(params.baru === '1');
  /**
   * How many faktur photographs the create flow could not stick to this nota.
   * Frozen on the way in, like the two flags above: it describes the *arrival*,
   * not the document, and re-reading the parameter every render would keep
   * reporting a failure long after the attachments were sorted out.
   */
  const [lampiranGagal] = useState(() => Number(params.lampiranGagal) || 0);

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
    // Nothing to set: an unparseable id already reads as a failure page above.
    if (!Number.isFinite(id)) return;
    const mine = ++generation.current;
    // Two ways to go stale, and they are not the same one. `cancelled` is this
    // effect being torn down; the generation check is a reload started while
    // these were still in flight.
    let cancelled = false;
    const alive = () => !cancelled && generation.current === mine;

    getPembelian(id)
      .then((current) => {
        if (!alive()) return;
        setDoc(current);
        setLoadErr('');
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(`Dokumen ${current.nomor} tersimpan sebagai DRAFT.`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          // Only a draft can be edited; arriving with `?ubah=1` on anything else
          // would open a sheet whose save is guaranteed to answer 409.
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
        if (alive()) setLoadedId(id);
      });

    return () => {
      cancelled = true;
    };
  }, [id, loadSideReads]);

  /**
   * Every write answers with the whole document, including the four
   * transitions, so this is the only sync needed: replace the state, tell the
   * list, and re-read the three things that hang off the new status.
   */
  const applyDoc = useCallback(
    (saved: PembelianDoc, message: string) => {
      setDoc(saved);
      if (message) setKabar(message);
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
    // offered to the navigator holding the tabs first, which may answer by
    // switching tabs instead of popping this screen.
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
      applyDoc(await updatePembelian(doc.id, body.body), 'Header dokumen tersimpan.');
      setDraft(null);
      setDraftErr('');
    } catch (e) {
      // 409 here is the status guard: the document left DRAFT between opening
      // the sheet and saving it.
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
      applyDoc(await replacePembelianDetail(doc.id, detail.detail), 'Baris faktur diganti.');
      setLines(null);
      setLinesErr('');
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
      applyDoc(await bagiRataKoli(doc.id), 'Koli dibagi rata sebanding qty dasar.');
      setKoliErr('');
    } catch (e) {
      setKoliErr(messageOf(e, 'Gagal membagi koli.'));
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
      applyDoc(saved, pesanAksi(aksi.key, saved));
      setAksi(null);
      setAlasan('');
      setAksiErr('');
    } catch (e) {
      // The server's own message names the actual blocker — a closed period, a
      // carton total that does not add up, a balance that would go negative —
      // and no invented wording beats it.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail faktur" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Dokumen tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat dokumen tidak dikenali.'}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke daftar" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail faktur" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  // ---- derived ----

  const editing = lines !== null;
  const isDraft = doc.status === 'DRAFT';
  const bolehUbah = canWrite && isDraft;
  const meta = DOKUMEN_RAMAH[doc.status];

  const totalKoli = decimalToNumber(doc.totalKoli);
  const koliBaris = doc.lines.reduce((s, l) => s + decimalToNumber(l.jumlahKoli), 0);
  // Posting refuses a document whose line cartons do not add up to the header's,
  // so this is worth saying while it can still be fixed rather than at posting.
  const koliTimpang =
    doc.status !== 'POSTED' &&
    doc.status !== 'BATAL' &&
    totalKoli > 0 &&
    Math.abs(koliBaris - totalKoli) > KOLI_EPSILON;

  const sisaUtang = utang ? decimalToNumber(utang.sisa_utang) : 0;

  /**
   * The one document that can still be written against this one, and only while
   * it is genuinely possible.
   *
   * It needs the invoice POSTED: before that a line has no harga pokok to copy,
   * no settled remainder, and nothing that has arrived. `status_penerimaan` is
   * the server's own cache of whether anything is still owed.
   *
   * A retur pembelian is the other document that hangs off a posted invoice.
   * `app/(admin)/retur-pembelian/` was deleted with the seven other sections the
   * Ramah design does not draw, so its button is gone with it —
   * `services/retur-pembelian.ts` is kept for when the section comes back.
   */
  const bisaSusulan = canSusulan && doc.status === 'POSTED' && doc.statusTerima === 'KURANG';

  /**
   * The transitions this status and this grant can run, **forward ones first**
   * — the same stable sort `penerimaan-susulan/[id].tsx` applies, and for the
   * same reason: `AKSI` in `services/pembelian.ts` is declared in flow order
   * (ajukan, tolak, posting, batal), which reads correctly as a table and lands
   * wrongly as a row of buttons. A supervisor looking at a `DIAJUKAN` document
   * gets `[tolak, posting]` straight from the table, so the first control — and
   * the dock's one solid pill — would be *reject*.
   */
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);

  return (
    <View style={styles.screen}>
      <RamahHeader
        title={doc.nomor || 'Detail faktur'}
        onBack={goBack}
        right={
          bolehUbah && !editing ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah header dokumen"
                onPress={() => setDraft(headerOf(doc, namaEkspedisi))}
              />
              <RamahIconButton
                icon="list"
                label="Ubah baris faktur"
                onPress={() => {
                  setLines(doc.lines.map(draftOfLine));
                  setLinesErr('');
                }}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <View style={styles.identityTop}>
            <Text style={styles.identityName} numberOfLines={2}>
              {doc.namaSupplier || '—'}
            </Text>
            <RamahBadge label={meta.label} tone={meta.tone} />
          </View>
          <Text style={styles.identitySub}>
            {`${doc.nomor} · ${formatTanggal(doc.tanggal)} · ruang ${doc.namaRuang || '—'}`}
          </Text>
        </View>

        {doc.status === 'DRAFT' && doc.alasanTolak ? (
          <View style={styles.alasanBox}>
            <Text style={styles.alasanLabel}>Pengajuan sebelumnya ditolak</Text>
            <Text style={styles.alasanText}>{doc.alasanTolak}</Text>
          </View>
        ) : null}
        {doc.status === 'BATAL' && doc.alasanBatal ? (
          <View style={styles.alasanBox}>
            <Text style={styles.alasanLabel}>Dokumen dibatalkan</Text>
            <Text style={styles.alasanText}>{doc.alasanBatal}</Text>
            <Text style={styles.alasanNote}>
              Baris pembaliknya bertanggal hari pembatalan, bukan tanggal dokumen — laporan per
              periode harus dibaca dari kartu stok, bukan dari status ini.
            </Text>
          </View>
        ) : null}

        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <RamahStatCard
              label="Total faktur"
              value={formatRupiah(doc.total)}
              note={`${doc.lines.length} baris · ${doc.jenis === 'KREDIT' ? 'kredit' : 'tunai'}`}
            />
          </View>
          <View style={styles.statCell}>
            <RamahStatCard
              label="Biaya angkut"
              value={formatRupiah(doc.biayaAngkut)}
              note={doc.ditanggungSupplier ? 'Ditanggung supplier' : 'Tagihan ekspedisi, di luar total faktur'}
            />
          </View>
          <View style={styles.statCell}>
            <RamahStatCard
              label="Sisa utang"
              value={
                doc.status !== 'POSTED'
                  ? '—'
                  : doc.statusBayar === 'LUNAS'
                    ? formatRupiah(0)
                    : utangState === 'memuat'
                      ? '…'
                      : utangState === 'ada'
                        ? formatRupiah(sisaUtang)
                        : '—'
              }
              tone={sisaUtang > 0 || utangState === 'gagal' ? 'warn' : 'plain'}
              note={
                doc.status !== 'POSTED'
                  ? 'Belum diposting — belum jadi utang'
                  : utangState === 'gagal'
                    ? utangErr || 'Gagal dimuat'
                    : utangState === 'takTerjangkau'
                      ? `${BAYAR_META[doc.statusBayar].label} · nilainya di luar halaman antrean`
                      : BAYAR_META[doc.statusBayar].label
              }
            />
          </View>
          <View style={styles.statCell}>
            <RamahStatCard
              label="Penerimaan"
              value={TERIMA_META[doc.statusTerima].label}
              tone={doc.statusTerima === 'KURANG' ? 'warn' : 'plain'}
              note={
                doc.statusTerima === 'LENGKAP'
                  ? 'Semua yang difakturkan datang'
                  : `${doc.lines.filter((l) => l.sisaDasar > 0).length} baris masih ditunggu`
              }
            />
          </View>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Detail faktur</RamahSectionHeader>
          <RamahSummaryCard
            rows={[
              { label: 'Tanggal dokumen', value: formatTanggal(doc.tanggal) },
              { label: 'No. faktur supplier', value: doc.noFakturSupplier || '—' },
              {
                label: 'Tanggal faktur',
                value: doc.tanggalFaktur ? formatTanggal(doc.tanggalFaktur) : '—',
              },
              {
                label: 'Ekspedisi',
                value: doc.idEkspedisi === null ? '—' : namaEkspedisi || '…',
              },
              { label: 'No. resi', value: doc.noResi || '—' },
              {
                label: 'Koli',
                value:
                  totalKoli > 0
                    ? `${formatDesimal(doc.totalKoli)} × ${formatRupiah(doc.tarifPerKoli)}`
                    : '—',
              },
              {
                label: 'Metode alokasi',
                value: doc.metodeAlokasi === 'KOLI' ? 'Per koli' : 'Per qty dasar',
              },
              {
                label: 'PPN',
                value: `${formatRupiah(doc.ppn)}${doc.ppnDikreditkan ? ' · dikreditkan' : ''}`,
              },
            ]}
          />
        </View>

        {/* The faktur this nota was typed from, when it was photographed.
            Draws nothing at all on a nota with no attachments, which is most
            of them — see the component. */}
        <LampiranCard refTable="pembelian" refId={doc.id} gagalSaatDibuat={lampiranGagal} />

        {koliTimpang ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnLabel}>Koli baris belum cocok dengan header</Text>
            <Text style={styles.warnText}>
              {`Header menyebut ${formatDesimal(doc.totalKoli)} koli, seluruh baris berjumlah ${formatDesimal(String(koliBaris))}. Posting akan ditolak selama keduanya berbeda.`}
            </Text>
            {koliErr ? <RamahInlineError message={koliErr} /> : null}
            {bolehUbah ? (
              <View style={styles.warnAction}>
                <RamahSecondaryButton label="Bagi rata koli" onPress={() => void ratakanKoli()} />
              </View>
            ) : null}
          </View>
        ) : null}

        {editing && lines ? (
          <>
            <PembelianLineEditor
              lines={lines}
              onChange={updateLines}
              idSupplier={doc.idSupplier}
              pakaiKoli={!doc.ditanggungSupplier && totalKoli > 0}
              editable
            />
            <Text style={styles.editNote}>
              Menyimpan mengganti seluruh baris dokumen sekaligus — itu satu-satunya bentuk yang
              ditawarkan kontrak, karena baris satu dokumen adalah satu kesatuan yang diketik dari
              satu lembar kertas.
              {totalKoli > 0
                ? ` Koli baris saat ini ${formatDesimal(String(linesKoli(lines)))} dari ${formatDesimal(doc.totalKoli)}.`
                : ''}
            </Text>
            {linesErr ? <RamahInlineError message={linesErr} /> : null}
          </>
        ) : (
          <View style={styles.group}>
            <RamahSectionHeader>{`Baris faktur · ${doc.lines.length} baris`}</RamahSectionHeader>
            {doc.lines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Dokumen belum punya baris</Text>
                <Text style={styles.emptySub}>
                  Dokumen tanpa baris tidak bisa diajukan. Tambahkan lewat &quot;Ubah baris&quot;.
                </Text>
              </View>
            ) : (
              <RamahStackCard>
                {doc.lines.map((line) => (
                  <FakturLineRow key={line.id} line={line} />
                ))}
              </RamahStackCard>
            )}
            <RamahSummaryCard
              rows={[
                { label: 'Subtotal', value: formatRupiah(doc.subtotal) },
                { label: 'Diskon nota', value: `− ${formatRupiah(doc.diskonNota)}` },
                { label: 'PPN', value: formatRupiah(doc.ppn) },
                { label: 'Pembulatan', value: formatRupiah(doc.pembulatan) },
                { label: 'Total faktur', value: formatRupiah(doc.total) },
                { label: 'Biaya angkut (di luar total)', value: formatRupiah(doc.biayaAngkut) },
              ]}
            />
          </View>
        )}

        {/* Started from here rather than from an empty picker in the other
            section: the invoice is what somebody is holding when the second
            delivery turns up, and the form cannot be filled in without choosing
            it anyway. */}
        {bisaSusulan && !editing ? (
          <View style={styles.lanjutanBox}>
            <Text style={styles.lanjutanLabel}>Dokumen lanjutan</Text>
            <Text style={styles.lanjutanText}>
              Faktur ini sudah diposting, jadi barisnya sudah punya harga pokok — kiriman susulan
              menyalin angka itu, bukan rata-rata bergerak hari ini.
            </Text>
            <View style={styles.lanjutanAction}>
              <RamahSecondaryButton
                label="Buat kiriman susulan"
                onPress={() =>
                  router.push({ pathname: '/penerimaan-susulan/baru', params: { idPembelian: doc.id } })
                }
              />
            </View>
          </View>
        ) : null}

        {sisa || sisaErr !== '' ? (
          <View style={styles.group}>
            <RamahSectionHeader>{`Belum datang${sisa ? ` · ${sisa.baris?.length ?? 0} baris` : ''}`}</RamahSectionHeader>
            {sisaErr !== '' ? (
              <RamahInlineError message={sisaErr} onRetry={retrySideReads} />
            ) : (sisa?.baris?.length ?? 0) === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Tidak ada sisa</Text>
                <Text style={styles.emptySub}>Semua yang difakturkan sudah tercatat diterima.</Text>
              </View>
            ) : (
              <>
                <RamahStackCard>
                  {sisa?.baris?.map((b) => <SisaLineRow key={b.id_pembelian_detail} baris={b} />)}
                </RamahStackCard>
                <Text style={styles.sisaNote}>
                  Kekurangan kiriman dikejar dengan penerimaan susulan — dokumen tersendiri yang
                  menambah stok tanpa menambah utang, karena fakturnya sudah terbit penuh di kiriman
                  pertama. Bukan dengan retur: yang tidak pernah datang tidak bisa dikirim balik.
                </Text>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.group}>
          <RamahSectionHeader>Jejak dokumen</RamahSectionHeader>
          <RamahSummaryCard rows={jejakRows(doc)} />
        </View>
      </ScrollView>

      {/* The foot of the screen, and which controls are on it depends on what
          the reader is doing rather than on who they are. Editing lines
          replaces the workflow buttons entirely: a save and a transition next
          to each other invite pressing the second while the first is still
          unsaved. */}
      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {editing ? (
          <>
            <RamahPrimaryButton label="Simpan baris" onPress={saveLines} busy={busy} disabled={busy} />
            <RamahTertiaryButton
              label="Batal"
              height={L.controlHSm + 8}
              onPress={() => {
                setLines(null);
                setLinesErr('');
              }}
            />
          </>
        ) : aksiList.length > 0 ? (
          aksiList.map((a, i) =>
            i === 0 && !a.danger ? (
              <RamahPrimaryButton
                key={a.key}
                label={a.label}
                onPress={() => {
                  setAksi(a);
                  setAlasan('');
                  setAksiErr('');
                }}
              />
            ) : (
              <RamahSecondaryButton
                key={a.key}
                label={a.label}
                fullWidth
                height={L.controlH}
                onPress={() => {
                  setAksi(a);
                  setAlasan('');
                  setAksiErr('');
                }}
              />
            )
          )
        ) : (
          <Text style={styles.noAksi}>{pesanTanpaAksi(doc.status)}</Text>
        )}
      </View>

      <PembelianHeaderSheet
        visible={draft !== null}
        values={draft ?? EMPTY_HEADER}
        onChange={patchDraft}
        error={draftErr}
        busy={busy}
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
    </View>
  );
}

/**
 * One stored line, read-only.
 *
 * The four quantities are two pairs on different axes, so they are written as
 * one sentence under the product rather than four columns: what arrived
 * against what was invoiced, and — separately — what could still go back to
 * the supplier. A line can be short *and* returnable at the same time.
 */
function FakturLineRow({ line }: { line: PembelianLine }) {
  const kurang = line.sisaDasar > 0;
  return (
    <View style={styles.lineRow}>
      <View style={styles.grow}>
        <Text style={styles.lineNama} numberOfLines={2}>
          {line.nama || line.kode}
        </Text>
        <Text style={styles.lineSub} numberOfLines={1}>
          {`${line.kode} · ${formatDesimal(line.qtyFaktur)} ${line.namaSatuan}${
            line.faktor === 1 ? '' : ` (×${line.faktor})`
          }`}
        </Text>
        <Text style={[styles.lineMeta, kurang && styles.lineMetaWarn]} numberOfLines={2}>
          {`Diterima ${formatDesimal(String(line.qtyDiterimaDasar))} dari ${formatDesimal(String(line.qtyDasar))} ${line.namaSatuanDasar}`}
          {line.qtySusulanDasar > 0 ? ` · susulan ${formatDesimal(String(line.qtySusulanDasar))}` : ''}
          {kurang ? ` · kurang ${formatDesimal(String(line.sisaDasar))}` : ''}
          {line.qtyReturDasar > 0 ? ` · diretur ${formatDesimal(String(line.qtyReturDasar))}` : ''}
        </Text>
        {line.keteranganSelisih ? (
          <Text style={styles.lineMeta} numberOfLines={2}>
            {line.keteranganSelisih}
          </Text>
        ) : null}
      </View>
      <View style={styles.lineRight}>
        <Text style={styles.lineValue} numberOfLines={1}>
          {formatRupiah(line.subtotal)}
        </Text>
        <Text style={styles.lineHarga} numberOfLines={1}>
          {`@ ${formatRupiah(line.hargaSatuanInput)}`}
        </Text>
        {line.hppDasar !== null ? (
          <Text style={styles.lineHarga} numberOfLines={1}>
            {`HPP ${formatRupiah(line.hppDasar)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SisaLineRow({
  baris,
}: {
  baris: NonNullable<SisaPembelian['baris']>[number];
}) {
  return (
    <View style={styles.lineRow}>
      <View style={styles.grow}>
        <Text style={styles.lineNama} numberOfLines={1}>
          {baris.nama_product}
        </Text>
        <Text style={styles.lineSub} numberOfLines={1}>
          {baris.kode_barang}
          {baris.keterangan_selisih ? ` · ${baris.keterangan_selisih}` : ''}
        </Text>
      </View>
      <View style={styles.lineRight}>
        <Text style={styles.lineHarga} numberOfLines={1}>
          {`${formatDesimal(String(baris.qty_diterima_dasar ?? 0))} + ${formatDesimal(String(baris.qty_susulan_dasar ?? 0))} dari ${formatDesimal(String(baris.qty_dasar ?? 0))} ${baris.nama_satuan_dasar}`}
        </Text>
        <Text style={[styles.lineValue, styles.lineMetaWarn]} numberOfLines={1}>
          {`kurang ${formatDesimal(String(baris.sisa_dasar ?? 0))} ${baris.nama_satuan_dasar}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * What to say after a transition landed.
 *
 * Per transition rather than one "dokumen sekarang POSTED", because what
 * changed is different each time and the status word alone answers none of it
 * — posting valued stock at the invoice, rejecting sent the document back to
 * whoever typed it, cancelling wrote a reversal dated today rather than
 * undoing anything.
 */
function pesanAksi(key: AksiDokumen['key'], saved: PembelianDoc): string {
  switch (key) {
    case 'ajukan':
      return 'Diajukan · header dan barisnya sekarang terkunci sampai diposting atau ditolak.';
    case 'tolak':
      return 'Ditolak dan kembali ke draf. Alasannya tersimpan di dokumen.';
    case 'posting':
      return `Diposting · ${saved.lines.length} baris masuk kartu stok di ruang ${saved.namaRuang}, dinilai sebanding dengan yang benar-benar datang.`;
    case 'batal':
      return 'Dibatalkan · baris pembalik bertanggal hari ini, dinilai pada rata-rata bergerak yang berlaku sekarang.';
    default:
      return `Dokumen sekarang ${saved.status}.`;
  }
}

/** Why this screen has no buttons for the grant that is reading it. */
function pesanTanpaAksi(status: PembelianDoc['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Draf ini menunggu diajukan oleh staf gudang atau supervisor.';
    case 'DIAJUKAN':
      return 'Menunggu supervisor memposting atau menolak. Header dan barisnya terkunci.';
    case 'POSTED':
      return 'Sudah masuk kartu stok. Hanya supervisor yang bisa membatalkannya.';
    case 'BATAL':
      return 'Dokumen batal. Tidak ada lagi yang bisa dilakukan di sini.';
    default:
      return '';
  }
}

/** The audit trail, as label/value pairs — only the stamps that actually exist. */
function jejakRows(doc: PembelianDoc): { label: string; value: string }[] {
  const rows = [{ label: 'Dibuat', value: formatTanggal(doc.createdAt) }];
  if (doc.diajukanPada) rows.push({ label: 'Diajukan', value: formatTanggal(doc.diajukanPada) });
  if (doc.disetujuiPada) rows.push({ label: 'Disetujui', value: formatTanggal(doc.disetujuiPada) });
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  return rows;
}

/**
 * No top, left or right inset here: `_layout.tsx` pays all three for the
 * section, outside the navigator. The bottom is the dock's and is read in the
 * component. The sheet and dialog this screen raises pay their own — neither
 * sits inside this padded box.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space1,
    paddingBottom: L.space6,
    gap: L.groupGap,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.groupTitle, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.caption, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.space1 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  identityName: { ...T.identity, color: C.textTitle, flexShrink: 1 },
  identitySub: { ...T.caption, color: C.textBody },

  alasanBox: { backgroundColor: C.red50, borderRadius: R.card, padding: L.cardPad, gap: L.space1 },
  alasanLabel: { ...T.rowTitle, color: C.textDanger },
  alasanText: { ...T.caption, color: C.textTitle },
  alasanNote: { ...T.micro, ...W.regular, color: C.textBody, marginTop: L.space2 },

  warnBox: { backgroundColor: C.orange50, borderRadius: R.card, padding: L.cardPad, gap: L.space1 },
  warnLabel: { ...T.rowTitle, color: C.orange600 },
  warnText: { ...T.caption, color: C.textTitle },
  warnAction: { paddingTop: L.space2, flexDirection: 'row' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: { flexBasis: '47%', flexGrow: 1 },

  group: { gap: L.space2 },
  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.rowTitle, color: C.textTitle },
  emptySub: { ...T.caption, color: C.textBody },

  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  lineNama: { ...T.rowTitle, color: C.textTitle },
  lineSub: { ...T.caption, color: C.textMuted, marginTop: 2 },
  lineMeta: { ...T.caption, color: C.textBody, marginTop: 2 },
  lineMetaWarn: { color: C.orange600 },
  lineRight: { flexShrink: 0, maxWidth: 160, alignItems: 'flex-end', gap: 2 },
  lineValue: { ...T.rowTitle, color: C.textTitle, textAlign: 'right' },
  lineHarga: { ...T.caption, color: C.textBody, textAlign: 'right' },

  editNote: { ...T.micro, ...W.regular, color: C.textBody },

  lanjutanBox: { backgroundColor: C.surfaceCard, borderWidth: 1, borderColor: C.borderHairline, borderRadius: R.card, padding: L.cardPad, gap: L.space1 },
  lanjutanLabel: { ...T.rowTitle, color: C.textTitle },
  lanjutanText: { ...T.caption, color: C.textBody },
  lanjutanAction: { paddingTop: L.space2, flexDirection: 'row' },

  sisaNote: { ...T.micro, ...W.regular, color: C.textBody },

  noAksi: { ...T.caption, color: C.textMuted, textAlign: 'center', paddingVertical: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: 10,
    gap: 10,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
