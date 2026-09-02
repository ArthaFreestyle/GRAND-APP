/**
 * The penjualan header — the nota minus its lines.
 *
 * Creating one is a route (`penjualan/baru`) and correcting one is a dialog on
 * the detail, so the fields belong to neither and live here.
 *
 * **Unlike pembelian, the two identity-ish fields are editable.** `PATCH
 * /penjualan/{id}` accepts `id_ruang`, `id_pelanggan`, and `jenis_pembayaran`
 * alike, and the contract spells out why: no detail line points at any of them,
 * so changing one leaves nothing behind pointing at the wrong thing. A purchase
 * invoice cannot say that — its supplier decides whose debt it is — which is the
 * whole reason the two forms differ. So the dialog offers everything the create
 * form does; the only difference is that creating insists on a ruang.
 *
 * The one rule worth checking before the server does is **KREDIT needs a
 * customer**. It is a check constraint (`penjualan_kredit_pelanggan_check`), not
 * a usecase rule: a walk-in cannot owe money to a name nobody wrote down. On a
 * patch it is re-checked against the effective values, so switching to KREDIT
 * while the stored customer is still empty is refused even though the request
 * never mentioned the customer — which is exactly what this form checks too.
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SearchPicker, type PickerOption } from '@/components/shell/search-picker';
import {
  ErrorBanner,
  Field,
  GhostButton,
  ModalFooter,
  ModalHead,
  ModalShell,
  OptionPicker,
  TextField,
} from '@/components/shell/ui';
import { Colors as C, todayISO } from '@/constants/theme-erp';
import { rupiahToDecimal, rupiahToDecimalSigned } from '@/services/decimal';
import { listPelanggan } from '@/services/pelanggan';
import type {
  CreatePenjualanBody,
  JenisPembayaran,
  PenjualanDoc,
  PenjualanHeaderBody,
  PenjualanLineInput,
} from '@/services/penjualan';
import { listRuang } from '@/services/ruang';

const PICKER_SIZE = 8;

export interface PenjualanHeaderValues {
  tanggal: string;
  idRuang: number | null;
  namaRuang: string;
  /** `null` is a real value here — a cash note at the counter has no customer. */
  idPelanggan: number | null;
  namaPelanggan: string;
  jenis: JenisPembayaran;
  diskonNota: string;
  pembulatan: string;
}

export const EMPTY_HEADER: PenjualanHeaderValues = {
  tanggal: todayISO(),
  idRuang: null,
  namaRuang: '',
  idPelanggan: null,
  namaPelanggan: '',
  jenis: 'TUNAI',
  diskonNota: '',
  pembulatan: '',
};

/** Fills the dialog from a nota already on screen. */
export function headerOf(doc: PenjualanDoc): PenjualanHeaderValues {
  const money = (v: string) => (Number(v) ? String(Math.round(Number(v))) : '');
  return {
    // `tanggal` is a date-time on the way back and a date on the way in.
    tanggal: doc.tanggal.slice(0, 10),
    idRuang: doc.idRuang,
    namaRuang: doc.namaRuang,
    idPelanggan: doc.idPelanggan,
    namaPelanggan: doc.namaPelanggan,
    jenis: doc.jenis,
    diskonNota: money(doc.diskonNota),
    pembulatan: Number(doc.pembulatan) ? String(Math.round(Number(doc.pembulatan))) : '',
  };
}

export type HeaderResult<T> = { ok: true; body: T } | { ok: false; error: string };

function ymd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validate(v: PenjualanHeaderValues): string | null {
  if (!ymd(v.tanggal)) return 'Tanggal nota harus dalam format YYYY-MM-DD.';
  if (v.jenis === 'KREDIT' && v.idPelanggan === null) {
    return 'Nota kredit wajib menyebut pelanggan — piutang harus punya pemilik.';
  }
  return null;
}

/**
 * The fields both requests share. `pembulatan` goes through the signed
 * converter: it is the nota's rounding line and rounding down is as ordinary as
 * rounding up, which is not true of any other amount on this form.
 */
function commonBody(v: PenjualanHeaderValues): PenjualanHeaderBody {
  return {
    tanggal: v.tanggal,
    // `null` clears the column while `undefined` would leave it alone, and
    // clearing is a real edit here: a note retyped as TUNAI drops its customer.
    id_pelanggan: v.idPelanggan,
    jenis_pembayaran: v.jenis,
    diskon_nota: rupiahToDecimal(v.diskonNota || '0'),
    pembulatan: rupiahToDecimalSigned(v.pembulatan || '0'),
  };
}

export function headerBody(v: PenjualanHeaderValues): HeaderResult<PenjualanHeaderBody> {
  const error = validate(v);
  if (error) return { ok: false, error };
  const body = commonBody(v);
  // A patch may move the nota to another ruang, but it may never blank it — the
  // column is not nullable, and every line draws its balance from it.
  return { ok: true, body: v.idRuang === null ? body : { ...body, id_ruang: v.idRuang } };
}

export function createBody(
  v: PenjualanHeaderValues,
  detail: PenjualanLineInput[]
): HeaderResult<CreatePenjualanBody> {
  const error = validate(v);
  if (error) return { ok: false, error };
  if (v.idRuang === null) return { ok: false, error: 'Pilih ruang asal barang dulu.' };
  return {
    ok: true,
    body: { ...commonBody(v), tanggal: v.tanggal, id_ruang: v.idRuang, detail },
  };
}

// ---- the fields ----

export interface HeaderFieldsProps {
  values: PenjualanHeaderValues;
  /** Patch, not a callback per field: the header has seven and one owner. */
  onChange: (patch: Partial<PenjualanHeaderValues>) => void;
  error: string;
}

export function PenjualanHeaderFields({ values, onChange, error }: HeaderFieldsProps) {
  const cariRuang = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listRuang({ search: term || undefined, size: PICKER_SIZE, is_aktif: true });
    return page.data.map((r) => ({
      value: String(r.id),
      label: r.nama,
      // A frozen room accepts the nota and refuses the posting, from this module
      // or any other, until the stock take that froze it closes.
      sub: r.nomorOpnameBeku
        ? `dibekukan opname ${r.nomorOpnameBeku} — tidak bisa diposting`
        : [r.kode || 'tanpa kode', r.namaUnitKerja].filter(Boolean).join(' · '),
      disabled: r.nomorOpnameBeku !== null,
    }));
  }, []);

  const cariPelanggan = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listPelanggan({
      search: term || undefined,
      size: PICKER_SIZE,
      is_aktif: true,
    });
    return page.data.map((p) => ({
      value: String(p.id),
      label: p.nama,
      // `null` plafon is no limit at all and `"0.00"` blocks every credit sale —
      // opposites, so they cannot share a phrasing.
      sub: [p.kode || 'tanpa kode', p.plafon === null ? 'tanpa plafon' : `plafon ${p.plafon}`]
        .filter(Boolean)
        .join(' · '),
    }));
  }, []);

  return (
    <View style={styles.fields}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Field label="Tanggal nota" hint="Menentukan bulan penomoran, periodenya, dan versi harga jual yang berlaku.">
            <TextField
              value={values.tanggal}
              onChangeText={(v) => onChange({ tanggal: v })}
              placeholder="YYYY-MM-DD"
              mono
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Jenis pembayaran" hint="Kredit wajib menyebut pelanggan.">
            <OptionPicker
              options={[
                { value: 'TUNAI', label: 'Tunai' },
                { value: 'KREDIT', label: 'Kredit' },
              ]}
              value={values.jenis}
              onChange={(v) => onChange({ jenis: v as JenisPembayaran })}
            />
          </Field>
        </View>
      </View>

      <Field label="Ruang asal" hint="Seluruh baris keluar dari satu ruang, dan saldonyalah yang membatasi qty.">
        <SearchPicker
          chosen={values.idRuang === null ? null : values.namaRuang}
          onPick={(o) => onChange({ idRuang: Number(o.value), namaRuang: o.label })}
          search={cariRuang}
          placeholder="Cari nama atau kode ruang"
          emptyHint="Tidak ada ruang aktif di unit kerja sesi ini."
        />
      </Field>

      <Field
        label="Pelanggan"
        hint={
          values.jenis === 'KREDIT'
            ? 'Wajib: piutangnya dicatat atas nama ini, dan plafon kreditnya diperiksa saat posting.'
            : 'Boleh kosong — nota tunai di depan meja tidak butuh pelanggan terdaftar.'
        }>
        <SearchPicker
          chosen={values.idPelanggan === null ? null : values.namaPelanggan}
          onPick={(o) => onChange({ idPelanggan: Number(o.value), namaPelanggan: o.label })}
          search={cariPelanggan}
          placeholder="Cari nama atau kode pelanggan"
          emptyHint="Tidak ada pelanggan aktif yang cocok."
        />
      </Field>

      {values.idPelanggan !== null && values.jenis === 'TUNAI' && (
        <View style={styles.clearRow}>
          <Text style={styles.clearNote}>Nota tunai tanpa pelanggan terdaftar?</Text>
          <GhostButton
            label="Kosongkan pelanggan"
            onPress={() => onChange({ idPelanggan: null, namaPelanggan: '' })}
          />
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.cell}>
          <Field label="Diskon nota" hint="Tidak boleh melebihi subtotal baris.">
            <TextField
              value={values.diskonNota}
              onChangeText={(v) => onChange({ diskonNota: v })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
        </View>
        <View style={styles.cell}>
          <Field label="Pembulatan" hint="Boleh negatif — itu baris pembulatan nota, bukan galat.">
            <TextField
              value={values.pembulatan}
              onChangeText={(v) => onChange({ pembulatan: v })}
              placeholder="0"
            />
          </Field>
        </View>
      </View>

      <ErrorBanner message={error} />
    </View>
  );
}

export interface PenjualanFormModalProps extends HeaderFieldsProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** Editing only — creating is `app/(admin)/penjualan/baru.tsx`. */
export function PenjualanFormModal(p: PenjualanFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={620} onRequestClose={p.onCancel}>
      <ModalHead
        title="Ubah header nota"
        sub="Hanya selama DRAFT. Ruang, pelanggan, dan jenis pembayaran semuanya boleh diubah di sini — tidak ada baris detail yang menunjuk salah satunya, jadi tidak ada yang tertinggal salah."
      />
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <PenjualanHeaderFields values={p.values} onChange={p.onChange} error={p.error} />
      </ScrollView>
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan header" />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  fields: { padding: 20, gap: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 180 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: -6 },
  clearNote: { fontSize: 12.5, color: C.muted3 },
});
