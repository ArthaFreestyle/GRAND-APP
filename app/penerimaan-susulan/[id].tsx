/**
 * Kiriman susulan — one document. Board screen F2 at every status, plus the part
 * of F3 that is actually buildable.
 *
 * ## Where the second person stands, and why the board is wrong about it
 *
 * The same workflow as a pembelian and the same split between two people:
 * `INVENTARIS` types and submits, `SUPERADMIN` posts, rejects and cancels. A
 * transition the active grant cannot run is not rendered at all — pressing
 * "Posting" only to be told `role tidak mencukupi` teaches nobody who to ask.
 *
 * `LayarGudang.dc.html` disagrees twice: its F2 carries a single "Posting
 * penerimaan" CTA, and the annotation under its approval inbox says *"Penerimaan
 * susulan diposting langsung oleh staf gudang."* The contract is unambiguous
 * against both — `POST /penerimaan-susulan/{id}/posting` is documented as
 * `DIAJUKAN → POSTED` with `Role: SUPERADMIN`, and `/ajukan` is `DRAFT →
 * DIAJUKAN` for `INVENTARIS` or `SUPERADMIN`. A screen drawn the board's way
 * would put a button on this page that the server answers 403 to, for the one
 * grant that does most of the typing. So the four transitions stay, they come off
 * `AKSI` in `services/penerimaan-susulan.ts`, and the divergence is recorded in
 * CLAUDE.md rather than rediscovered.
 *
 * ## What editing costs
 *
 * Editing is a `DRAFT` matter only. `PATCH /penerimaan-susulan/{id}` and
 * `PUT .../detail` both answer 409 once the document is submitted, which is what
 * submitting it is for. The header — two fields, `tanggal` and `keterangan` —
 * edits in a sheet, and the lines edit in place, because `PUT .../detail`
 * replaces the whole set and there is no half of it to show.
 *
 * Two reads feed this screen and they are not equal. `GET /penerimaan-susulan/
 * {id}` is the page: without it there is nothing. `GET /pembelian/{id}` is only
 * needed to *edit* the lines, because the per-line ceiling lives on the invoice
 * and nowhere else — so it is spent when "Ubah baris" is pressed, not on open,
 * and reading it that late is also what makes the ceilings current.
 *
 * ## F3 "Selesai", and what survives of it
 *
 * The board closes this flow on a full-screen page with no header, naming the new
 * balance and offering two exits: the kartu stok, or home. Two thirds of that is
 * not buildable and the third is better placed here.
 *
 * The new balance is not in any response this screen has — `PenerimaanSusulan`
 * carries quantities and values, not the resulting `stok_akhir` — and reading it
 * would be one `GET /product/{id}/stok` per line. And F3 is predicated on the
 * gudang staff having just posted, which the contract says does not happen.
 *
 * What is kept is its *exit*: once the document is POSTED, every line row opens
 * that product's kartu stok in this document's own ruang, which is the screen
 * that answers "kenapa saldonya jadi segini" properly — with the whole chain
 * rather than one number. That is a link per line instead of one button, which is
 * also the honest shape: a susulan has several products and F3 had room to name
 * one.
 *
 * `?ubah=1` opens the header sheet on arrival and `?baru=1` says the create form
 * just landed. Both are read once on the way in: they seed the screen rather than
 * driving it, which is safe here because a pushed route is mounted fresh.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import {
  barisSumber,
  BarisTerpasang,
  draftsDari,
  nilaiTurunan,
  turunanToInput,
  TurunanLineEditor,
  type TurunanDraft,
} from '@/components/pembelian/turunan';
import { AksiDialog } from '@/components/shell/aksi-dialog';
import {
  RamahBadge,
  RamahBarrierCard,
  RamahField,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahStackCard,
  RamahStatCard,
  RamahSummaryCard,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import type { AksiDokumen } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { formatDesimal } from '@/services/decimal';
import { getPembelian } from '@/services/pembelian';
import {
  aksiTersedia,
  getSusulan,
  jalankanAksi,
  replaceSusulanDetail,
  rowOf,
  susulanBus,
  updateSusulan,
  type SusulanDoc,
} from '@/services/penerimaan-susulan';
import { useActiveRole, useCanWrite } from '@/services/permissions';

export default function PenerimaanSusulanDetailScreen() {
  const router = useRouter();
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
  const dockPad = useDockPadding(insets.bottom, L.cardGap);
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const canWrite = useCanWrite('penerimaan-susulan');
  const role = useActiveRole();

  /**
   * A malformed `:id` is a fact about the *route*, known the moment the params
   * arrive, so the failure page is derived during render rather than written into
   * state from an effect — which cost a render, then an effect, then a second
   * render, to conclude something that was already true.
   */
  const idValid = Number.isFinite(id) && id > 0;

  const [doc, setDoc] = useState<SusulanDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  /**
   * Loading is derived from "the id I want loaded" against "the id I have
   * loaded", the shape `app/produk/index.tsx` established. Nothing is set on the
   * way into the fetch effect, so there is no render cascade and no stale
   * response can un-set a flag the next request just set — which is what the
   * `eslint-disable-next-line react-hooks/set-state-in-effect` this screen used
   * to carry was standing in for.
   */
  const [loadedId, setLoadedId] = useState(0);
  const loading = idValid && loadedId !== id;

  /** The header sheet. `null` means it is closed. */
  const [draft, setDraft] = useState<{ tanggal: string; keterangan: string } | null>(null);
  const [draftErr, setDraftErr] = useState('');

  /** `null` means the lines are not being edited. */
  const [lines, setLines] = useState<TurunanDraft[] | null>(null);
  const [linesErr, setLinesErr] = useState('');
  const [linesLoading, setLinesLoading] = useState(false);

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  // Read once, on the way in — safe on a pushed route, which is mounted fresh.
  const openEditOnLoad = useRef(params.ubah === '1');
  const announceCreated = useRef(params.baru === '1');

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getSusulan(id)
      .then((current) => {
        if (!alive) return;
        setDoc(current);
        setLoadErr('');
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(
            `Tersimpan sebagai draf dengan nomor ${current.nomor}. Belum menyentuh stok — ajukan dulu, lalu diposting.`
          );
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          // Only a draft can be edited; arriving with `?ubah=1` on anything else
          // would open a sheet whose save is guaranteed to answer 409.
          if (current.status === 'DRAFT') {
            setDraft({ tanggal: current.tanggal.slice(0, 10), keterangan: current.keterangan });
          }
        }
      })
      .catch((e) => {
        if (!alive) return;
        setDoc(null);
        // Arrived at cold — a deep link, a reload — so there may be no list
        // behind this screen to toast over and the failure has to be the page. A
        // document whose source invoice sits outside the session's unit kerja
        // answers 404 here, exactly like an id that does not exist.
        setLoadErr(messageOf(e, 'Gagal memuat dokumen kiriman susulan.'));
      })
      .finally(() => {
        if (alive) setLoadedId(id);
      });
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  /** Every write answers with the whole document, so this is the only sync needed. */
  const applyDoc = useCallback((saved: SusulanDoc, message: string) => {
    setDoc(saved);
    if (message) setKabar(message);
    susulanBus.publish({ kind: 'saved', row: rowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `back()` is offered to the
    // navigator containing the tabs first, which may answer by switching tabs.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penerimaan-susulan');
  }, [router]);

  const updateLines = useCallback((updater: (prev: TurunanDraft[]) => TurunanDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  /**
   * Opening the line editor costs a `GET /pembelian/{id}`.
   *
   * The ceilings are not on this document — they are `sisaDasar` on the source
   * invoice's lines, recomputed there from every POSTED susulan. Reading them at
   * the moment of editing rather than on open also means they are current: a
   * susulan posted by somebody else in the meantime has already moved them.
   */
  const openLineEditor = useCallback(async () => {
    if (!doc || linesLoading) return;
    setLinesLoading(true);
    setLinesErr('');
    try {
      const sumber = await getPembelian(doc.idPembelian);
      // The lines this document already carries are kept in the list even if
      // their ceiling has since fallen to zero, so an over-limit row is visible
      // rather than silently dropped.
      const dipakai = doc.lines.map((l) => l.idPembelianDetail);
      setLines(draftsDari(barisSumber(sumber, 'susulan', dipakai), doc.lines));
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal memuat faktur asal untuk menyunting baris.'));
    } finally {
      setLinesLoading(false);
    }
  }, [doc, linesLoading]);

  async function saveHeader() {
    if (!doc || !draft || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.tanggal)) {
      setDraftErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    try {
      applyDoc(
        await updateSusulan(doc.id, {
          tanggal: draft.tanggal,
          // `null` clears the column; `undefined` would leave it alone, and an
          // emptied note has to actually come off the document.
          keterangan: draft.keterangan.trim() || null,
        }),
        'Header dokumen tersimpan'
      );
      setDraft(null);
      setDraftErr('');
    } catch (e) {
      // 409 here is the status guard: the document left DRAFT between opening the
      // sheet and saving it.
      setDraftErr(messageOf(e, 'Gagal menyimpan header.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    if (!doc || !lines || busy) return;
    const detail = turunanToInput(lines, 'susulan');
    if (!detail.ok) {
      setLinesErr(detail.error);
      return;
    }
    setBusy(true);
    try {
      applyDoc(await replaceSusulanDetail(doc.id, detail.detail), 'Baris dokumen diganti');
      setLines(null);
      setLinesErr('');
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal menyimpan baris.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAksi() {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim() === '') {
      setAksiErr('Alasan wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      applyDoc(saved, pesanAksi(aksi.key, saved));
      setAksi(null);
      setAlasan('');
      setAksiErr('');
    } catch (e) {
      // The server's own message names the actual blocker — a closed period, a
      // remainder another document consumed first — and no invented wording
      // beats it.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  const openKartuStok = useCallback(
    (idProduct: number, idRuang: number) => {
      // The document's own ruang travels with the push, so the kartu stok opens
      // on the shelf this susulan actually moved rather than on whichever room
      // the catalogue was last looking at.
      router.push({ pathname: '/produk/[id]', params: { id: idProduct, ruang: idRuang } });
    },
    [router]
  );

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Kiriman susulan" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Dokumen tidak ditemukan</Text>
          <Text style={styles.centerSub}>
            {idValid ? loadErr : 'Alamat dokumen tidak dikenali.'}
          </Text>
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
        <RamahHeader title="Kiriman susulan" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const meta = DOKUMEN_RAMAH[doc.status];
  const editing = lines !== null;
  const bolehUbah = canWrite && doc.status === 'DRAFT';
  const posted = doc.status === 'POSTED';

  /**
   * The transitions this status and this grant can run, **forward ones first**.
   *
   * `AKSI` in `services/penerimaan-susulan.ts` is declared in status order —
   * ajukan, tolak, posting, batal — which reads correctly as a table of the flow
   * and lands wrongly as a row of buttons: a supervisor looking at a `DIAJUKAN`
   * document gets `[tolak, posting]`, so the first control on the screen, and the
   * one this dock would draw as the green pill, is *reject*.
   *
   * Sorting the destructive ones to the end fixes it without reordering the table
   * they came from, which is a document of the flow and not of this screen. It is
   * a stable sort, so within each group the table's own order survives. The dock
   * then draws at most one solid pill — the guide's rule — and only ever on a
   * forward action: `POSTED` for a supervisor is `[batal]` alone, which correctly
   * gets no pill at all.
   */
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);

  return (
    <View style={styles.screen}>
      <RamahHeader
        title={doc.nomor || 'Kiriman susulan'}
        onBack={goBack}
        right={
          bolehUbah && !editing ? (
            <View style={styles.headerActions}>
              {/* The two standing actions of a draft, as icons: they are the same
                  two on every draft of this section, which makes them chrome.
                  The role-filtered transitions below are not — their labels read
                  differently to each grant, so they stay text buttons. */}
              <RamahIconButton
                icon="edit-2"
                label="Ubah header dokumen"
                onPress={() =>
                  setDraft({ tanggal: doc.tanggal.slice(0, 10), keterangan: doc.keterangan })
                }
              />
              <RamahIconButton
                icon="list"
                label={linesLoading ? 'Memuat faktur asal' : 'Ubah baris kiriman'}
                disabled={linesLoading}
                onPress={() => void openLineEditor()}
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
            {`atas ${doc.nomorPembelian || '—'} · ${formatTanggal(doc.tanggal)} · ruang ${doc.namaRuang || '—'}`}
          </Text>
        </View>

        {/* A rejection and a cancellation both carry a reason the contract made
            mandatory, and both are the first thing somebody opening this document
            needs. `RamahBarrierCard` — issue #26's shared "kartu penghalang" —
            so this and `app/pembelian/[id].tsx` do not each keep their own copy. */}
        {doc.status === 'DRAFT' && doc.alasanTolak ? (
          <RamahBarrierCard
            tone="danger"
            title="Pengajuan sebelumnya ditolak"
            description={doc.alasanTolak}
          />
        ) : null}
        {doc.status === 'BATAL' && doc.alasanBatal ? (
          <RamahBarrierCard
            tone="danger"
            title="Dokumen dibatalkan"
            description={doc.alasanBatal}
            note="Baris pembaliknya bertanggal hari pembatalan, bukan tanggal dokumen, dan sisanya sudah dikembalikan ke faktur asal."
          />
        ) : null}

        <View style={styles.statRow}>
          <RamahStatCard
            label="Nilai barang"
            value={formatRupiah(doc.totalNilai)}
            // Said on the card rather than in a note below it, because this is
            // the number somebody will otherwise read as a bill. A susulan adds
            // stock and never adds debt.
            note="Nilai persediaan, bukan tagihan"
            accessibilityLabel={`Nilai barang ${formatRupiah(doc.totalNilai)}. Nilai persediaan, bukan tagihan.`}
          />
          <RamahStatCard
            label="Baris kiriman"
            value={`${doc.lines.length} baris`}
            note={posted ? 'Sudah masuk kartu stok' : 'Belum menyentuh stok'}
          />
        </View>

        {linesErr && !editing ? <RamahInlineError message={linesErr} /> : null}

        {editing && lines ? (
          <>
            <TurunanLineEditor drafts={lines} onChange={updateLines} mode="susulan" editable />
            <RamahSummaryCard
              rows={[{ label: 'Nilai setelah diubah', value: formatRupiah(nilaiTurunan(lines)) }]}
            />
            <Text style={styles.editNote}>
              Menyimpan mengganti seluruh baris dokumen sekaligus — itu satu-satunya bentuk yang
              ditawarkan kontrak, karena baris satu kiriman dihitung bersamaan.
            </Text>
            {linesErr ? <RamahInlineError message={linesErr} /> : null}
          </>
        ) : (
          <View style={styles.group}>
            <RamahSectionHeader>
              {posted ? 'Baris kiriman · buka kartu stok' : 'Baris kiriman'}
            </RamahSectionHeader>
            {doc.lines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Dokumen ini belum punya baris</Text>
                <Text style={styles.emptySub}>
                  Draf tanpa baris ditolak saat diajukan. Tambahkan lewat &quot;Ubah baris&quot; di
                  header.
                </Text>
              </View>
            ) : (
              <RamahStackCard>
                {doc.lines.map((line) => (
                  <BarisTerpasang
                    key={line.id}
                    nama={line.nama}
                    kode={line.kode}
                    qty={formatDesimal(line.qtyInput)}
                    satuan={line.namaSatuan}
                    dasar={line.faktor === 1 ? 0 : line.qtyDasar}
                    namaSatuanDasar={line.namaSatuanDasar}
                    nilai={line.nilai}
                    // Only once posted is there a movement to look at. On a draft
                    // the kartu stok would open on a chain this document is not in
                    // yet, which reads as the posting having silently failed.
                    onPress={posted ? () => openKartuStok(line.idProduct, doc.idRuang) : undefined}
                  />
                ))}
              </RamahStackCard>
            )}
            {posted ? (
              <Text style={styles.ledgerNote}>
                {`Nilainya disalin dari harga pokok baris fakturnya, bukan dari rata-rata bergerak hari ini — jadi faktur ${doc.nomorPembelian} dan seluruh susulannya berjumlah persis nilai faktur itu.`}
              </Text>
            ) : null}
          </View>
        )}

        {!editing ? (
          <View style={styles.group}>
            <RamahSectionHeader>Jejak dokumen</RamahSectionHeader>
            <RamahSummaryCard rows={jejakRows(doc)} />
          </View>
        ) : null}
      </ScrollView>

      {/* The foot of the screen, and which controls are on it depends on what the
          reader is doing rather than on who they are. Editing lines replaces the
          workflow buttons entirely: a save and a transition next to each other
          invite pressing the second while the first is still unsaved. */}
      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {editing ? (
          <>
            <RamahPrimaryButton
              label="Simpan baris"
              onPress={saveLines}
              busy={busy}
              disabled={busy}
            />
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
          /* `aksiTersedia` filters by status *and* by the active grant's role, so
             an INVENTARIS grant sees "Ajukan" and never "Posting". The first one
             is the green pill and the rest step down — the guide allows exactly
             one solid pill, and these are never equal: ajukan before posting,
             posting before rejecting. */
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
          /* Nothing to do *here* is worth saying, because the reason is never
             obvious: a POSTED document is finished for a gudang grant and still
             cancellable for a supervisor, and a DIAJUKAN one is waiting on
             somebody else entirely. */
          <Text style={styles.noAksi}>{pesanTanpaAksi(doc.status)}</Text>
        )}
      </View>

      {/* The header sheet: two fields, and they are the only two `PATCH` accepts.
          The faktur, the supplier and the ruang are copied from the invoice and
          are not editable by any endpoint. */}
      <RamahSheet
        visible={draft !== null}
        title="Ubah header dokumen"
        onClose={() => {
          setDraft(null);
          setDraftErr('');
        }}>
        {draft ? (
          <View style={styles.sheetBody}>
            <RamahField
              label="Tanggal dokumen"
              required
              value={draft.tanggal}
              onChangeText={(v) => {
                setDraft({ ...draft, tanggal: v });
                setDraftErr('');
              }}
              placeholder="YYYY-MM-DD"
              helper="Menentukan bulan penomoran dan periodenya."
              error={draftErr}
              autoCapitalize="none"
              maxLength={10}
            />
            <RamahField
              label="Keterangan"
              value={draft.keterangan}
              onChangeText={(v) => setDraft({ ...draft, keterangan: v })}
              placeholder="Sisa 5 dus datang menyusul, SJ 00214"
              helper="Opsional. Dikosongkan berarti keterangannya benar-benar dihapus dari dokumen."
              multiline
            />
            <RamahPrimaryButton
              label="Simpan header"
              onPress={saveHeader}
              busy={busy}
              disabled={busy}
            />
          </View>
        ) : null}
      </RamahSheet>

      <AksiDialog
        aksi={aksi}
        alasan={alasan}
        onChangeAlasan={(v) => {
          setAlasan(v);
          setAksiErr('');
        }}
        error={aksiErr}
        onCancel={() => {
          setAksi(null);
          setAksiErr('');
        }}
        onConfirm={confirmAksi}
        busy={busy}
      />
    </View>
  );
}

/**
 * What to say after a transition landed.
 *
 * Per transition rather than one "dokumen sekarang POSTED", because what changed
 * is different each time and the status word alone answers none of it — posting
 * moved stock, rejecting sent the document back to somebody, cancelling wrote a
 * reversal dated today rather than undoing anything.
 */
function pesanAksi(key: AksiDokumen['key'], saved: SusulanDoc): string {
  switch (key) {
    case 'ajukan':
      return 'Diajukan · tanggal dan barisnya sekarang terkunci sampai diposting atau ditolak.';
    case 'tolak':
      return 'Ditolak dan kembali ke draf. Alasannya tersimpan di dokumen.';
    case 'posting':
      return `Diposting · ${saved.lines.length} baris masuk kartu stok di ruang ${saved.namaRuang}. Buka barisnya untuk melihat kartu stoknya.`;
    case 'batal':
      return 'Dibatalkan · baris pembalik bertanggal hari ini, dan sisanya kembali ke faktur asal.';
    default:
      return `Dokumen sekarang ${saved.status}.`;
  }
}

/** Why this screen has no buttons for the grant that is reading it. */
function pesanTanpaAksi(status: SusulanDoc['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Draf ini menunggu diajukan oleh staf gudang atau supervisor.';
    case 'DIAJUKAN':
      return 'Menunggu supervisor memposting atau menolak. Tanggal dan barisnya terkunci.';
    case 'POSTED':
      return 'Sudah masuk kartu stok. Hanya supervisor yang bisa membatalkannya.';
    case 'BATAL':
      return 'Dokumen batal. Tidak ada lagi yang bisa dilakukan di sini.';
    default:
      return '';
  }
}

/**
 * The audit trail, as label/value pairs.
 *
 * Only the stamps that exist — a document that was never submitted has no
 * `diajukanPada`, and printing "Diajukan —" on every draft is a line nobody acts
 * on. `disetujuiPada` and `postedAt` are separate stamps in the contract and are
 * both kept: approval and the write to `kartu_stok` are one transaction today,
 * but they are two columns and a divergence between them would matter.
 */
function jejakRows(doc: SusulanDoc): { label: string; value: string }[] {
  const rows = [{ label: 'Dibuat', value: formatTanggal(doc.createdAt) }];
  if (doc.diajukanPada) rows.push({ label: 'Diajukan', value: formatTanggal(doc.diajukanPada) });
  if (doc.disetujuiPada) rows.push({ label: 'Disetujui', value: formatTanggal(doc.disetujuiPada) });
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  rows.push({ label: 'Keterangan', value: doc.keterangan || '—' });
  return rows;
}

/**
 * No top, left or right inset here: `app/penerimaan-susulan/_layout.tsx` pays all
 * three for the section. The bottom is the dock's and is read in the component.
 * The sheets are the exception and pay their own — a `Modal` is its own window
 * and is not inside the layout's padded box.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
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

  statRow: { flexDirection: 'row', gap: 10 },

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

  ledgerNote: { ...T.micro, ...W.regular, color: C.textBody, paddingTop: L.space1 },
  editNote: { ...T.micro, ...W.regular, color: C.textBody },
  noAksi: { ...T.caption, color: C.textMuted, textAlign: 'center', paddingVertical: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: 10,
    gap: 10,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space5, paddingBottom: L.space2 },
});
