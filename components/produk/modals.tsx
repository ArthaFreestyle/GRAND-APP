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

export interface ProductFormModalProps {
  visible: boolean;
  isNew: boolean;
  kode: string;
  onKodeChange: (v: string) => void;
  nama: string;
  onNamaChange: (v: string) => void;
  stokMin: string;
  onStokMinChange: (v: string) => void;
  satuanMasterOptions: { value: string; label: string }[];
  idDasar: number | null;
  onIdDasarChange: (id: number) => void;
  satuanDasarLabel: string;
  aktif: boolean;
  onToggleAktif: () => void;
  error: string;
  onCancel: () => void;
  onSave: () => void;
}

export function ProductFormModal(p: ProductFormModalProps) {
  return (
    <ModalShell visible={p.visible} width={560} onRequestClose={p.onCancel}>
      <ModalHead
        title={p.isNew ? 'Produk baru' : 'Ubah produk'}
        sub={
          p.isNew
            ? 'Produk dan satuan dasarnya ditulis dalam satu transaksi — satuan dasar terdaftar otomatis dengan faktor 1.'
            : 'Hanya nama, stok minimum, dan status aktif yang bisa diubah.'
        }
      />
      <ModalBody>
        <Box className="flex-row items-start gap-3">
          <Box className="flex-1">
            <Field
              label="Kode barang"
              hint={
                !p.isNew
                  ? 'Tidak bisa diubah — kode ini yang menamai barang di setiap dokumen lama.'
                  : undefined
              }>
              <TextField
                value={p.kode}
                onChangeText={p.onKodeChange}
                editable={p.isNew}
                placeholder="BRG-001"
                mono
              />
            </Field>
          </Box>
          <Box className="flex-1">
            {p.isNew ? (
              <Field label="Satuan dasar">
                <OptionPicker
                  options={p.satuanMasterOptions}
                  value={p.idDasar !== null ? String(p.idDasar) : null}
                  onChange={(v) => p.onIdDasarChange(parseInt(v, 10))}
                />
              </Field>
            ) : (
              <Field
                label="Satuan dasar"
                hint="Terkunci — menggantinya membatalkan seluruh faktor dan saldo kartu stok.">
                <TextField value={p.satuanDasarLabel} onChangeText={() => {}} editable={false} />
              </Field>
            )}
          </Box>
        </Box>
        <Field label="Nama">
          <TextField
            value={p.nama}
            onChangeText={p.onNamaChange}
            placeholder="Kertas A4 70gr"
          />
        </Field>
        <Box className="flex-row items-start gap-3">
          <Box className="w-[180px]">
            <Field label="Stok minimum">
              <TextField
                value={p.stokMin}
                onChangeText={p.onStokMinChange}
                keyboardType="numeric"
              />
            </Field>
          </Box>
          <Box className="flex-1 justify-center">
            {p.isNew ? (
              <Note>
                Satuan konversi dan harga jual diatur di halaman detail setelah produk tersimpan.
              </Note>
            ) : (
              <CheckBox
                checked={p.aktif}
                onPress={p.onToggleAktif}
                label="Aktif — bisa dijual di kasir"
              />
            )}
          </Box>
        </Box>
        <ErrorBanner message={p.error} />
      </ModalBody>
      <ModalFooter
        onCancel={p.onCancel}
        onSave={p.onSave}
        saveLabel={p.isNew ? 'Simpan produk' : 'Simpan perubahan'}
      />
    </ModalShell>
  );
}
