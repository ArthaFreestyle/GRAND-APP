/**
 * The pembelian header — the document minus its lines.
 *
 * Creating one is a route (`pembelian/baru`) and correcting one is a dialog on
 * the detail, so the fields belong to neither and live here. The two modes
 * differ by exactly three fields: `id_supplier` and `id_ruang` are choosable
 * only while creating, and `tanggal` is in both.
 *
 * **Those two are missing from `PATCH /pembelian/{id}` on purpose.** The
 * supplier decides whose debt the document is, and the ruang decides which
 * stock balance every line touches. Getting one wrong is a cancel-and-retype,
 * not an edit — so the dialog does not offer them, and the create form marks
 * them as the decisions they are.
 *
 * Freight sits in its own section because it is a different bill. `biaya_angkut`
 * is `total_koli x tarif_per_koli` and is **not** part of `total`: the carrier
 * charges it, not the supplier, and it reaches the books through each line's
 * `alokasi_biaya` at posting. Adding the two together anywhere overstates what
 * is owed.
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SearchPicker, type PickerOption } from '@/components/shell/search-picker';
import {
  CheckBox,
  ErrorBanner,
  Field,
  ModalFooter,
  ModalHead,
  ModalShell,
  OptionPicker,
  TextField,
} from '@/components/shell/ui';
import { Colors as C, todayISO } from '@/constants/theme-erp';
import { numericToDecimal, rupiahToDecimal, rupiahToDecimalSigned } from '@/services/decimal';
import { listEkspedisi } from '@/services/ekspedisi';
import type {
  CreatePembelianBody,
  JenisPembayaran,
  MetodeAlokasiAngkut,
  PembelianDoc,
  PembelianHeaderBody,
  PembelianLineInput,
} from '@/services/pembelian';
import { listRuang } from '@/services/ruang';
import { listSupplier } from '@/services/supplier';

const PICKER_SIZE = 8;

export interface PembelianHeaderValues {
  idSupplier: number | null;
  namaSupplier: string;
  idRuang: number | null;
  namaRuang: string;
  tanggal: string;
  noFaktur: string;
  tanggalFaktur: string;
  jenis: JenisPembayaran;
  diskonNota: string;
  ppn: string;
  ppnDikreditkan: boolean;
  pembulatan: string;
  idEkspedisi: number | null;
  namaEkspedisi: string;
  noResi: string;
  totalKoli: string;
  tarifPerKoli: string;
  ditanggungSupplier: boolean;
  metode: MetodeAlokasiAngkut;
}

export const EMPTY_HEADER: PembelianHeaderValues = {
  idSupplier: null,
  namaSupplier: '',
  idRuang: null,
  namaRuang: '',
  tanggal: todayISO(),
  noFaktur: '',
  tanggalFaktur: '',
  jenis: 'TUNAI',
  diskonNota: '',
  ppn: '',
  ppnDikreditkan: false,
  pembulatan: '',
  idEkspedisi: null,
  namaEkspedisi: '',
  noResi: '',
  totalKoli: '',
  tarifPerKoli: '',
  ditanggungSupplier: false,
  metode: 'KOLI',
};

/**
 * Fills the dialog from a document already on screen.
 *
 * `namaEkspedisi` comes in from outside because the document does not carry it:
 * `Pembelian` has `id_ekspedisi` and no name, so the detail resolves it once and
 * hands it over rather than the dialog opening with a blank carrier field.
 */
export function headerOf(doc: PembelianDoc, namaEkspedisi = ''): PembelianHeaderValues {
  const money = (v: string) => (Number(v) ? String(Math.round(Number(v))) : '');
  const qty = (v: string) => (Number(v) ? String(Number(v)) : '');
  return {
    idSupplier: doc.idSupplier,
    namaSupplier: doc.namaSupplier,
    idRuang: doc.idRuang,
    namaRuang: doc.namaRuang,
    // `tanggal` is a date-time on the way back and a date on the way in.
    tanggal: doc.tanggal.slice(0, 10),
    noFaktur: doc.noFakturSupplier,
    tanggalFaktur: doc.tanggalFaktur ?? '',
    jenis: doc.jenis,
    diskonNota: money(doc.diskonNota),
    ppn: money(doc.ppn),
    ppnDikreditkan: doc.ppnDikreditkan,
    pembulatan: Number(doc.pembulatan) ? String(Math.round(Number(doc.pembulatan))) : '',
    idEkspedisi: doc.idEkspedisi,
    namaEkspedisi,
    noResi: doc.noResi,
    totalKoli: qty(doc.totalKoli),
    tarifPerKoli: money(doc.tarifPerKoli),
    ditanggungSupplier: doc.ditanggungSupplier,
    metode: doc.metodeAlokasi,
  };
}

/** Freight only needs splitting when there is freight to split. */
export function pakaiKoli(v: PembelianHeaderValues): boolean {
  return !v.ditanggungSupplier && Number(numericToDecimal(v.totalKoli) ?? '0') > 0;
}

export type HeaderResult<T> = { ok: true; body: T } | { ok: false; error: string };

function ymd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The fields common to POST and PATCH. `null` clears a nullable column and
 * `undefined` would leave it alone, so an emptied field is sent as `null` — a
 * removed carrier or resi has to actually come off the document.
 */
function commonBody(v: PembelianHeaderValues): PembelianHeaderBody {
  return {
    tanggal: v.tanggal,
    no_faktur_supplier: v.noFaktur.trim() || null,
    tanggal_faktur: v.tanggalFaktur.trim() || null,
    diskon_nota: rupiahToDecimal(v.diskonNota || '0'),
    ppn: rupiahToDecimal(v.ppn || '0'),
    ppn_dikreditkan: v.ppnDikreditkan,
    pembulatan: rupiahToDecimalSigned(v.pembulatan || '0'),
    id_ekspedisi: v.idEkspedisi,
    no_resi: v.noResi.trim() || null,
    total_koli: numericToDecimal(v.totalKoli) ?? null,
    tarif_per_koli: numericToDecimal(v.tarifPerKoli) ?? null,
    ditanggung_supplier: v.ditanggungSupplier,
    metode_alokasi_angkut: v.metode,
    jenis_pembayaran: v.jenis,
  };
}

function validate(v: PembelianHeaderValues): string | null {
  if (!ymd(v.tanggal)) return 'Tanggal dokumen harus dalam format YYYY-MM-DD.';
  if (v.tanggalFaktur.trim() !== '' && !ymd(v.tanggalFaktur)) {
    return 'Tanggal faktur harus dalam format YYYY-MM-DD.';
  }
  if (v.totalKoli.trim() !== '' && numericToDecimal(v.totalKoli) === null) {
    return 'Total koli bukan angka.';
  }
  if (v.tarifPerKoli.trim() !== '' && numericToDecimal(v.tarifPerKoli) === null) {
    return 'Tarif per koli bukan angka.';
  }
  return null;
}

export function headerBody(v: PembelianHeaderValues): HeaderResult<PembelianHeaderBody> {
  const error = validate(v);
  return error ? { ok: false, error } : { ok: true, body: commonBody(v) };
}

export function createBody(
  v: PembelianHeaderValues,
  detail: PembelianLineInput[]
): HeaderResult<CreatePembelianBody> {
  const error = validate(v);
  if (error) return { ok: false, error };
  if (v.idSupplier === null) return { ok: false, error: 'Pilih supplier dulu.' };
  if (v.idRuang === null) return { ok: false, error: 'Pilih ruang tujuan dulu.' };
  return {
    ok: true,
    body: {
      ...commonBody(v),
      tanggal: v.tanggal,
      id_supplier: v.idSupplier,
      id_ruang: v.idRuang,
      detail,
    },
  };
}

// ---- the fields ----

export interface HeaderFieldsProps {
  /** Creating: supplier and ruang are choosable, and required. */
  isNew: boolean;
  values: PembelianHeaderValues;
  /** Patch, not a callback per field: the header has eighteen and one owner. */
  onChange: (patch: Partial<PembelianHeaderValues>) => void;
  error: string;
}

export function PembelianHeaderFields({ isNew, values, onChange, error }: HeaderFieldsProps) {
  const cariSupplier = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listSupplier({ search: term || undefined, size: PICKER_SIZE, is_aktif: true });
    return page.data.map((s) => ({
      value: String(s.id),
      label: s.nama,
      sub: s.kode || 'tanpa kode',
    }));
  }, []);

  const cariRuang = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listRuang({ search: term || undefined, size: PICKER_SIZE, is_aktif: true });
    return page.data.map((r) => ({
      value: String(r.id),
      label: r.nama,
      // A frozen room accepts the document but will refuse the posting, from
      // this module or any other, until the stock take that froze it closes.
      sub: r.nomorOpnameBeku
        ? `dibekukan opname ${r.nomorOpnameBeku} — tidak bisa diposting`
        : [r.kode || 'tanpa kode', r.namaUnitKerja].filter(Boolean).join(' · '),
      disabled: r.nomorOpnameBeku !== null,
    }));
  }, []);

  const cariEkspedisi = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listEkspedisi({
      search: term || undefined,
      size: PICKER_SIZE,
      is_aktif: true,
    });
    return page.data.map((e) => ({ value: String(e.id), label: e.nama, sub: e.telepon || '—' }));
  }, []);

  return (
    <View style={styles.fields}>
      {isNew && (
        <>
          <Field
            label="Supplier"
            hint="Menentukan utang ini milik siapa — tidak bisa diubah setelah dokumen dibuat.">
            <SearchPicker
              chosen={values.idSupplier === null ? null : values.namaSupplier}
              onPick={(o) =>
                onChange({ idSupplier: Number(o.value), namaSupplier: o.label })
              }
              search={cariSupplier}
              placeholder="Cari nama atau kode supplier"
              emptyHint="Tidak ada supplier aktif yang cocok."
            />
          </Field>
          <Field
            label="Ruang tujuan"
            hint="Seluruh baris masuk ke satu ruang. Juga tidak bisa diubah setelahnya.">
            <SearchPicker
              chosen={values.idRuang === null ? null : values.namaRuang}
              onPick={(o) => onChange({ idRuang: Number(o.value), namaRuang: o.label })}
              search={cariRuang}
              placeholder="Cari nama atau kode ruang"
              emptyHint="Tidak ada ruang aktif di unit kerja sesi ini."
            />
          </Field>
        </>
      )}

      <View style={styles.row}>
        <View style={styles.cell}>
          <Field label="Tanggal dokumen" hint="Menentukan bulan penomoran dan periodenya.">
            <TextField
              value={values.tanggal}
              onChangeText={(v) => onChange({ tanggal: v })}
              placeholder="YYYY-MM-DD"
              mono
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Tanggal faktur supplier">
            <TextField
              value={values.tanggalFaktur}
              onChangeText={(v) => onChange({ tanggalFaktur: v })}
              placeholder="YYYY-MM-DD"
              mono
            />
          </Field>
        </View>
      </View>

      <Field
        label="No. faktur supplier"
        hint="Unik per supplier. Tanpa purchase order ini satu-satunya penjaga agar satu nota tidak diinput dua kali.">
        <TextField
          value={values.noFaktur}
          onChangeText={(v) => onChange({ noFaktur: v })}
          placeholder="INV/2026/VIII/1180"
          mono
        />
      </Field>

      <Field label="Jenis pembayaran">
        <OptionPicker
          options={[
            { value: 'TUNAI', label: 'Tunai' },
            { value: 'KREDIT', label: 'Kredit' },
          ]}
          value={values.jenis}
          onChange={(v) => onChange({ jenis: v as JenisPembayaran })}
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.cell}>
          <Field label="Diskon nota" hint="Tidak boleh melebihi subtotal.">
            <TextField
              value={values.diskonNota}
              onChangeText={(v) => onChange({ diskonNota: v })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="PPN">
            <TextField
              value={values.ppn}
              onChangeText={(v) => onChange({ ppn: v })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Pembulatan" hint="Boleh negatif.">
            <TextField
              value={values.pembulatan}
              onChangeText={(v) => onChange({ pembulatan: v })}
              placeholder="0"
            />
          </Field>
        </View>
      </View>

      <CheckBox
        checked={values.ppnDikreditkan}
        onPress={() => onChange({ ppnDikreditkan: !values.ppnDikreditkan })}
        label="PPN dikreditkan — jadi pajak masukan, tidak menyentuh harga pokok"
      />

      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Ongkos angkut</Text>
      <Text style={styles.sectionNote}>
        Tagihan ekspedisi, bukan utang ke supplier — biaya angkut tidak pernah masuk total faktur.
        Ia masuk ke harga pokok lewat alokasi per baris saat posting.
      </Text>

      <Field label="Ekspedisi">
        <SearchPicker
          chosen={values.idEkspedisi === null ? null : values.namaEkspedisi}
          onPick={(o) => onChange({ idEkspedisi: Number(o.value), namaEkspedisi: o.label })}
          search={cariEkspedisi}
          placeholder="Cari nama atau telepon ekspedisi"
          emptyHint="Tidak ada ekspedisi aktif yang cocok."
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.cell}>
          <Field label="No. resi">
            <TextField
              value={values.noResi}
              onChangeText={(v) => onChange({ noResi: v })}
              placeholder="JNE-00281911"
              mono
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Total koli">
            <TextField
              value={values.totalKoli}
              onChangeText={(v) => onChange({ totalKoli: v })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Tarif per koli">
            <TextField
              value={values.tarifPerKoli}
              onChangeText={(v) => onChange({ tarifPerKoli: v })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
        </View>
      </View>

      <Field label="Metode alokasi" hint="KOLI jatuh ke QTY sendiri kalau seluruh koli baris nol.">
        <OptionPicker
          options={[
            { value: 'KOLI', label: 'Per koli' },
            { value: 'QTY', label: 'Per qty dasar' },
          ]}
          value={values.metode}
          onChange={(v) => onChange({ metode: v as MetodeAlokasiAngkut })}
        />
      </Field>

      <CheckBox
        checked={values.ditanggungSupplier}
        onPress={() => onChange({ ditanggungSupplier: !values.ditanggungSupplier })}
        label="Ongkir ditanggung supplier — sudah termasuk nota, tidak dialokasikan lagi"
      />

      <ErrorBanner message={error} />
    </View>
  );
}

export interface PembelianFormModalProps extends Omit<HeaderFieldsProps, 'isNew'> {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** Editing only — creating is `app/(admin)/pembelian/baru.tsx`. */
export function PembelianFormModal(p: PembelianFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={620} onRequestClose={p.onCancel}>
      <ModalHead
        title="Ubah header faktur"
        sub="Hanya selama DRAFT. Supplier dan ruang tidak ada di sini — keduanya menentukan utang dan saldo stok mana yang tersentuh, jadi keliru di situ berarti batalkan dan input ulang."
      />
      {/* The header is eighteen fields; a dialog that cannot scroll would put
          half of them past the bottom of a phone. */}
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <PembelianHeaderFields
          isNew={false}
          values={p.values}
          onChange={p.onChange}
          error={p.error}
        />
      </ScrollView>
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan header" />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  fields: { padding: 20, gap: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 150 },
  divider: { height: 1, backgroundColor: C.borderLight, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  sectionNote: { fontSize: 12.5, color: C.muted3, lineHeight: 17, marginTop: -8 },
});
