/**
 * The five fields a supplier has, shared by the create route and the edit one.
 *
 * One component rather than two copies because the two forms are genuinely the
 * same form — `POST /supplier` and `PATCH /supplier/{id}` take the same five
 * keys, and the only difference between them is that `nama` is the sole
 * required one and that `PATCH` treats an absent key as "leave it alone". The
 * copy about what a kode is, and about what happens when it collides, has to be
 * the same word on both screens or it stops being an explanation and becomes a
 * pair of guesses.
 *
 * The fields are the guide's inverted kind: a small semibold grey label over a
 * bold value on a hairline underline, no box. That is what makes a filled form
 * read as a summary — a boxed field weighs every row the same whether it holds
 * anything or not.
 */
import { StyleSheet, View } from 'react-native';

import { RamahField, RamahNote } from '@/components/shell/ramah';
import { RamahLayout as L } from '@/constants/theme-ramah';

export interface PemasokValues {
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
}

export const EMPTY_PEMASOK: PemasokValues = {
  kode: '',
  nama: '',
  telepon: '',
  alamat: '',
  npwp: '',
};

/**
 * Trims and turns an empty optional into `null`.
 *
 * `null` and `''` are not the same thing to this contract: `PATCH` documents
 * `null` as *clear the column*, and an empty string would be stored as an empty
 * string. `kode` is the one where that matters most — it is unique
 * case-insensitively, but several suppliers may share the *absent* one, so a
 * blank kode has to arrive as null or the second supplier without one answers
 * 409.
 */
export function pemasokBody(v: PemasokValues) {
  const kosong = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    kode: kosong(v.kode),
    nama: v.nama.trim(),
    telepon: kosong(v.telepon),
    alamat: kosong(v.alamat),
    npwp: kosong(v.npwp),
  };
}

/** The one rule that can refuse a save, checked before spending a request on it. */
export function pemasokError(v: PemasokValues): string {
  if (v.nama.trim() === '') return 'Nama pemasok wajib diisi.';
  return '';
}

export function PemasokFields({
  values,
  onChange,
  autoFocus = false,
}: {
  values: PemasokValues;
  onChange: (patch: Partial<PemasokValues>) => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fields}>
      <RamahField
        label="Nama pemasok"
        required
        value={values.nama}
        onChangeText={(nama) => onChange({ nama })}
        placeholder="PT Sumber Makmur"
        autoCapitalize="words"
        autoFocus={autoFocus}
        maxLength={255}
      />
      <RamahField
        label="Kode"
        value={values.kode}
        onChangeText={(kode) => onChange({ kode })}
        placeholder="SUP-01"
        autoCapitalize="characters"
        maxLength={32}
      />
      {/* The rule explained where it bites, which is the only place a reader
          will ever want it. Not an error and not a warning. */}
      <RamahNote icon="info">
        Kode boleh dikosongkan. Kalau diisi, ia harus unik — huruf besar dan kecil dianggap
        sama.
      </RamahNote>
      <RamahField
        label="Telepon"
        value={values.telepon}
        onChangeText={(telepon) => onChange({ telepon })}
        placeholder="0812 3456 7890"
        keyboardType="default"
        maxLength={32}
      />
      <RamahField
        label="Alamat"
        value={values.alamat}
        onChangeText={(alamat) => onChange({ alamat })}
        placeholder="Jl. Merdeka 12, Bandung"
        autoCapitalize="sentences"
        multiline
        maxLength={1000}
      />
      <RamahField
        label="NPWP"
        value={values.npwp}
        onChangeText={(npwp) => onChange({ npwp })}
        placeholder="00.000.000.0-000.000"
        keyboardType="default"
        maxLength={32}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: L.space5 },
});
