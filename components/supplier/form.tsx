/**
 * The supplier form, and the dialog that wraps it when editing.
 *
 * Creating a supplier is a route now (`supplier/baru`) and editing one is a
 * dialog on the detail, so the fields belong to neither and live here. `kode`
 * is only editable while creating — it is the code every old document names the
 * supplier by.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CheckBox,
  ErrorBanner,
  Field,
  ModalFooter,
  ModalHead,
  ModalShell,
  TextField,
} from '@/components/shell/ui';
import { Colors as C } from '@/constants/theme-erp';
import { TIPE_META, type Tipe } from '@/stores/supplier';

export interface SupplierFormValues {
  kode: string;
  nama: string;
  tipe: Tipe;
  narahubung: string;
  telepon: string;
  email: string;
  npwp: string;
  kota: string;
  alamat: string;
  /** Days, as typed. 0 means the purchase is paid on the spot. */
  tempo: string;
  aktif: boolean;
}

export const EMPTY_SUPPLIER: SupplierFormValues = {
  kode: '',
  nama: '',
  tipe: 'distributor',
  narahubung: '',
  telepon: '',
  email: '',
  npwp: '',
  kota: '',
  alamat: '',
  tempo: '30',
  aktif: true,
};

export const SUPPLIER_NEW_NOTE =
  'Isi data supplier. Tempo 0 berarti pembelian dibayar tunai di tempat.';
export const SUPPLIER_EDIT_NOTE = 'Perbarui data kontak dan tempo pembayaran supplier ini.';

export interface SupplierFormFieldsProps {
  isNew: boolean;
  values: SupplierFormValues;
  onChange: (patch: Partial<SupplierFormValues>) => void;
  error: string;
}

export function SupplierFormFields({ isNew, values, onChange, error }: SupplierFormFieldsProps) {
  return (
    <View style={{ padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Kode supplier">
            <TextField
              value={values.kode}
              onChangeText={(v) => onChange({ kode: v })}
              editable={isNew}
              mono
              placeholder="SUP-009"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Tipe">
            <SelectPill<Tipe>
              value={values.tipe}
              options={['distributor', 'pabrik', 'perorangan']}
              labels={TIPE_META}
              onChange={(v) => onChange({ tipe: v })}
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
      <Field label="Narahubung">
        <TextField
          value={values.narahubung}
          onChangeText={(v) => onChange({ narahubung: v })}
          placeholder="Nama sales / PIC"
        />
      </Field>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Telepon">
            <TextField
              value={values.telepon}
              onChangeText={(v) => onChange({ telepon: v })}
              placeholder="021-5567-8890"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Email">
            <TextField
              value={values.email}
              onChangeText={(v) => onChange({ email: v })}
              placeholder="sales@supplier.co.id"
            />
          </Field>
        </View>
      </View>
      <Field label="Alamat">
        <TextField
          value={values.alamat}
          onChangeText={(v) => onChange({ alamat: v })}
          placeholder="Jl. ..."
          multiline
        />
      </Field>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Kota">
            <TextField
              value={values.kota}
              onChangeText={(v) => onChange({ kota: v })}
              placeholder="Jakarta Pusat"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="NPWP">
            <TextField
              value={values.npwp}
              onChangeText={(v) => onChange({ npwp: v })}
              placeholder="00.000.000.0-000.000"
            />
          </Field>
        </View>
        <View style={{ width: 120 }}>
          <Field label="Tempo (hari)">
            <TextField
              value={values.tempo}
              onChangeText={(v) => onChange({ tempo: v })}
              keyboardType="numeric"
              placeholder="30"
            />
          </Field>
        </View>
      </View>
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
      <ModalHead title="Ubah supplier" sub={SUPPLIER_EDIT_NOTE} />
      {/* The form is taller than a phone dialog can be; on the create route it
          is the page and scrolls with it instead. */}
      <ScrollView style={{ maxHeight: 480 }}>
        <SupplierFormFields isNew={false} values={p.values} onChange={p.onChange} error={p.error} />
      </ScrollView>
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan perubahan" />
    </ModalShell>
  );
}

function SelectPill<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, { label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={[styles.selectPill, active && styles.selectPillActive]}>
            <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>
              {labels[o].label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  selectPill: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPillActive: { backgroundColor: C.primaryTintBg, borderColor: C.primaryTintBorder },
  selectPillText: { fontSize: 14, color: C.dark2 },
  selectPillTextActive: { color: C.primaryDark, fontWeight: '600' },
});
