/**
 * Ubah produk — screen G4 of `Papan Layar.dc.html`, drawn as
 * `LayarGudang.dc.html` draws it at `screen: 'ubah'`.
 *
 * Name, reorder point, and one selling price per unit; plus the unit that was
 * only discovered later. Reached from the detail's "Ubah produk" pill, from its
 * header pencil, and from the "Ubah" word on its satuan heading — all three of
 * which push this route, and from `/produk/[id]?ubah=1`, which pushes the detail
 * and then this.
 *
 * ## Why this is a route and not a dialog
 *
 * It was a full-screen `Modal` opened from the detail, on the argument that a
 * form decided about the record already on screen is a question rather than a
 * place. The argument is sound and it produced the wrong screen, for a reason
 * the drawing could not show: a `Modal` presents from the **bottom**, and every
 * other push in this section slides in from the right. Two moves that mean the
 * same thing look like two different kinds of thing, and the one that rises
 * from the bottom edge reads as a sheet somebody is about to dismiss — not as a
 * screen with six fields and a save.
 *
 * So `/produk/[id]/ubah` is a real screen of the section's own `Stack`, under
 * `[id]` rather than beside it, because the URL is the honest one: this form is
 * about that product and cannot be opened without it. Three things follow, and
 * all three were being hand-rolled before:
 *
 * - **Back returns to the detail**, because the detail is literally underneath
 *   it on the stack. The Android gesture, the header arrow and a swipe on iOS
 *   all do the same thing, and none of them needs an `onRequestClose`.
 * - **The animation is the section's**, declared once in
 *   `app/produk/_layout.tsx` next to `[id]`'s and `baru`'s.
 * - **The insets are the section's too.** `app/produk/_layout.tsx` pays top,
 *   left and right for everything in here; a `Modal` is its own window and had
 *   to pay them itself. What this screen still owns is the bottom edge, because
 *   it docks a button there.
 *
 * What it costs is one `GET /product/{id}`. The dialog was handed the record the
 * detail had already read; a route cannot be, and should not be — opened cold on
 * this URL it has to be able to draw itself. The answer goes back to the detail
 * over `produkDetailBus` rather than through a callback prop.
 *
 * ## What the board draws that the contract cannot serve
 *
 * - **A trash button on each unit.** There is no `DELETE /product/{id}/satuan`,
 *   and there cannot usefully be one: a `faktor` is what every quantity already
 *   posted to `kartu_stok` was converted by, so removing a unit would retcon
 *   stock that has already moved. Units can be added and their factor corrected,
 *   never withdrawn — so the button is absent rather than drawn and refused.
 * - **A free-text unit name.** `POST /product/{id}/satuan` wants `id_satuan`, a
 *   foreign key into the `satuan` master; an unknown id answers 400. So the
 *   sheet picks from that master instead of accepting a typed word.
 * - **"terkunci karena barang ini sudah punya mutasi".** `kode_barang` and
 *   `id_satuan_dasar` are immutable *always*, not once stock has moved —
 *   `PATCH /product/{id}` accepts neither field at all. The note says so
 *   plainly rather than implying the lock lifts on an untouched product.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSectionHeader,
  RamahSecondaryButton,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah, formatTanggal, todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { rupiahToDecimal } from '@/services/decimal';
import {
  addHarga,
  getProduct,
  listSatuan,
  produkBus,
  produkDetailBus,
  productRowOf,
  updateHarga,
  updateProduct,
  upsertSatuan,
  type ProductDetail,
  type ProductHargaRow,
  type ProductSatuanRow,
} from '@/services/produk';
import type { components } from '@/types/api';

/** Only the rupiah part is ever typed or shown — the contract's cents are always .00 here. */
function digitsOf(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('.')[0].replace(/[^0-9]/g, '');
}

/**
 * The price version in force **today** for one unit.
 *
 * `ProductDetail.harga` is the whole history and leaves the choosing to the
 * client; the rule is the contract's own half-open range — `dari <= today` and
 * `sampai` either null or strictly after today. `product_harga_jual_no_overlap`
 * guarantees at most one candidate, so this is a find and not a sort.
 */
function berlakuHariIni(harga: readonly ProductHargaRow[], idSatuan: number, today: string) {
  return (
    harga.find(
      (h) => h.idSatuan === idSatuan && h.dari <= today && (h.sampai === null || h.sampai > today)
    ) ?? null
  );
}

interface SatuanSheetState {
  /** Which master unit is being added. `null` while the list is still being picked. */
  idSatuan: number | null;
  faktor: string;
  query: string;
  err: string;
}

export default function UbahProdukScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  /**
   * A malformed `:id` is a fact about the *route*, true the moment the params
   * arrive — so the failure page is derived during render rather than written
   * into state from an effect, the same way `[id]/index.tsx` derives its own.
   */
  const idValid = Number.isFinite(id) && id > 0;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loadErr, setLoadErr] = useState('');

  /**
   * The product, read on the way in.
   *
   * The dialog this replaces was handed the record its parent had already read;
   * a route cannot be, and should not be — opened cold on this URL it has to be
   * able to draw itself. `getProduct` is also the only read that answers
   * `satuan` and `harga` (the catalogue's list payload carries neither), so
   * there is no cheaper shape of this request to ask for.
   */
  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getProduct(id)
      .then((detail) => {
        if (alive) setProduct(detail);
      })
      .catch((e) => {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat detail produk.'));
      });
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  const goBack = useCallback(() => {
    // `dismiss()` targets this section's own Stack — `back()` is offered to the
    // navigator containing the tabs first, which may answer by switching
    // sections instead of popping this screen. The `replace` covers a cold deep
    // link onto this URL with nothing underneath it to pop back to.
    if (router.canDismiss()) router.dismiss();
    else router.replace({ pathname: '/produk/[id]', params: { id: String(id) } });
  }, [router, id]);

  /**
   * Announce a write on both channels.
   *
   * Two buses, because there are two subscribers wanting two shapes of the same
   * answer: the detail underneath needs the whole record — satuan and harga are
   * exactly what this screen changes and exactly what `ProductRow` does not
   * carry — while the catalogue under *that* only draws the row columns. The
   * message rides on the detail's change because the sentence belongs to
   * whichever screen ends up on top, and that is never this one.
   *
   * `setProduct` keeps this screen in step too, which matters for the one write
   * that does not leave: adding a unit answers with a product carrying a row the
   * form has to render before anything else is saved.
   */
  const publish = useCallback((detail: ProductDetail, kabar: string) => {
    setProduct(detail);
    produkDetailBus.publish({ kind: 'saved', row: { detail, kabar } });
    produkBus.publish({ kind: 'saved', row: productRowOf(detail) });
  }, []);

  // Reached cold, this screen has to be able to fail on its own: there may be
  // nothing behind it to toast over.
  if (!idValid || loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah produk" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Barang tidak ditemukan</Text>
          <Text style={styles.centerSub}>
            {idValid ? loadErr : 'Alamat produk tidak dikenali.'}
          </Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah produk" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return <UbahProdukForm product={product} onSaved={publish} onDone={goBack} />;
}

/**
 * The form itself, mounted only once the record is in hand.
 *
 * Splitting it off is what lets every field seed from a `useState` initialiser
 * instead of being adjusted during render. The old dialog stayed mounted under
 * the detail for the life of that screen and had to work out, on every render,
 * whether it was being *re*-opened and re-seed itself; this is mounted when the
 * product arrives and unmounted when the screen leaves, so "seed once" is what
 * `useState` already means.
 *
 * It deliberately does **not** re-seed when `product` changes. Adding a unit
 * below saves immediately and replaces the record; re-seeding on that would wipe
 * every price still being typed. The new unit renders with an empty price field,
 * which is what a unit that has never had a price should show.
 */
function UbahProdukForm({
  product,
  onSaved,
  onDone,
}: {
  product: ProductDetail;
  /** Handed the whole product every write answered with, plus what to say about it. */
  onSaved: (detail: ProductDetail, kabar: string) => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  /**
   * The docked control's bottom padding, keyboard included.
   *
   * Under edge-to-edge the Android window is not resized when the IME opens, so
   * a button sitting on the bottom edge is simply covered by it. `useDockPadding`
   * swaps the safe-area inset for the keyboard's height while it is up — the two
   * are alternatives, never a sum, because the gesture bar that inset pays for
   * is itself behind the keyboard.
   *
   * This is the **only** edge this screen pays. Top, left and right belong to
   * `app/produk/_layout.tsx`, which boxes every screen in the section; the old
   * dialog had to pay all four because a `Modal` is its own window and sits
   * outside that box.
   */
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const today = todayISO();

  const [nama, setNama] = useState(product.nama);
  const [stokMin, setStokMin] = useState(String(product.stokMin));
  /** idSatuan → rupiah digits, seeded from whatever is in force today. */
  const [harga, setHarga] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      product.satuan.map((s) => [
        s.idSatuan,
        digitsOf(berlakuHariIni(product.harga, s.idSatuan, today)?.harga),
      ])
    )
  );
  const [namaErr, setNamaErr] = useState('');
  const [minErr, setMinErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [satuanMaster, setSatuanMaster] = useState<components['schemas']['Satuan'][]>([]);
  const [sheet, setSheet] = useState<SatuanSheetState | null>(null);

  // The master list is small and cached by the server, and only the add-unit
  // sheet ever needs it — a failure degrades that sheet and nothing else, so it
  // is reported there rather than on the form.
  useEffect(() => {
    if (satuanMaster.length > 0) return;
    let alive = true;
    listSatuan()
      .then((list) => {
        if (alive) setSatuanMaster(list);
      })
      .catch(() => {
        // Reported where it bites, inside the sheet.
      });
    return () => {
      alive = false;
    };
  }, [satuanMaster.length]);

  const konversiOf = useCallback(
    (s: ProductSatuanRow) =>
      s.faktor === 1
        ? 'Satuan dasar · yang dicatat kartu stok'
        : `1 ${s.nama} = ${formatNumber(s.faktor)} ${product.namaSatuanDasar}`,
    [product.namaSatuanDasar]
  );

  /** Units not yet registered on this product — the only ones worth offering. */
  const addable = useMemo(() => {
    const taken = new Set(product.satuan.map((s) => s.idSatuan));
    const q = sheet?.query.trim().toLowerCase() ?? '';
    return satuanMaster
      .filter((m) => m.id !== undefined && !taken.has(m.id))
      .filter((m) => !q || (m.nama ?? '').toLowerCase().includes(q));
  }, [satuanMaster, product.satuan, sheet?.query]);

  const pickedSatuan = satuanMaster.find((m) => m.id === sheet?.idSatuan) ?? null;

  /**
   * Which unit the derived rows compare themselves against.
   *
   * `product.idDasar` is the master satuan id and is what `product_satuan`'s
   * `faktor = 1` row carries, so the two agree — but the fallback is kept for
   * the same reason `PosProductRow.dasar` keeps one: a product with no base row
   * at all should draw a helper with no comparison in it, not crash the form.
   */
  const dasarSatuanId =
    product.satuan.find((s) => s.faktor === 1)?.idSatuan ?? product.idDasar;

  async function addSatuan() {
    if (!sheet || sheet.idSatuan === null || saving) return;
    const faktor = parseInt(sheet.faktor || '0', 10);
    // More than 1, not at least 1: a derived unit with factor 1 is the base unit
    // under a second name, and the contract reserves factor 1 for the base.
    if (!Number.isFinite(faktor) || faktor <= 1) {
      setSheet({ ...sheet, err: 'Isi lebih dari 1 — satuan dasar sudah memakai faktor 1.' });
      return;
    }
    setSaving(true);
    try {
      const detail = await upsertSatuan(product.id, {
        id_satuan: sheet.idSatuan,
        faktor,
        // The default-input marker is not touched here. It decides which unit a
        // purchase line opens on, which is a question about how stock is typed
        // in, not about what this product can be measured in.
        is_default_input: false,
      });
      setSheet(null);
      onSaved(detail, `Satuan ${pickedSatuan?.nama ?? ''} ditambahkan`);
    } catch (e) {
      setSheet({ ...sheet, err: messageOf(e, 'Gagal menambah satuan.') });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Save, in the order the writes depend on each other: the product first, then
   * one price per unit that changed.
   *
   * **Which price call, and why it is a choice.** `POST harga-jual` opens a new
   * version and closes the open one at the same date, so yesterday's sales keep
   * yesterday's price — that is what a price *change* is. `PATCH` corrects the
   * amount on an existing version in place, and answers 409 the moment a nota
   * references it. So a unit whose version already starts today is corrected
   * (it is today's typo, and opening a second version starting today would ask
   * the exclusion constraint for a zero-length range), and everything else opens
   * a new version from today.
   *
   * Nothing is rolled back on a partial failure, because nothing can be: these
   * are separate transactions server-side. What the screen does instead is stop
   * at the first failure, keep whatever the successful calls answered, and say
   * which step stopped — a silent "gagal menyimpan" over a product whose name
   * *did* change is the worst of the available outcomes.
   */
  async function save() {
    if (saving) return;
    const namaTrim = nama.trim();
    if (namaTrim.length < 3) {
      setNamaErr('Tulis minimal tiga huruf.');
      return;
    }
    const min = parseInt(stokMin || '0', 10);
    if (!Number.isFinite(min) || min < 0) {
      setMinErr('Isi bilangan bulat 0 atau lebih.');
      return;
    }

    setNamaErr('');
    setMinErr('');
    setSaveErr('');
    setSaving(true);

    let latest = product;
    try {
      if (namaTrim !== product.nama || min !== product.stokMin) {
        latest = await updateProduct(product.id, { nama: namaTrim, stok_minimum: min });
      }

      let hargaChanged = 0;
      for (const s of product.satuan) {
        const typed = digitsOf(harga[s.idSatuan] ?? '');
        const current = berlakuHariIni(product.harga, s.idSatuan, today);
        if (typed === digitsOf(current?.harga)) continue;
        // Blank is "leave it alone", not "make it free". Withdrawing a price is
        // `DELETE harga-jual/{id}`, which is SUPERADMIN's and is not this form.
        if (typed === '') continue;
        const amount = rupiahToDecimal(typed);
        latest =
          current && current.dari === today
            ? await updateHarga(product.id, current.id, amount)
            : await addHarga(product.id, { id_satuan: s.idSatuan, harga: amount, berlaku_dari: today });
        hargaChanged += 1;
      }

      onSaved(
        latest,
        hargaChanged > 0
          ? `Perubahan tersimpan · ${hargaChanged} harga berlaku ${formatTanggal(today)}`
          : 'Perubahan tersimpan'
      );
      onDone();
    } catch (e) {
      // 409 covers an overlapping period and a version a nota already
      // references; both are the server's to explain, so its message is shown.
      setSaveErr(messageOf(e, 'Gagal menyimpan perubahan.'));
      // Whatever did land is still published, so the detail underneath is never
      // left showing a value the server has already moved past.
      if (latest !== product) onSaved(latest, '');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ubah produk" onBack={onDone} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <RamahField
          label="Nama barang"
          required
          value={nama}
          onChangeText={(v) => {
            setNama(v);
            setNamaErr('');
          }}
          placeholder="Map plastik kancing A4"
          error={namaErr}
          autoCapitalize="words"
        />

        <RamahField
          label="Stok minimum"
          required
          value={stokMin}
          onChangeText={(v) => {
            setStokMin(v.replace(/[^0-9]/g, ''));
            setMinErr('');
          }}
          keyboardType="number-pad"
          placeholder="0"
          error={minErr}
          helper={`Dalam ${product.namaSatuanDasar || 'satuan dasar'}.`}
        />

        <View style={styles.group}>
          <RamahSectionHeader
            action="Tambah satuan"
            onAction={() => setSheet({ idSatuan: null, faktor: '', query: '', err: '' })}>
            Satuan &amp; harga jual
          </RamahSectionHeader>
          {product.satuan.map((s) => (
            <View key={s.id} style={styles.satuanCard}>
              <View style={styles.satuanHead}>
                <Text style={styles.satuanNama}>{s.nama}</Text>
                <Text style={styles.satuanKonversi} numberOfLines={2}>
                  {konversiOf(s)}
                </Text>
              </View>
              <RamahField
                label="Harga jual"
                value={harga[s.idSatuan] ?? ''}
                onChangeText={(v) =>
                  setHarga((h) => ({ ...h, [s.idSatuan]: v.replace(/[^0-9]/g, '') }))
                }
                keyboardType="number-pad"
                prefix="Rp"
                placeholder="0"
                helper={hargaHelper(
                  product.harga,
                  s,
                  today,
                  product.namaSatuanDasar,
                  digitsOf(harga[dasarSatuanId] ?? '')
                )}
              />
            </View>
          ))}
        </View>

        <RamahNote>Kode barang dan satuan dasar tidak bisa diubah.</RamahNote>

        {saveErr ? <RamahInlineError message={saveErr} /> : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton
          label="Simpan perubahan"
          onPress={save}
          busy={saving}
          disabled={saving}
        />
      </View>

      <RamahSheet
        visible={sheet !== null}
        title={pickedSatuan ? `Tambah ${pickedSatuan.nama}` : 'Tambah satuan'}
        onClose={() => setSheet(null)}>
        {sheet === null ? null : pickedSatuan === null ? (
          <View style={styles.sheetIntro}>
            <Text style={styles.sheetLead}>
              Satuan turunan selalu kelipatan satuan dasar. Faktornya yang dipakai kartu stok saat
              barang masuk atau keluar.
            </Text>
            <RamahSearchField
              value={sheet.query}
              onChangeText={(v) => setSheet({ ...sheet, query: v })}
              placeholder="Cari satuan"
            />
            {/* The master, minus what this product already has: offering a unit
                that is already registered would turn "tambah" into a silent
                factor overwrite, which the endpoint does allow and nobody asked
                for here. */}
            {addable.length === 0 ? (
              <Text style={styles.sheetEmpty}>
                {satuanMaster.length === 0
                  ? 'Daftar satuan tidak terbaca. Tutup, lalu coba lagi.'
                  : 'Semua satuan yang cocok sudah terdaftar di barang ini.'}
              </Text>
            ) : (
              addable.map((m) => (
                <RamahSheetOption
                  key={m.id}
                  label={m.nama ?? ''}
                  selected={false}
                  onPress={() => setSheet({ ...sheet, idSatuan: m.id ?? null, err: '' })}
                />
              ))
            )}
          </View>
        ) : (
          <View style={styles.sheetForm}>
            <RamahField
              label={`Isi per ${pickedSatuan.nama}`}
              required
              value={sheet.faktor}
              onChangeText={(v) => setSheet({ ...sheet, faktor: v.replace(/[^0-9]/g, ''), err: '' })}
              keyboardType="number-pad"
              placeholder="40"
              error={sheet.err}
              autoFocus
            />
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Konversi</Text>
              <Text style={styles.previewValue}>
                {sheet.faktor && parseInt(sheet.faktor, 10) > 1
                  ? `1 ${pickedSatuan.nama} = ${formatNumber(parseInt(sheet.faktor, 10))} ${product.namaSatuanDasar}`
                  : '—'}
              </Text>
            </View>
            <RamahPrimaryButton
              label="Tambah satuan"
              onPress={addSatuan}
              busy={saving}
              disabled={saving || !sheet.faktor}
            />
          </View>
        )}
      </RamahSheet>
    </View>
  );
}

/**
 * What to say under a price field, and it is three different sentences.
 *
 * A unit with a version in force gets its start date, because "Rp 15.000" with
 * no date on it cannot be told from a price that stopped applying in March. A
 * unit with none gets told what that means — sellable, with the amount typed at
 * the till. And a derived unit additionally gets the base price multiplied out,
 * which the board asks for explicitly as a *comparison* and not as a default:
 * the contract allows a dus to cost less than forty times a pcs, and most do.
 */
function hargaHelper(
  history: readonly ProductHargaRow[],
  s: ProductSatuanRow,
  today: string,
  namaDasar: string,
  /** What is currently *typed* into the base unit's field, in rupiah digits. */
  dasarDigits: string
): string {
  const current = berlakuHariIni(history, s.idSatuan, today);
  const parts: string[] = [
    current
      ? `Berlaku sejak ${formatTanggal(current.dari)}.`
      : 'Belum ada harga — barang tetap bisa dijual dengan harga yang diketik di kasir.',
  ];
  // The base unit's *typed* value rather than its stored one, so somebody
  // changing both in one pass sees the comparison move with what they enter.
  if (s.faktor > 1 && dasarDigits !== '') {
    const setara = s.faktor * parseInt(dasarDigits, 10);
    parts.push(
      `${formatNumber(s.faktor)} × harga ${namaDasar || 'satuan dasar'} = ${formatRupiah(setara)}, sebagai pembanding.`
    );
  }
  return parts.join(' ');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  // The same failure and loading pages the detail draws, and deliberately the
  // same words: reached cold on this URL, "Barang tidak ditemukan" is the same
  // fact whichever of the two screens the link pointed at.
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space6, gap: L.space5 },

  group: { gap: L.stack },
  satuanCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    paddingVertical: L.cardPadDense,
    paddingHorizontal: L.cardPad,
    gap: L.space3,
  },
  satuanHead: { gap: L.inline },
  satuanNama: { ...T.titleTiny, color: C.textTitle },
  satuanKonversi: { ...T.bodySmall, color: C.textBody },

  sheetIntro: { paddingHorizontal: L.gutter, gap: L.stack, paddingBottom: L.space2 },
  sheetLead: { ...T.bodySmall, color: C.textBody },
  sheetEmpty: { ...T.bodySmall, color: C.textMuted, paddingVertical: L.space4 },
  sheetForm: { paddingHorizontal: L.gutter, gap: L.space5, paddingBottom: L.space2 },

  preview: { backgroundColor: C.grey50, borderRadius: R.card, padding: L.cardPad, gap: L.inline },
  previewLabel: { ...T.bodySmall, color: C.textBody },
  previewValue: { ...T.titleTiny, color: C.textTitle },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
