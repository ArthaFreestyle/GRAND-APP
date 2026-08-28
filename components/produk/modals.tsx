/**
 * The three dialogs the Master Produk screen opens.
 *
 * Everything they are built from — the shell, fields, pickers, checkbox, error
 * banner — comes from `components/shell/ui.tsx`, which is now gluestack-backed.
 * This file used to carry its own private copy of all six, styled from a second
 * palette import; they were identical in appearance and drifted only by
 * accident, so the copies are gone.
 */
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
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

export { Toast } from '@/components/shell/ui';

/** Shared padding for every dialog body here. */
function ModalBody({ children }: { children: React.ReactNode }) {
  return <Box className="gap-3.5 p-5">{children}</Box>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <Text className="text-[12.5px] leading-[18px] text-faint-2">{children}</Text>;
}

export interface SatuanModalProps {
  visible: boolean;
  satuanOptions: { value: string; label: string }[];
  idSatuan: number | null;
  faktor: string;
  def: boolean;
  error: string;
  onPickSatuan: (id: number) => void;
  onFaktorChange: (v: string) => void;
  onToggleDefault: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function SatuanModal(p: SatuanModalProps) {
  return (
    <ModalShell visible={p.visible} width={460} onRequestClose={p.onCancel}>
      <ModalHead
        title="Tambah satuan konversi"
        sub="Pilih satuan dan faktornya terhadap satuan dasar. Satuan yang sudah terdaftar akan diperbarui faktornya."
      />
      <ModalBody>
        <Field label="Satuan">
          <OptionPicker
            options={p.satuanOptions}
            value={p.idSatuan !== null ? String(p.idSatuan) : null}
            onChange={(v) => p.onPickSatuan(parseInt(v, 10))}
          />
        </Field>
        <Field label="Faktor">
          <TextField
            value={p.faktor}
            onChangeText={p.onFaktorChange}
            placeholder="mis. 12"
            keyboardType="numeric"
          />
        </Field>
        <CheckBox
          checked={p.def}
          onPress={p.onToggleDefault}
          label="Jadikan satuan input default — penanda lama otomatis dilepas"
        />
        <ErrorBanner message={p.error} />
      </ModalBody>
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan satuan" />
    </ModalShell>
  );
}

export interface HargaModalProps {
  visible: boolean;
  isEdit: boolean;
  satuanOptions: { value: string; label: string }[];
  idSatuan: number | null;
  harga: string;
  dari: string;
  error: string;
  onPickSatuan: (id: number) => void;
  onHargaChange: (v: string) => void;
  onDariChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function HargaModal(p: HargaModalProps) {
  return (
    <ModalShell visible={p.visible} width={520} onRequestClose={p.onCancel}>
      <ModalHead
        title={p.isEdit ? 'Koreksi harga' : 'Versi harga baru'}
        sub={
          p.isEdit
            ? 'Ubah nilai harga untuk versi ini. Satuan dan periode tidak berubah.'
            : 'Tambahkan versi harga baru untuk salah satu satuan produk ini.'
        }
      />
      <ModalBody>
        <Field label="Satuan">
          <OptionPicker
            options={p.satuanOptions}
            value={p.idSatuan !== null ? String(p.idSatuan) : null}
            onChange={(v) => p.onPickSatuan(parseInt(v, 10))}
          />
        </Field>
        <Field label="Harga">
          <TextField
            value={p.harga}
            onChangeText={p.onHargaChange}
            placeholder="mis. 52000"
            keyboardType="numeric"
          />
        </Field>
        <Field label="Berlaku dari">
          <TextField value={p.dari} onChangeText={p.onDariChange} placeholder="YYYY-MM-DD" />
        </Field>
        <Note>
          Versi terbuka untuk satuan yang sama otomatis ditutup pada tanggal ini. Periode yang
          tumpang tindih ditolak.
        </Note>
        <ErrorBanner message={p.error} />
      </ModalBody>
      <ModalFooter
        onCancel={p.onCancel}
        onSave={p.onSave}
        saveLabel={p.isEdit ? 'Simpan koreksi' : 'Buka versi baru'}
      />
    </ModalShell>
  );
}

export interface ProductFormValues {
  kode: string;
  nama: string;
  stokMin: string;
  /** Only asked for while creating — the base unit is locked once it exists. */
  idDasar: number | null;
  aktif: boolean;
}

export interface ProductFormFieldsProps {
  isNew: boolean;
  values: ProductFormValues;
  /** Patch, not a value per callback: the form has five fields and one owner. */
  onChange: (patch: Partial<ProductFormValues>) => void;
  satuanMasterOptions: { value: string; label: string }[];
  /** The locked base unit's name, shown in place of the picker when editing. */
  satuanDasarLabel: string;
  error: string;
}

/**
 * The product form's body, with no opinion about what surrounds it.
 *
 * Creating a product is its own route now (`produk/baru`), where the form is
 * the page; editing one is still a dialog on the detail, because it is three
 * fields on a record already on screen. Both ask for the same things, so the
 * fields stopped belonging to the dialog.
 */
export function ProductFormFields({
  isNew,
  values,
  onChange,
  satuanMasterOptions,
  satuanDasarLabel,
  error,
}: ProductFormFieldsProps) {
  return (
    <ModalBody>
      <Box className="flex-row items-start gap-3">
        <Box className="flex-1">
          <Field
            label="Kode barang"
            hint={
              !isNew
                ? 'Tidak bisa diubah — kode ini yang menamai barang di setiap dokumen lama.'
                : undefined
            }>
            <TextField
              value={values.kode}
              onChangeText={(v) => onChange({ kode: v })}
              editable={isNew}
              placeholder="BRG-001"
              mono
            />
          </Field>
        </Box>
        <Box className="flex-1">
          {isNew ? (
            <Field label="Satuan dasar">
              <OptionPicker
                options={satuanMasterOptions}
                value={values.idDasar !== null ? String(values.idDasar) : null}
                onChange={(v) => onChange({ idDasar: parseInt(v, 10) })}
              />
            </Field>
          ) : (
            <Field
              label="Satuan dasar"
              hint="Terkunci — menggantinya membatalkan seluruh faktor dan saldo kartu stok.">
              <TextField value={satuanDasarLabel} onChangeText={() => {}} editable={false} />
            </Field>
          )}
        </Box>
      </Box>
      <Field label="Nama">
        <TextField
          value={values.nama}
          onChangeText={(v) => onChange({ nama: v })}
          placeholder="Kertas A4 70gr"
        />
      </Field>
      <Box className="flex-row items-start gap-3">
        <Box className="w-[180px]">
          <Field label="Stok minimum">
            <TextField
              value={values.stokMin}
              onChangeText={(v) => onChange({ stokMin: v })}
              keyboardType="numeric"
            />
          </Field>
        </Box>
        <Box className="flex-1 justify-center">
          {isNew ? (
            <Note>
              Satuan konversi dan harga jual diatur di halaman detail setelah produk tersimpan.
            </Note>
          ) : (
            <CheckBox
              checked={values.aktif}
              onPress={() => onChange({ aktif: !values.aktif })}
              label="Aktif — bisa dijual di kasir"
            />
          )}
        </Box>
      </Box>
      <ErrorBanner message={error} />
    </ModalBody>
  );
}

export interface ProductFormModalProps
  extends Omit<ProductFormFieldsProps, 'isNew' | 'satuanMasterOptions'> {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * Editing only. The create half moved out to `app/(admin)/produk/baru.tsx`: a
 * page-sized form was living in a dialog purely because there was no route to
 * put it on.
 */
export function ProductFormModal(p: ProductFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={560} onRequestClose={p.onCancel}>
      <ModalHead
        title="Ubah produk"
        sub="Hanya nama, stok minimum, dan status aktif yang bisa diubah."
      />
      <ProductFormFields
        isNew={false}
        values={p.values}
        onChange={p.onChange}
        satuanMasterOptions={[]}
        satuanDasarLabel={p.satuanDasarLabel}
        error={p.error}
      />
      <ModalFooter onCancel={p.onCancel} onSave={p.onSave} saveLabel="Simpan perubahan" />
    </ModalShell>
  );
}
