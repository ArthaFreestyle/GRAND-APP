/**
 * The pembelian header — the document minus its lines.
 *
 * Creating one is a route (`pembelian/baru`) and correcting one is a sheet on
 * the detail, so the fields belong to neither and live here. `tanggal` is the
 * one field both would share; the rest — freight, PPN, the invoice's own
 * number — only ever get edited here, on a saved `DRAFT`, because `baru.tsx`'s
 * flow asks two questions (what, and from whom) and lands on the draft with
 * everything else optional.
 *
 * **`id_supplier` and `id_ruang` are missing from `PATCH /pembelian/{id}` on
 * purpose**, and so from this file: the supplier decides whose debt the
 * document is, and the ruang decides which stock balance every line touches.
 * Getting one wrong is a cancel-and-retype, not an edit, which is why they are
 * chosen once on `pembelian/baru` and never appear on this sheet.
 *
 * Freight sits in its own section because it is a different bill. `biaya_angkut`
 * is `total_koli x tarif_per_koli` and is **not** part of `total`: the carrier
 * charges it, not the supplier, and it reaches the books through each line's
 * `alokasi_biaya` at posting. Adding the two together anywhere overstates what
 * is owed.
 *
 * Ported to Ramah with the rest of the section — a `RamahSheet` rather than
 * `ModalShell`, which after this port has no caller left in the app; see
 * CLAUDE.md's screen-architecture note on the two ever being right for the same
 * screen. The ekspedisi field, the only lookup on this form, opens
 * `RamahSearchSheet` the same way a product line does.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahField,
  RamahInlineError,
  RamahPickerField,
  RamahPrimaryButton,
  RamahSearchSheet,
  RamahSectionHeader,
  RamahSheet,
  type RamahSearchOption,
} from '@/components/shell/ramah';
import { todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { numericToDecimal, rupiahToDecimal, rupiahToDecimalSigned } from '@/services/decimal';
import { listEkspedisi } from '@/services/ekspedisi';
import type {
  JenisPembayaran,
  MetodeAlokasiAngkut,
  PembelianDoc,
  PembelianHeaderBody,
} from '@/services/pembelian';

const PICKER_SIZE = 8;

export interface PembelianHeaderValues {
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
 * Fills the sheet from a document already on screen.
 *
 * `namaEkspedisi` comes in from outside because the document does not carry it:
 * `Pembelian` has `id_ekspedisi` and no name, so the detail resolves it once and
 * hands it over rather than the sheet opening with a blank carrier field.
 */
export function headerOf(doc: PembelianDoc, namaEkspedisi = ''): PembelianHeaderValues {
  const money = (v: string) => (Number(v) ? String(Math.round(Number(v))) : '');
  const qty = (v: string) => (Number(v) ? String(Number(v)) : '');
  return {
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

export type HeaderResult<T> = { ok: true; body: T } | { ok: false; error: string };

function ymd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  if (error) return { ok: false, error };
  return {
    ok: true,
    body: {
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
    },
  };
}

export interface PembelianHeaderSheetProps {
  visible: boolean;
  values: PembelianHeaderValues;
  /** Patch, not a callback per field: the header has fifteen and one owner. */
  onChange: (patch: Partial<PembelianHeaderValues>) => void;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * Editing only — creating is `app/pembelian/baru.tsx`, and it never
 * shows this sheet: the supplier and the ruang it also decides are chosen on
 * that flow's own screens, not here.
 */
export function PembelianHeaderSheet({
  visible,
  values: v,
  onChange,
  error,
  busy,
  onCancel,
  onSave,
}: PembelianHeaderSheetProps) {
  const [ekspedisiSheet, setEkspedisiSheet] = useState(false);

  const cariEkspedisi = useCallback(async (term: string): Promise<RamahSearchOption[]> => {
    const page = await listEkspedisi({
      search: term || undefined,
      size: PICKER_SIZE,
      is_aktif: true,
    });
    return page.data.map((e) => ({ value: String(e.id), label: e.nama, sub: e.telepon || '—' }));
  }, []);

  return (
    <RamahSheet visible={visible} title="Ubah header faktur" onClose={onCancel}>
      <View style={styles.body}>
        <Text style={styles.lead}>Hanya bisa diubah selama DRAFT.</Text>

        <View style={styles.fieldRow}>
          <View style={styles.fieldCell}>
            <RamahField
              label="Tanggal dokumen"
              value={v.tanggal}
              onChangeText={(t) => onChange({ tanggal: t })}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              maxLength={10}
            />
          </View>
          <View style={styles.fieldCell}>
            <RamahField
              label="Tanggal faktur supplier"
              value={v.tanggalFaktur}
              onChangeText={(t) => onChange({ tanggalFaktur: t })}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              maxLength={10}
            />
          </View>
        </View>

        <RamahField
          label="No. faktur supplier"
          value={v.noFaktur}
          onChangeText={(t) => onChange({ noFaktur: t })}
          placeholder="INV/2026/VIII/1180"
          helper="Unik per supplier."
          autoCapitalize="characters"
        />

        <ChipField
          label="Jenis pembayaran"
          options={[
            { value: 'TUNAI', label: 'Tunai' },
            { value: 'KREDIT', label: 'Kredit' },
          ]}
          value={v.jenis}
          onChange={(val) => onChange({ jenis: val as JenisPembayaran })}
        />

        <View style={styles.fieldRow}>
          <View style={styles.fieldCell}>
            <RamahField
              label="Diskon nota"
              prefix="Rp"
              value={v.diskonNota}
              onChangeText={(t) => onChange({ diskonNota: t })}
              keyboardType="numeric"
              placeholder="0"
              helper="Tidak boleh melebihi subtotal."
            />
          </View>
          <View style={styles.fieldCell}>
            <RamahField
              label="PPN"
              prefix="Rp"
              value={v.ppn}
              onChangeText={(t) => onChange({ ppn: t })}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.fieldCell}>
            <RamahField
              label="Pembulatan"
              value={v.pembulatan}
              onChangeText={(t) => onChange({ pembulatan: t })}
              placeholder="0"
              helper="Boleh negatif."
            />
          </View>
        </View>

        <CheckRow
          checked={v.ppnDikreditkan}
          onPress={() => onChange({ ppnDikreditkan: !v.ppnDikreditkan })}
          label="PPN dikreditkan — jadi pajak masukan, tidak menyentuh harga pokok"
        />

        <View style={styles.divider} />
        <RamahSectionHeader>Ongkos angkut</RamahSectionHeader>
        <Text style={styles.sectionNote}>Di luar total faktur.</Text>

        <RamahPickerField
          label="Ekspedisi"
          value={v.idEkspedisi === null ? '' : v.namaEkspedisi}
          placeholder="Cari nama atau telepon ekspedisi"
          onPress={() => setEkspedisiSheet(true)}
        />

        <View style={styles.fieldRow}>
          <View style={styles.fieldCell}>
            <RamahField
              label="No. resi"
              value={v.noResi}
              onChangeText={(t) => onChange({ noResi: t })}
              placeholder="JNE-00281911"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.fieldCell}>
            <RamahField
              label="Total koli"
              value={v.totalKoli}
              onChangeText={(t) => onChange({ totalKoli: t })}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.fieldCell}>
            <RamahField
              label="Tarif per koli"
              prefix="Rp"
              value={v.tarifPerKoli}
              onChangeText={(t) => onChange({ tarifPerKoli: t })}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
        </View>

        <ChipField
          label="Metode alokasi"
          options={[
            { value: 'KOLI', label: 'Per koli' },
            { value: 'QTY', label: 'Per qty dasar' },
          ]}
          value={v.metode}
          onChange={(val) => onChange({ metode: val as MetodeAlokasiAngkut })}
          helper="Jatuh ke QTY kalau koli semua nol."
        />

        <CheckRow
          checked={v.ditanggungSupplier}
          onPress={() => onChange({ ditanggungSupplier: !v.ditanggungSupplier })}
          label="Ongkir ditanggung supplier — sudah termasuk nota, tidak dialokasikan lagi"
        />

        {error ? <RamahInlineError message={error} /> : null}

        <RamahPrimaryButton
          label={busy ? 'Menyimpan…' : 'Simpan header'}
          onPress={onSave}
          busy={busy}
          disabled={busy}
        />
      </View>

      <RamahSearchSheet
        visible={ekspedisiSheet}
        title="Cari ekspedisi"
        onClose={() => setEkspedisiSheet(false)}
        search={cariEkspedisi}
        onPick={(o) => onChange({ idEkspedisi: Number(o.value), namaEkspedisi: o.label })}
        placeholder="Cari nama atau telepon ekspedisi"
        emptyHint="Tidak ada ekspedisi aktif yang cocok."
      />
    </RamahSheet>
  );
}

/** A labelled pair of chips for a two-option field — jenis pembayaran, metode alokasi. */
function ChipField({
  label,
  options,
  value,
  onChange,
  helper,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  helper?: string;
}) {
  return (
    <View style={styles.chipField}>
      <Text style={styles.miniLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((o) => (
          <ChipOption
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

function ChipOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? C.brandTintSoft : C.white, borderColor: selected ? C.borderBrand : C.borderHairline },
        down && { opacity: 0.85 },
      ]}>
      <Text style={[styles.chipLabel, { color: selected ? C.brandInk : C.textTitle }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The system's boolean toggle — a 20pt check box and a sentence, for the two
 * fields on this form that are genuinely a yes/no rather than a chosen value.
 * There is no `RamahCheckbox` in `shell/ramah.tsx` yet; this stays local until
 * a second screen needs one.
 */
function CheckRow({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[styles.checkRow, down && { opacity: 0.85 }]}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <Feather name="check" size={14} color={C.white} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: L.gutter, paddingBottom: L.space4, gap: L.space5 },
  lead: { ...T.bodySmall, color: C.textBody },

  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space3 },
  fieldCell: { flexGrow: 1, flexBasis: 130 },
  miniLabel: { ...T.caption, color: C.textBody },
  helper: { ...T.bodySmall, color: C.textBody },

  chipField: { gap: L.inline },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },
  chip: {
    height: L.controlHSm,
    justifyContent: 'center',
    // The same insides as `RamahChip`.
    paddingHorizontal: L.space3,
    borderRadius: R.pill,
    borderWidth: 1.5,
  },
  chipLabel: { ...T.caption },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  checkBox: {
    width: 20,
    height: 20,
    // An optical nudge onto the label's first line, not a gap — one of the
    // exceptions `RamahLayout` lists to the 4px grid.
    marginTop: 1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: C.brand, borderColor: C.brand },
  checkLabel: { ...T.bodySmall, color: C.textTitle, flex: 1, minWidth: 0 },

  divider: { height: 1, backgroundColor: C.borderHairline, marginTop: L.space1 },
  sectionNote: { ...T.bodySmall, color: C.textBody, marginTop: -L.space3 },
});
