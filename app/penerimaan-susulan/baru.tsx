/**
 * Kiriman susulan baru — the creating half of board screen F2.
 *
 * `POST /penerimaan-susulan` takes the header **and** its lines in one body and
 * always creates a `DRAFT`. So this page saves once and lands on the document it
 * made; submitting it for approval is a decision taken on the detail, and
 * deliberately not folded into a "simpan & ajukan" button that would make an
 * irreversible flow feel like a save.
 *
 * **The board's F2 posts straight to stock** — its one CTA is "Posting
 * penerimaan", and its annotation beside the approval inbox says *"Penerimaan
 * susulan diposting langsung oleh staf gudang."* The contract says otherwise and
 * the contract wins: `/posting` is `DIAJUKAN → POSTED` and its role line reads
 * `SUPERADMIN`, with `/ajukan` standing between this screen and it. See the
 * detail screen's header for where the second person stands.
 *
 * ### The source invoice is the form
 *
 * Everything else here follows from `id_pembelian`. The supplier and the ruang
 * are copied from it and are not fields; the lines can only be its lines; the
 * per-line ceiling is its remainder; the value is its harga pokok. So the invoice
 * is chosen first and everything else is read from `GET /pembelian/{id}` — one
 * request, which also happens to be the only way to learn the ceilings, since the
 * list payload carries no lines at all.
 *
 * Only `POSTED` invoices are offered, and by default only those still short.
 * Before posting a line has no harga pokok to copy and no settled remainder; and
 * an invoice with nothing outstanding has nothing that could arrive late. The
 * filter can be dropped, because "everything arrived" is a cache that a cancelled
 * susulan can move.
 *
 * `?idPembelian=…` arrives from the invoice's own detail — the way this document
 * is actually reached most of the time, off a chase-up list of short lines. It is
 * read **once** on the way in: it seeds the screen rather than driving it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import {
  barisSumber,
  draftsBaru,
  nilaiTurunan,
  turunanToInput,
  TurunanLineEditor,
  type TurunanDraft,
} from '@/components/pembelian/turunan';
import {
  RamahChip,
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahSummaryCard,
} from '@/components/shell/ramah';
import { formatRupiah, formatTanggal, todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { getPembelian, listPembelian, type PembelianDoc, type PembelianRow } from '@/services/pembelian';
import { createSusulan, susulanBus } from '@/services/penerimaan-susulan';
import { useCanWrite } from '@/services/permissions';

const PICKER_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;

export default function PenerimaanSusulanBaruScreen() {
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
  const params = useLocalSearchParams<{ idPembelian?: string }>();
  const canWrite = useCanWrite('penerimaan-susulan');

  /**
   * Read once, on the way in: the parameter seeds this screen rather than driving
   * it, so changing the invoice does not have to rewrite the URL.
   *
   * `useState` with a lazy initializer rather than a ref, because the value is
   * read during render — to decide whether the source panel starts in its loading
   * state — and reading `.current` during render is what `react-hooks/refs`
   * forbids. A state value initialised once says the same thing, computed on
   * mount and never recomputed, and may be read anywhere.
   */
  const [seeded] = useState(() => Number(params.idPembelian));

  const [sumber, setSumber] = useState<PembelianDoc | null>(null);
  const [sumberLoading, setSumberLoading] = useState(Number.isFinite(seeded));
  const [sumberErr, setSumberErr] = useState('');
  const [drafts, setDrafts] = useState<TurunanDraft[]>([]);

  const [tanggalDok, setTanggalDok] = useState(todayISO());
  const [keterangan, setKeterangan] = useState('');
  const [tanggalErr, setTanggalErr] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Loads one invoice and rebuilds the line list from it. The ceilings live only
   * on `GET /pembelian/{id}`; the list payload has no `detail` at all, by
   * contract, so there is no shortcut that skips this read.
   */
  const muatSumber = useCallback(async (id: number) => {
    try {
      const doc = await getPembelian(id);
      setSumber(doc);
      setDrafts(draftsBaru(barisSumber(doc, 'susulan')));
      setSumberErr('');
    } catch (e) {
      setSumber(null);
      setDrafts([]);
      setSumberErr(messageOf(e, 'Gagal memuat faktur asal.'));
    } finally {
      setSumberLoading(false);
    }
  }, []);

  /**
   * Picking a *different* invoice by hand. This is the half that announces the
   * change — the panel is already showing an invoice, so it has to say it is
   * being replaced before the read starts.
   */
  const pilihSumber = useCallback(
    async (id: number) => {
      setPickerOpen(false);
      setSumberLoading(true);
      setSumberErr('');
      setErr('');
      await muatSumber(id);
    },
    [muatSumber]
  );

  useEffect(() => {
    // The seeded load calls the read directly, not `pilihSumber`. All of that
    // function's opening setStates are no-ops here — `sumberLoading` is
    // initialised from this very condition, and both error strings start empty —
    // so on mount they buy nothing and cost a second render before the request is
    // even sent, which is what `react-hooks/set-state-in-effect` objects to. The
    // distinction is real, not lint appeasement: announcing a change is a
    // different job from making the first read.
    //
    // The disable is a false positive, not a silenced bug: every `setState` in
    // `muatSumber` runs *after* `await getPembelian(id)`, so none of them is
    // synchronous. The rule cannot see through a function boundary — it finds the
    // calls and cannot tell which side of the await they are on. Inlining the body
    // here would satisfy it by duplicating the read the manual picker also needs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isFinite(seeded)) void muatSumber(seeded);
  }, [muatSumber, seeded]);

  const leave = useCallback(() => {
    // `dismiss()` targets this section's own Stack; `back()` is offered to the
    // navigator containing the tabs first. The `replace` covers a cold deep link
    // — which this route gets more than any other, straight off an invoice.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penerimaan-susulan');
  }, [router]);

  async function save() {
    if (saving || !sumber) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalDok)) {
      setTanggalErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
      return;
    }
    setTanggalErr('');
    const detail = turunanToInput(drafts, 'susulan');
    if (!detail.ok) {
      setErr(detail.error);
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const created = await createSusulan({
        id_pembelian: sumber.id,
        tanggal: tanggalDok,
        keterangan: keterangan.trim() || null,
        detail: detail.detail,
      });
      // A new document lands wherever its date puts it in a list sorted by date,
      // so there is no row to patch — the list re-reads while the reader moves on
      // to the document itself.
      susulanBus.publish({ kind: 'reload' });
      router.replace({
        pathname: '/penerimaan-susulan/[id]',
        params: { id: created.id, baru: '1' },
      });
    } catch (e) {
      // 409 here is the source invoice having left POSTED, or a line's remainder
      // having been consumed by another susulan first. The server names which.
      setErr(messageOf(e, 'Gagal menyimpan kiriman susulan.'));
    } finally {
      setSaving(false);
    }
  }

  const nilai = nilaiTurunan(drafts);
  const terisi = drafts.filter((d) => d.qty.trim() !== '').length;

  return (
    <View style={styles.screen}>
      <RamahHeader title="Kiriman susulan baru" onBack={leave} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {/* Three facts about this document that are true before anything is typed,
            and all three surprise somebody the first time. It adds stock without
            adding debt; it saves as a draft rather than posting; and its number
            comes from the server, so there is no field for one. */}
        <RamahNote icon="info">
          Tersimpan sebagai draf — nomornya dibuat server. Dokumen ini menambah stok dan tidak
          menambah utang: fakturnya sudah terbit penuh di kiriman pertama.
        </RamahNote>

        <View style={styles.group}>
          <RamahSectionHeader
            action={sumber ? 'Ganti' : undefined}
            onAction={sumber ? () => setPickerOpen(true) : undefined}>
            Faktur asal
          </RamahSectionHeader>

          {sumber ? (
            <View style={styles.sumberCard}>
              <Text style={styles.sumberNomor}>{sumber.nomor}</Text>
              <Text style={styles.sumberMeta}>
                {`${sumber.namaSupplier} · ${formatTanggal(sumber.tanggal)}`}
              </Text>
              <Text style={styles.sumberNote}>
                {`Masuk ke ruang ${sumber.namaRuang}. Pemasok dan ruang disalin dari faktur ini, bukan dipilih — barang yang perlu pindah ruang setelah diterima adalah pekerjaan mutasi.`}
              </Text>
            </View>
          ) : sumberLoading ? (
            <View style={styles.sumberLoading}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : (
            <View style={styles.sumberEmpty}>
              <Text style={styles.emptyTitle}>Belum ada faktur dipilih</Text>
              <Text style={styles.emptySub}>
                Hanya faktur POSTED yang bisa dipilih — sebelum diposting, barisnya belum punya
                harga pokok untuk disalin dan sisanya belum pasti.
              </Text>
              <View style={styles.emptyAction}>
                <RamahSecondaryButton
                  label="Pilih faktur"
                  icon="search"
                  onPress={() => setPickerOpen(true)}
                  fullWidth
                  height={L.controlH}
                />
              </View>
            </View>
          )}

          {sumberErr ? <RamahInlineError message={sumberErr} /> : null}
        </View>

        {sumber ? (
          <>
            <RamahField
              label="Tanggal dokumen"
              required
              value={tanggalDok}
              onChangeText={(v) => {
                setTanggalDok(v);
                setTanggalErr('');
              }}
              placeholder="YYYY-MM-DD"
              helper="Menentukan bulan penomoran dan periodenya. Periode yang sudah ditutup menolak posting."
              error={tanggalErr}
              autoCapitalize="none"
              maxLength={10}
            />

            <RamahField
              label="Keterangan"
              value={keterangan}
              onChangeText={setKeterangan}
              placeholder="Sisa 5 dus datang menyusul, SJ 00214"
              helper="Opsional. Nomor surat jalan kiriman kedua biasanya yang paling dicari nanti."
              multiline
            />

            <TurunanLineEditor drafts={drafts} onChange={setDrafts} mode="susulan" editable />

            {terisi > 0 ? (
              <RamahSummaryCard
                rows={[
                  { label: 'Baris terisi', value: `${terisi} dari ${drafts.length}` },
                  { label: 'Nilai barang menyusul', value: formatRupiah(nilai) },
                ]}
              />
            ) : null}

            <Text style={styles.saveNote}>
              Nilainya persediaan yang masuk, bukan tagihan. Dihitung dari harga pokok baris
              fakturnya, dan dihitung ulang oleh server saat disimpan.
            </Text>

            {err ? <RamahInlineError message={err} /> : null}
          </>
        ) : null}
      </ScrollView>

      {/* One green pill, and it is absent rather than disabled for a grant that
          cannot write: a permanently dead button is a promise the session cannot
          keep. It is also absent until a faktur is chosen, because there is
          nothing to save against. */}
      {sumber ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          {canWrite ? (
            <RamahPrimaryButton
              label="Simpan draf"
              onPress={save}
              busy={saving}
              disabled={saving}
            />
          ) : (
            <RamahInlineError message="Wewenang yang aktif tidak bisa membuat kiriman susulan." />
          )}
        </View>
      ) : null}

      <FakturSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => void pilihSumber(id)}
      />
    </View>
  );
}

/**
 * The invoice picker.
 *
 * A sheet rather than the old `SearchPicker`'s inline dropdown, because on a
 * phone the list of candidates wants the whole width and a dropdown over a form
 * covers the field it belongs to. `GET /pembelian` searches both its own number
 * and the supplier's faktur number server-side, so the field is debounced rather
 * than filtering a page that is only ten rows deep.
 *
 * The "sudah lengkap" chip is off by default: an invoice whose delivery was
 * complete has no remainder and would open an empty line list. It exists because
 * "everything arrived" is a cache, and cancelling a posted susulan hands the
 * remainder back — so an invoice can become short again after having been
 * complete.
 */
function FakturSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [semua, setSemua] = useState(false);
  const [rows, setRows] = useState<PembelianRow[]>([]);
  const [err, setErr] = useState('');
  const [loadedKey, setLoadedKey] = useState('');

  const requestKey = visible ? `${search}|${semua}` : '';
  const loading = visible && loadedKey !== requestKey;

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      try {
        const page = await listPembelian({
          search: search || undefined,
          size: PICKER_SIZE,
          status: 'POSTED',
          statusPenerimaan: semua ? undefined : 'KURANG',
        });
        if (!alive) return;
        setRows(page.data);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setErr(messageOf(e, 'Gagal mencari faktur.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible, search, semua, requestKey]);

  return (
    <RamahSheet visible={visible} title="Pilih faktur asal" onClose={onClose}>
      <View style={styles.sheetHead}>
        <RamahSearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Cari nomor dokumen atau faktur pemasok"
        />
        <RamahChip
          label="Termasuk yang kirimannya lengkap"
          selected={semua}
          iconLeft={semua ? 'check' : undefined}
          onPress={() => setSemua((v) => !v)}
        />
      </View>

      {loading ? (
        <View style={styles.sheetLoading}>
          <ActivityIndicator color={C.brand} />
        </View>
      ) : err ? (
        <View style={styles.sheetHead}>
          <RamahInlineError message={err} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.sheetHead}>
          <Text style={styles.emptySub}>
            {semua
              ? 'Tidak ada faktur POSTED yang cocok.'
              : 'Tidak ada faktur POSTED yang kirimannya masih kurang.'}
          </Text>
        </View>
      ) : (
        rows.map((p) => (
          <RamahSheetOption
            key={p.id}
            label={p.nomor}
            sub={`${p.namaSupplier} · ${formatTanggal(p.tanggal)}${
              p.noFakturSupplier ? ` · faktur ${p.noFakturSupplier}` : ''
            }`}
            selected={false}
            onPress={() => onPick(p.id)}
          />
        ))
      )}
    </RamahSheet>
  );
}

/**
 * No top, left or right inset here: `app/penerimaan-susulan/_layout.tsx` pays all
 * three for the section. The bottom is the dock's and is read in the component.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space1,
    paddingBottom: L.space6,
    gap: L.space5,
  },

  group: { gap: L.space2 },

  sumberCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  sumberNomor: { ...T.groupTitle, color: C.textTitle },
  sumberMeta: { ...T.caption, color: C.textBody },
  sumberNote: { ...T.micro, ...W.regular, color: C.textMuted, marginTop: L.space2 },

  sumberLoading: { paddingVertical: L.space8, alignItems: 'center' },
  sumberEmpty: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.rowTitle, color: C.textTitle },
  emptySub: { ...T.caption, color: C.textBody },
  emptyAction: { paddingTop: L.space3 },

  saveNote: { ...T.micro, ...W.regular, color: C.textBody },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: 10,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },

  sheetHead: { paddingHorizontal: L.gutter, paddingBottom: L.space3, gap: L.cardGap },
  sheetLoading: { paddingVertical: L.space8, alignItems: 'center' },
});
