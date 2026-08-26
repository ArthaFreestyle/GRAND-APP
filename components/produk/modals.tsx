import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProdukColors as C } from '@/constants/produk';

function ModalShell({
  visible,
  width,
  onRequestClose,
  children,
}: {
  visible: boolean;
  width: number;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { maxWidth: width, width: '100%' }]}>{children}</View>
      </View>
    </Modal>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function CheckBox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.checkboxRow}>
      <View style={[styles.checkboxBox, checked && { backgroundColor: C.primary, borderColor: C.primary }]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function OptionPicker({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.pickerOption, active && styles.pickerOptionActive]}>
            <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
      <View style={styles.headBlock}>
        <Text style={styles.title}>Tambah satuan konversi</Text>
        <Text style={styles.subtitle}>
          Pilih satuan dan faktornya terhadap satuan dasar. Satuan yang sudah terdaftar akan diperbarui faktornya.
        </Text>
      </View>
      <View style={styles.body}>
        <Field label="Satuan">
          <OptionPicker
            options={p.satuanOptions}
            value={p.idSatuan !== null ? String(p.idSatuan) : null}
            onChange={(v) => p.onPickSatuan(parseInt(v, 10))}
          />
        </Field>
        <Field label="Faktor">
          <TextInput
            value={p.faktor}
            onChangeText={p.onFaktorChange}
            placeholder="mis. 12"
            keyboardType="numeric"
            style={styles.input}
          />
        </Field>
        <CheckBox
          checked={p.def}
          onPress={p.onToggleDefault}
          label="Jadikan satuan input default — penanda lama otomatis dilepas"
        />
        <ErrorBanner message={p.error} />
      </View>
      <View style={styles.footer}>
        <Pressable onPress={p.onCancel} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryText}>Batal</Text>
        </Pressable>
        <Pressable onPress={p.onSave} style={styles.btnPrimary}>
          <Text style={styles.btnPrimaryText}>Simpan satuan</Text>
        </Pressable>
      </View>
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
      <View style={styles.headBlock}>
        <Text style={styles.title}>{p.isEdit ? 'Koreksi harga' : 'Versi harga baru'}</Text>
        <Text style={styles.subtitle}>
          {p.isEdit
            ? 'Ubah nilai harga untuk versi ini. Satuan dan periode tidak berubah.'
            : 'Tambahkan versi harga baru untuk salah satu satuan produk ini.'}
        </Text>
      </View>
      <View style={styles.body}>
        <Field label="Satuan">
          <OptionPicker
            options={p.satuanOptions}
            value={p.idSatuan !== null ? String(p.idSatuan) : null}
            onChange={(v) => p.onPickSatuan(parseInt(v, 10))}
          />
        </Field>
        <Field label="Harga">
          <TextInput
            value={p.harga}
            onChangeText={p.onHargaChange}
            placeholder="mis. 52000"
            keyboardType="numeric"
            style={styles.input}
          />
        </Field>
        <Field label="Berlaku dari">
          <TextInput
            value={p.dari}
            onChangeText={p.onDariChange}
            placeholder="YYYY-MM-DD"
            style={styles.input}
          />
        </Field>
        <Text style={styles.smallMuted}>
          Versi terbuka untuk satuan yang sama otomatis ditutup pada tanggal ini. Periode yang tumpang tindih ditolak.
        </Text>
        <ErrorBanner message={p.error} />
      </View>
      <View style={styles.footer}>
        <Pressable onPress={p.onCancel} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryText}>Batal</Text>
        </Pressable>
        <Pressable onPress={p.onSave} style={styles.btnPrimary}>
          <Text style={styles.btnPrimaryText}>{p.isEdit ? 'Simpan koreksi' : 'Buka versi baru'}</Text>
        </Pressable>
      </View>
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
      <View style={styles.headBlock}>
        <Text style={styles.title}>{p.isNew ? 'Produk baru' : 'Ubah produk'}</Text>
        <Text style={styles.subtitle}>
          {p.isNew
            ? 'Produk dan satuan dasarnya ditulis dalam satu transaksi — satuan dasar terdaftar otomatis dengan faktor 1.'
            : 'Hanya nama, stok minimum, dan status aktif yang bisa diubah.'}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row2}>
          <View style={styles.col}>
            <Field
              label="Kode barang"
              hint={!p.isNew ? 'Tidak bisa diubah — kode ini yang menamai barang di setiap dokumen lama.' : undefined}>
              <TextInput
                value={p.kode}
                onChangeText={p.onKodeChange}
                editable={p.isNew}
                placeholder="BRG-001"
                style={[styles.input, styles.mono, !p.isNew && styles.inputLocked]}
              />
            </Field>
          </View>
          <View style={styles.col}>
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
                <TextInput value={p.satuanDasarLabel} editable={false} style={[styles.input, styles.inputLocked]} />
              </Field>
            )}
          </View>
        </View>
        <Field label="Nama">
          <TextInput
            value={p.nama}
            onChangeText={p.onNamaChange}
            placeholder="Kertas A4 70gr"
            style={styles.input}
          />
        </Field>
        <View style={styles.row2}>
          <View style={{ width: 180 }}>
            <Field label="Stok minimum">
              <TextInput
                value={p.stokMin}
                onChangeText={p.onStokMinChange}
                keyboardType="numeric"
                style={styles.input}
              />
            </Field>
          </View>
          <View style={styles.col}>
            {p.isNew ? (
              <Text style={styles.smallMuted}>
                Satuan konversi dan harga jual diatur di halaman detail setelah produk tersimpan.
              </Text>
            ) : (
              <CheckBox checked={p.aktif} onPress={p.onToggleAktif} label="Aktif — bisa dijual di kasir" />
            )}
          </View>
        </View>
        <ErrorBanner message={p.error} />
      </View>
      <View style={styles.footer}>
        <Pressable onPress={p.onCancel} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryText}>Batal</Text>
        </Pressable>
        <Pressable onPress={p.onSave} style={styles.btnPrimary}>
          <Text style={styles.btnPrimaryText}>{p.isNew ? 'Simpan produk' : 'Simpan perubahan'}</Text>
        </Pressable>
      </View>
    </ModalShell>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,24,28,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: C.card,
    borderRadius: 14,
    maxHeight: '100%',
    overflow: 'hidden',
  },
  headBlock: { paddingHorizontal: 20, paddingTop: 18 },
  title: { fontSize: 19, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  subtitle: { marginTop: 4, fontSize: 14, color: C.muted3, lineHeight: 20 },
  body: { padding: 20, gap: 14 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.tableHeaderBg,
  },
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.dark2 },
  fieldHint: { fontSize: 13, color: C.muted, lineHeight: 18 },
  smallMuted: { fontSize: 13.5, color: C.muted2, lineHeight: 19 },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    fontSize: 15,
    color: C.text,
  },
  inputLocked: { backgroundColor: C.badgeBg, color: C.muted3 },
  mono: { fontFamily: 'monospace' },
  errorBanner: {
    padding: 11,
    borderRadius: 9,
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: C.redBorder,
  },
  errorText: { fontSize: 14, fontWeight: '500', color: C.red, lineHeight: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#B9C1C6',
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkboxLabel: { fontSize: 14, color: C.dark2, flex: 1, lineHeight: 19 },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerOption: {
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 220,
  },
  pickerOptionActive: { backgroundColor: C.primaryTintBg, borderColor: C.primaryTintBorder },
  pickerOptionText: { fontSize: 14, color: C.dark2 },
  pickerOptionTextActive: { color: C.primaryDark, fontWeight: '600' },
  btnSecondary: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  btnPrimary: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 14.5, fontWeight: '600', color: '#fff' },
  toast: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: C.toastBg,
    maxWidth: 420,
  },
  toastText: { fontSize: 15, fontWeight: '500', color: '#fff' },
});
