/**
 * The lines of a saldo awal, and the editor that types them.
 *
 * **Not `components/shell/baris-barang.tsx`, on purpose.** That editor prints the
 * room's balance under every quantity and turns the row red when the quantity
 * exceeds it. For a document that takes goods *out* that is exactly right. Here
 * the balance of every eligible `(barang, ruang)` is **zero by definition** — if
 * it were not, the document would be refused — so every row would go red and say
 * precisely the wrong thing. The nearest shape is `components/pembelian/lines.tsx`:
 * a product, an input unit, a quantity, and a typed cost per unit.
 *
 * ## What the client holds, because it can all be known before sending
 *
 * - `harga_satuan_input` **more than zero**, at most two decimals. Zero is refused
 *   on purpose by the server: free goods would drag the room's moving average down
 *   permanently. The sentence appears the moment a zero is typed.
 * - `qty_input` more than zero, at most four decimals, and `qty × faktor` a whole
 *   number (`qty_dasar` is a `BIGINT`). Checked in scaled integers, never with
 *   float multiplication — `0.07 × 100` is not `7` in a float.
 * - One product once per document, checked when it is picked.
 * - At least one line, for `PUT .../detail` and for `ajukan`.
 *
 * `previewNilai` is the value a row is *about to be* while it is being typed. It
 * mirrors the server's `qty × harga`, rounded once — but after a save the screen
 * shows the server's `nilai_masuk`, never this.
 *
 * The rows are drawn by whatever hosts them (a `FlatList`: a migration can carry
 * 500 SKUs, and a `ScrollView` would mount every one).
 */
import Feather from '@expo/vector-icons/Feather';
import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RamahField,
  RamahIconButton,
  RamahPickerField,
  RamahSearchSheet,
  RamahSheet,
  RamahSheetOption,
  type RamahSearchOption,
} from '@/components/shell/ramah';
import { formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { numericToDecimal } from '@/services/decimal';
import { listPosProducts, type PosProductRow } from '@/services/produk';
import type { SaldoAwalDetailInput, SaldoAwalLine } from '@/services/saldo-awal';

/** Most lines one document may carry, and the contract's `maxItems`. */
export const MAKS_BARIS = 500;

const CARI_SIZE = 8;

export interface SatuanPilihan {
  id: number;
  nama: string;
  faktor: number;
}

export interface BarisDraft {
  /** Identity for React only — `PUT .../detail` replaces the set, so server ids do not survive it. */
  key: string;
  idProduct: number | null;
  kode: string;
  nama: string;
  satuan: SatuanPilihan[];
  idSatuanInput: number | null;
  namaSatuan: string;
  qty: string;
  harga: string;
}

let seq = 0;
function nextKey() {
  seq += 1;
  return `sa${seq}`;
}

export function barisKosong(): BarisDraft {
  return {
    key: nextKey(),
    idProduct: null,
    kode: '',
    nama: '',
    satuan: [],
    idSatuanInput: null,
    namaSatuan: '',
    qty: '',
    harga: '',
  };
}

/**
 * Seeds the editor from a saved document. The other units the product accepts are
 * not on the line and cost a read per row, so the unit chip stays a label until
 * somebody picks the product again.
 */
export function draftOfLine(l: SaldoAwalLine): BarisDraft {
  return {
    key: nextKey(),
    idProduct: l.idProduct,
    kode: l.kode,
    nama: l.nama,
    // Only the unit the line was typed in: enough to check `qty × faktor` on it.
    satuan: [{ id: l.idSatuanInput, nama: l.namaSatuan, faktor: l.faktor }],
    idSatuanInput: l.idSatuanInput,
    namaSatuan: l.namaSatuan,
    qty: trimZeros(l.qtyInput),
    harga: trimZeros(l.hargaSatuanInput),
  };
}

/** `"100.0000"` reads as `100` in a field somebody is about to retype. */
function trimZeros(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}

// ---- arithmetic in scaled integers -----------------------------------------

/** `"3.5"` → `35000` (four decimals). `null` when it is not a number or has more than four. */
function scaledQty(v: string): number | null {
  const d = numericToDecimal(v);
  if (d === null) return null;
  const [int, frac = ''] = d.split('.');
  if (frac.length > 4) return null;
  return Number(int) * 10000 + Number(frac.padEnd(4, '0'));
}

/** `"8.33"` → `833` (cents). `null` when it is not a number or has more than two decimals. */
function scaledHarga(v: string): number | null {
  const d = numericToDecimal(v);
  if (d === null) return null;
  const [int, frac = ''] = d.split('.');
  if (frac.length > 2) return null;
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}

/** `qty × harga`, rounded half up to a cent — the rule the server applies once. */
export function previewNilai(qty: string, harga: string): number | null {
  const q = scaledQty(qty);
  const h = scaledHarga(harga);
  if (q === null || h === null || q <= 0 || h <= 0) return null;
  return Math.floor((q * h + 5000) / 10000);
}

export function previewTotal(rows: readonly BarisDraft[]): number {
  return rows.reduce((sum, r) => sum + (previewNilai(r.qty, r.harga) ?? 0), 0);
}

/** Cents as a decimal string, e.g. `35250` → `"352.50"`. */
function sen(n: number): string {
  const whole = Math.floor(n / 100);
  return `${whole}.${String(n % 100).padStart(2, '0')}`;
}

/**
 * A decimal string as rupiah, keeping cents only when there are any — a typed
 * cost of 8,33 must not read as "Rp 8". `formatRupiah` alone truncates.
 */
export function formatUang(value: string | number): string {
  const s = typeof value === 'number' ? sen(value) : value;
  const [whole, frac = ''] = s.split('.');
  const cents = frac.slice(0, 2).padEnd(2, '0');
  return formatRupiah(whole) + (cents === '00' ? '' : `,${cents}`);
}

/** `harga_satuan_input` refused at zero: the sentence the issue asks to appear when it is typed. */
export const PESAN_HARGA_NOL =
  'Harga nol ditolak — barang gratis menarik rata-rata gudang turun selamanya. Kalau memang perlu, catat sebagai pembelian dengan diskon penuh.';

/** What is wrong with a price as typed, live, or `''`. Empty means "not typed yet", not "wrong". */
export function pesanHarga(harga: string): string {
  if (harga.trim() === '') return '';
  const d = numericToDecimal(harga);
  if (d === null) return 'Harga harus berupa angka.';
  if (Number(d) === 0) return PESAN_HARGA_NOL;
  if (scaledHarga(harga) === null) return 'Harga paling banyak dua desimal.';
  return '';
}

export type BarisResult =
  | { ok: true; detail: SaldoAwalDetailInput[] }
  | { ok: false; error: string; errors: Record<string, string> };

/**
 * Validates the whole draft and builds the body. Each failing row is named in
 * `errors` (by `key`) so the row can say so itself, and `error` is the first of
 * them for a line above the dock.
 */
export function barisToInput(rows: readonly BarisDraft[]): BarisResult {
  if (rows.length === 0)
    return { ok: false, error: 'Tambahkan minimal satu baris.', errors: {} };
  if (rows.length > MAKS_BARIS)
    return { ok: false, error: `Paling banyak ${MAKS_BARIS} baris per dokumen.`, errors: {} };

  const errors: Record<string, string> = {};
  const detail: SaldoAwalDetailInput[] = [];
  const seen = new Set<number>();
  let first = '';

  rows.forEach((r, i) => {
    const no = `Baris ${i + 1}`;
    const fail = (msg: string) => {
      errors[r.key] = msg;
      if (!first) first = `${no}: ${msg}`;
    };

    if (r.idProduct === null) return fail('pilih produknya dulu.');
    if (seen.has(r.idProduct)) return fail('produk ini sudah ada di baris lain.');
    seen.add(r.idProduct);
    if (r.idSatuanInput === null) return fail('pilih satuannya dulu.');

    const q = scaledQty(r.qty);
    if (q === null) {
      return fail(
        numericToDecimal(r.qty) === null
          ? 'qty harus berupa angka.'
          : 'qty paling banyak empat desimal.'
      );
    }
    if (q <= 0) return fail('qty harus lebih dari nol.');
    const faktor = r.satuan.find((s) => s.id === r.idSatuanInput)?.faktor ?? null;
    if (faktor !== null && (q * faktor) % 10000 !== 0) {
      return fail(`qty × faktor konversi (${faktor}) harus bilangan bulat.`);
    }

    const pesan = pesanHarga(r.harga);
    if (pesan) return fail(pesan);
    const h = scaledHarga(r.harga);
    if (h === null) return fail('isi harga per satuannya.');

    detail.push({
      id_product: r.idProduct,
      id_satuan_input: r.idSatuanInput,
      qty_input: numericToDecimal(r.qty) as string,
      harga_satuan_input: sen(h),
    });
  });

  return Object.keys(errors).length > 0 ? { ok: false, error: first, errors } : { ok: true, detail };
}

// ---- the pickers, hoisted so 500 rows do not carry 1000 sheets --------------

/**
 * The product picker. It reads `GET /pos/product` for the document's room, so it
 * offers only products in that unit's catalogue — one outside it is a 400 the
 * server would otherwise raise only when the whole set is saved.
 */
export function PilihProdukSheet({
  visible,
  idRuang,
  onClose,
  onPick,
}: {
  visible: boolean;
  idRuang: number;
  onClose: () => void;
  onPick: (product: PosProductRow) => void;
}) {
  /** The last page of results, so a pick hands back the whole row and needs no second read. */
  const cache = useRef(new Map<string, PosProductRow>());

  const cari = useCallback(
    async (term: string): Promise<RamahSearchOption[]> => {
      const page = await listPosProducts({
        id_ruang: idRuang,
        search: term || undefined,
        size: CARI_SIZE,
      });
      cache.current = new Map(page.data.map((p) => [String(p.id), p]));
      return page.data.map((p) => ({ value: String(p.id), label: p.nama }));
    },
    [idRuang]
  );

  return (
    <RamahSearchSheet
      visible={visible}
      title="Cari produk"
      onClose={onClose}
      search={cari}
      onPick={(o) => {
        const row = cache.current.get(o.value);
        if (row) onPick(row);
      }}
      placeholder="Cari nama barang"
      emptyHint="Tidak ada produk aktif yang cocok."
    />
  );
}

export function PilihSatuanSheet({
  baris,
  onClose,
  onPick,
}: {
  baris: BarisDraft | null;
  onClose: () => void;
  onPick: (s: SatuanPilihan) => void;
}) {
  return (
    <RamahSheet
      visible={baris !== null}
      title={baris ? `Satuan ${baris.nama}` : 'Satuan'}
      onClose={onClose}>
      {(baris?.satuan ?? []).map((s) => (
        <RamahSheetOption
          key={s.id}
          label={s.faktor === 1 ? s.nama : `${s.nama} (×${s.faktor})`}
          selected={s.id === baris?.idSatuanInput}
          onPress={() => onPick(s)}
        />
      ))}
    </RamahSheet>
  );
}

/** Seeds a row from a picked product: its default input unit, everything else empty. */
export function isiProduk(row: BarisDraft, p: PosProductRow): BarisDraft {
  const satuan = p.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor }));
  const awal = p.satuan.find((s) => s.def) ?? p.dasar ?? p.satuan[0];
  return {
    ...row,
    idProduct: p.id,
    kode: p.kode,
    nama: p.nama,
    satuan,
    idSatuanInput: awal ? awal.idSatuan : null,
    namaSatuan: awal ? awal.nama : '',
  };
}

// ---- one row ----------------------------------------------------------------

export const BarisEditorRow = memo(function BarisEditorRow({
  index,
  baris,
  error,
  onProduk,
  onSatuan,
  onUbah,
  onHapus,
}: {
  index: number;
  baris: BarisDraft;
  error?: string;
  onProduk: (key: string) => void;
  onSatuan: (key: string) => void;
  onUbah: (key: string, next: Partial<BarisDraft>) => void;
  onHapus: (key: string) => void;
}) {
  const faktor = baris.satuan.find((s) => s.id === baris.idSatuanInput)?.faktor ?? null;
  const nilai = previewNilai(baris.qty, baris.harga);
  const hargaErr = pesanHarga(baris.harga);

  return (
    <View style={styles.box}>
      <View style={styles.top}>
        <View style={styles.grow}>
          <RamahPickerField
            label="Produk"
            value={baris.idProduct === null ? '' : baris.nama || baris.kode}
            placeholder="Cari nama barang"
            onPress={() => onProduk(baris.key)}
          />
        </View>
        <RamahIconButton
          icon="trash-2"
          label={`Hapus baris ${index + 1}`}
          onPress={() => onHapus(baris.key)}
          color={C.danger}
        />
      </View>

      <View style={styles.fields}>
        <View style={styles.cell}>
          <Text style={styles.miniLabel}>Satuan</Text>
          <SatuanChip
            nama={baris.namaSatuan}
            bisaGanti={baris.satuan.length > 1}
            onPress={() => onSatuan(baris.key)}
          />
        </View>
        <View style={styles.cell}>
          <RamahField
            label="Qty"
            value={baris.qty}
            onChangeText={(v) => onUbah(baris.key, { qty: v })}
            keyboardType="numeric"
            placeholder="0"
            helper={faktor !== null && faktor !== 1 ? `×${faktor} satuan dasar` : undefined}
          />
        </View>
        <View style={styles.cell}>
          <RamahField
            label="Harga / satuan"
            prefix="Rp"
            value={baris.harga}
            onChangeText={(v) => onUbah(baris.key, { harga: v })}
            keyboardType="numeric"
            placeholder="0"
            error={hargaErr || undefined}
          />
        </View>
      </View>

      {error && error !== hargaErr ? <Text style={styles.error}>{error}</Text> : null}

      {nilai !== null ? (
        <View style={styles.foot}>
          <Text style={styles.footLabel}>Nilai masuk</Text>
          <Text style={styles.footValue}>{formatUang(nilai)}</Text>
        </View>
      ) : null}
    </View>
  );
});

function SatuanChip({
  nama,
  bisaGanti,
  onPress,
}: {
  nama: string;
  bisaGanti: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={bisaGanti ? onPress : undefined}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={!bisaGanti}
      accessibilityRole="button"
      accessibilityLabel={`Satuan ${nama || '—'}${bisaGanti ? '. Ganti satuan' : ''}`}
      style={[styles.chip, down && bisaGanti && styles.chipDown]}>
      <Text style={styles.chipText} numberOfLines={1}>
        {nama || '—'}
      </Text>
      {bisaGanti ? <Feather name="chevron-down" size={RamahIcon.meta} color={C.iconMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  box: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space3,
  },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: L.space2 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space3 },
  cell: { flexGrow: 1, flexBasis: 130 },
  miniLabel: { ...T.caption, color: C.textBody, marginBottom: L.inline },
  error: { ...T.bodySmall, color: C.textDanger },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space2,
    alignSelf: 'flex-start',
    height: L.controlHSm,
    paddingHorizontal: L.space3,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderHairline,
    backgroundColor: C.white,
  },
  chipDown: { backgroundColor: C.surfaceStack },
  chipText: { ...T.bodySmall, color: C.textTitle },

  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: L.space3,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
    paddingTop: L.space2,
  },
  footLabel: { ...T.bodySmall, color: C.textBody },
  footValue: { ...T.titleTiny, color: C.textTitle },
});
