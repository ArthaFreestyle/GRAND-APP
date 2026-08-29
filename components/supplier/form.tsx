/**
 * The supplier form, and the dialog that wraps it when editing.
 *
 * Creating a supplier is a route (`supplier/baru`) and editing one is a dialog
 * on the detail, so the fields belong to neither and live here.
 *
 * The form lost five fields when the screen was wired to `/api/v1/supplier`,
 * because the contract stores none of them — `tipe`, `narahubung`, `email`,
 * `kota`, and `tempo`. The reasoning is written out in `services/supplier.ts`;
 * what matters here is that the seven-row form collapsed to four, so it now fits
 * a dialog without an inner scroll view.
 *
 * `kode` stayed editable in both modes. The mock froze it after creation on the
 * theory that old documents name the supplier by it, but nothing does: a
 * pembelian references `id_supplier`, and the `KODE` inside a document number is
 * the unit kerja's, not the supplier's. `PATCH /supplier/{id}` accepts `kode`,
 * so a typo stays fixable.
 */
import { View } from 'react-native';

import {
  CheckBox,
  ErrorBanner,
  Field,
  ModalFooter,
  ModalHead,
  ModalShell,
  TextField,
} from '@/components/shell/ui';

export interface SupplierFormValues {
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
  aktif: boolean;
}

export const EMPTY_SUPPLIER: SupplierFormValues = {
  kode: '',
  nama: '',
  telepon: '',
  alamat: '',
  npwp: '',
  aktif: true,
};

/**
 * Says what the server keeps, worded once for both the dialog and the create
 * page. It names the missing fields on purpose: a reader who used to type a PIC
 * and a payment term needs to be told where they went, not left to notice.
 */
export const SUPPLIER_NOTE =
  'Yang tersimpan hanya kode, nama, telepon, alamat, dan NPWP. Tempo bayar, narahubung, dan tipe supplier tidak punya kolom di server — tulis kota dan nama PIC di dalam alamat.';

export interface SupplierFormFieldsProps {
  isNew: boolean;
  values: SupplierFormValues;
  /** Patch, not a callback per field: the form has six and one owner. */
  onChange: (patch: Partial<SupplierFormValues>) => void;
  error: string;
}

export function SupplierFormFields({ isNew, values, onChange, error }: SupplierFormFieldsProps) {
  return (
    <View style={{ padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          {/* Optional, and unique case-insensitively — several suppliers may
              share the empty one, which is why this is not a required field. */}
          <Field label="Kode supplier (opsional)">
            <TextField
              value={values.kode}
              onChangeText={(v) => onChange({ kode: v })}
              mono
              placeholder="SUP-009"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="NPWP">
            <TextField
              value={values.npwp}
              onChangeText={(v) => onChange({ npwp: v })}
              mono
              placeholder="00.000.000.0-000.000"
            />
          </Field>
        </View>
      </View>
      <Field label="Nama">
        <TextField
          value={values.nama}
          onChangeText={(v) => onChange({ nama: v })}
          placeholder="PT Sinar Dunia Distribusi"
        />
      </Field>
      <Field label="Telepon">
        <TextField
          value={values.telepon}
          onChangeText={(v) => onChange({ telepon: v })}
          placeholder="021-5567-8890"
        />
      </Field>
      <Field label="Alamat">
        <TextField
          value={values.alamat}
          onChangeText={(v) => onChange({ alamat: v })}
          placeholder="Jl. Industri Raya No. 12, Kemayoran, Jakarta Pusat"
          multiline
        />
      </Field>
      {!isNew && (
        <CheckBox
          checked={values.aktif}
          onPress={() => onChange({ aktif: !values.aktif })}
          label="Aktif — bisa dipilih saat input pembelian"
        />
      )}
      <ErrorBanner message={error} />
    </View>
  );
}

export interface SupplierFormModalProps extends Omit<SupplierFormFieldsProps, 'isNew'> {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** Editing only — creating a supplier is `app/(admin)/supplier/baru.tsx`. */
export function SupplierFormModal(p: SupplierFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={580} onRequestClose={p.onCancel}>
      <ModalHead title="Ubah supplier" sub={SUPPLIER_NOTE} />
      <SupplierFormFields isNew={false} values={p.values} onChange={p.onChange} error={p.error} />
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan perubahan" />
    </ModalShell>
  );
}
