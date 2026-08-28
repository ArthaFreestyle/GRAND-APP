/**
 * The customer form, and the dialog that wraps it when editing.
 *
 * Creating a customer is a route now (`pelanggan/baru`) and editing one is a
 * dialog on the detail, so the fields stopped belonging to either: they moved
 * here and both callers render them. The `aktif` checkbox is the only field
 * that differs, and it differs because a customer that does not exist yet
 * cannot be deactivated.
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

export interface PelangganFormValues {
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
  /** Whole rupiah as typed; only meaningful while `tanpaBatas` is false. */
  plafon: string;
  /**
   * Maps to `plafon_kredit: null`, which means no limit at all — the opposite of
   * `"0.00"`, which forbids credit entirely.
   */
  tanpaBatas: boolean;
  aktif: boolean;
}

export const EMPTY_PELANGGAN: PelangganFormValues = {
  kode: '',
  nama: '',
  telepon: '',
  alamat: '',
  npwp: '',
  plafon: '0',
  tanpaBatas: true,
  aktif: true,
};

export interface PelangganFormFieldsProps {
  isNew: boolean;
  values: PelangganFormValues;
  /** Patch, not a callback per field: the form has eight and one owner. */
  onChange: (patch: Partial<PelangganFormValues>) => void;
  error: string;
}

export function PelangganFormFields({ isNew, values, onChange, error }: PelangganFormFieldsProps) {
  return (
    <View style={{ padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Kode pelanggan (opsional)">
            <TextField
              value={values.kode}
              onChangeText={(v) => onChange({ kode: v })}
              mono
              placeholder="PLG-009"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="NPWP">
            <TextField
              value={values.npwp}
              onChangeText={(v) => onChange({ npwp: v })}
              mono
              placeholder="—"
            />
          </Field>
        </View>
      </View>
      <Field label="Nama">
        <TextField
          value={values.nama}
          onChangeText={(v) => onChange({ nama: v })}
          placeholder="CV Sinar Jaya"
        />
      </Field>
      <Field label="Telepon">
        <TextField
          value={values.telepon}
          onChangeText={(v) => onChange({ telepon: v })}
          placeholder="0812-3456-7890"
        />
      </Field>
      <Field label="Alamat">
        <TextField
          value={values.alamat}
          onChangeText={(v) => onChange({ alamat: v })}
          placeholder="Jl. ..."
          multiline
        />
      </Field>
      <CheckBox
        checked={values.tanpaBatas}
        onPress={() => onChange({ tanpaBatas: !values.tanpaBatas })}
        label="Tanpa batas kredit — penjualan kredit tidak pernah ditolak"
      />
      {!values.tanpaBatas && (
        <Field label="Plafon kredit (Rp)">
          <TextField
            value={values.plafon}
            onChangeText={(v) => onChange({ plafon: v })}
            keyboardType="numeric"
            placeholder="0"
          />
        </Field>
      )}
      {!isNew && (
        <CheckBox
          checked={values.aktif}
          onPress={() => onChange({ aktif: !values.aktif })}
          label="Aktif — bisa dipilih di kasir"
        />
      )}
      <ErrorBanner message={error} />
    </View>
  );
}

/** The plafon rule, worded once for both the dialog and the create page. */
export const PLAFON_NOTE =
  'Plafon kredit ditegakkan saat nota kredit diposting. Tanpa batas berarti tidak pernah ditolak; plafon 0 berarti tunai saja.';

export interface PelangganFormModalProps extends Omit<PelangganFormFieldsProps, 'isNew'> {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** Editing only — creating a customer is `app/(admin)/pelanggan/baru.tsx`. */
export function PelangganFormModal(p: PelangganFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={560} onRequestClose={p.onCancel}>
      <ModalHead title="Ubah pelanggan" sub={PLAFON_NOTE} />
      <PelangganFormFields isNew={false} values={p.values} onChange={p.onChange} error={p.error} />
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan perubahan" />
    </ModalShell>
  );
}
