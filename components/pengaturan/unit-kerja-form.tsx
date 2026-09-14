/**
 * The two fields a unit kerja has, shared by the create route and the edit
 * one — the same split `PemasokFields` makes and for the same reason:
 * `POST /unit-kerja` and `PATCH /unit-kerja/{id}` take the same two keys, and
 * the copy about what a kode is has to be the same word on both screens.
 *
 * `is_aktif` is deliberately not a field here. Deactivating a unit kerja drops
 * every grant that names it out of its holders' `grants` on their next login,
 * which is a consequence worth its own confirmation rather than a toggle
 * buried in a form — `app/pengaturan/[id]/index.tsx` is where that lives, next
 * to the archive icon every other section uses for the same kind of retire.
 */
import { StyleSheet, View } from 'react-native';

import { RamahField, RamahNote } from '@/components/shell/ramah';
import { RamahLayout as L } from '@/constants/theme-ramah';

export interface UnitKerjaValues {
  kode: string;
  nama: string;
}

export const EMPTY_UNIT_KERJA: UnitKerjaValues = { kode: '', nama: '' };

/**
 * `null` and `''` are not the same thing to this contract: `PATCH` documents
 * `null` as *clear the column*, while several units may share the empty kode.
 */
export function unitKerjaBody(v: UnitKerjaValues) {
  const kosong = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    kode: kosong(v.kode),
    nama: v.nama.trim(),
  };
}

export function unitKerjaError(v: UnitKerjaValues): string {
  if (v.nama.trim() === '') return 'Nama unit kerja wajib diisi.';
  return '';
}

export function UnitKerjaFields({
  values,
  onChange,
  autoFocus = false,
}: {
  values: UnitKerjaValues;
  onChange: (patch: Partial<UnitKerjaValues>) => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fields}>
      <RamahField
        label="Nama unit kerja"
        required
        value={values.nama}
        onChangeText={(nama) => onChange({ nama })}
        placeholder="Toko Pusat"
        autoCapitalize="words"
        autoFocus={autoFocus}
        maxLength={255}
      />
      <RamahField
        label="Kode"
        value={values.kode}
        onChangeText={(kode) => onChange({ kode })}
        placeholder="PUSAT"
        autoCapitalize="characters"
        maxLength={32}
      />
      <RamahNote icon="info">
        Kode boleh dikosongkan. Kalau diisi, ia harus unik — huruf besar dan kecil dianggap
        sama.
      </RamahNote>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: L.space5 },
});
