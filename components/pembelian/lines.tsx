/**
 * The invoice lines, and the editor that types them.
 *
 * Two routes need this: `pembelian/baru` types the first set, and
 * `pembelian/[id]` retypes them while the document is still `DRAFT`. Those used
 * to be two different things — a form and a detail — but the contract makes them
 * the same one: `PUT /pembelian/{id}/detail` replaces **every** line at once,
 * so editing a saved document means holding the whole set in a draft again.
 *
 * Each line is a card rather than a table row. A line carries up to eight
 * fields, four of which only appear under some condition, and a fixed-width
 * table of that on a 354pt phone is a horizontal scroll nobody can fill in.
 *
 * ### The two quantities
 *
 * `qty_faktur` is what the paper says; `qty_diterima` is what was counted off
 * the truck. Leaving the second blank means "the same", which is the ordinary
 * case. Filling it lower is how a short delivery is recorded, and the contract
 * then requires `keterangan_selisih` — the difference is frozen at posting and
 * becomes the supplier's outstanding obligation, so an unexplained one is a
 * dispute nobody wrote down. It may never be *higher*: goods that were not
 * invoiced have no value, and their proportional share of the invoice would
 * corrupt the moving average permanently.
 *
 * Ported to Ramah with the rest of the section. `SearchPicker` (a debounced
 * search that expands inline) is replaced by `RamahPickerField` + the sheet
 * `RamahSearchSheet` opens over it — the field shows the *answer*, and the
 * search is a question raised over the screen rather than growing inside the
 * form. The satuan picker copies the sheet-of-options shape
 * `components/pembelian/turunan.tsx` already uses for the same choice on the
 * two documents that hang off this one.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahField,
  RamahIconButton,
  RamahNote,
  RamahPickerField,
  RamahSearchSheet,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  type RamahSearchOption,
} from '@/components/shell/ramah';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { decimalToNumber, numericToDecimal, rupiahToDecimal } from '@/services/decimal';
import type { PembelianLine, PembelianLineInput } from '@/services/pembelian';
import { getProduct, listProducts, listRiwayatBeli } from '@/services/produk';

const CARI_SIZE = 8;

export interface SatuanOption {
  id: number;
  nama: string;
  faktor: number;
}

export interface LineDraft {
  /**
   * Identity for React only. The server's row id cannot serve: a fresh line has
   * none, and `PUT .../detail` replaces the whole set anyway, so the ids that
   * come back are not the ones that went out.
   */
  key: string;
  idProduct: number | null;
  kode: string;
  nama: string;
  /**
   * `null` when the line came back from the server and its alternatives have
   * not been fetched. The unit is on the line already; the *other* units the
   * product accepts cost a `GET /product/{id}`, and doing that for every line on
   * open would be one request per row for a choice most lines never change.
   */
  satuan: SatuanOption[] | null;
  idSatuanInput: number | null;
  namaSatuan: string;
  qtyFaktur: string;
  /** Empty means "same as `qtyFaktur`", which is what the contract does with it. */
  qtyDiterima: string;
  harga: string;
  diskon: string;
  koli: string;
  keterangan: string;
  /** What this supplier last charged for this product, or '' when never bought. */
  riwayat: string;
}

let seq = 0;
function nextKey() {
  seq += 1;
  return `l${seq}`;
}

export function emptyLine(): LineDraft {
  return {
    key: nextKey(),
    idProduct: null,
    kode: '',
    nama: '',
    satuan: null,
    idSatuanInput: null,
    namaSatuan: '',
    qtyFaktur: '',
    qtyDiterima: '',
    harga: '',
    diskon: '',
    koli: '',
    keterangan: '',
    riwayat: '',
  };
}

/** Seeds the editor from a saved document, so reopening a draft shows what is stored. */
export function draftOfLine(line: PembelianLine): LineDraft {
  return {
    key: nextKey(),
    idProduct: line.idProduct,
    kode: line.kode,
    nama: line.nama,
    satuan: null,
    idSatuanInput: line.idSatuanInput,
    namaSatuan: line.namaSatuan,
    qtyFaktur: trimDecimal(line.qtyFaktur),
    // Only carried over when it genuinely differs: writing the same number into
    // both fields would turn every reopened draft into a short delivery needing
    // an explanation.
    qtyDiterima:
      line.qtyDiterimaDasar === line.qtyDasar ? '' : trimDecimal(line.qtyDiterima),
    harga: String(Math.round(decimalToNumber(line.hargaSatuanInput))),
    diskon: decimalToNumber(line.diskonBaris) ? String(Math.round(decimalToNumber(line.diskonBaris))) : '',
    koli: decimalToNumber(line.jumlahKoli) ? trimDecimal(line.jumlahKoli) : '',
    keterangan: line.keteranganSelisih ?? '',
    riwayat: '',
  };
}

/** `"100.0000"` reads as `100` in a field somebody is about to retype. */
function trimDecimal(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

/** What one line is worth before the nota-level discount, PPN, and rounding. */
export function lineSubtotal(line: LineDraft): number {
  const qty = Number(numericToDecimal(line.qtyFaktur) ?? '0');
  const harga = decimalToNumber(rupiahToDecimal(line.harga || '0'));
  const diskon = decimalToNumber(rupiahToDecimal(line.diskon || '0'));
  return Math.max(0, qty * harga - diskon);
}

export function linesSubtotal(lines: LineDraft[]): number {
  return lines.reduce((sum, l) => sum + lineSubtotal(l), 0);
}

export function linesKoli(lines: LineDraft[]): number {
  return lines.reduce((sum, l) => sum + Number(numericToDecimal(l.koli) ?? '0'), 0);
}

export type LinesResult =
  | { ok: true; detail: PembelianLineInput[] }
  | { ok: false; error: string };

/**
 * Validates the draft and builds the body.
 *
 * Everything checked here is something the server checks too — this is not a
 * second source of truth, it is the difference between a form that says which
 * line is wrong and a 400 that scrolls past. The one rule worth spelling out is
 * `qty x faktor` having to be a whole number: `qty_dasar` is a `BIGINT`, so half
 * a carton of twelve is 6 and half a carton of five is not expressible.
 */
export function linesToInput(lines: LineDraft[]): LinesResult {
  if (lines.length === 0) return { ok: false, error: 'Tambahkan minimal satu baris.' };

  const detail: PembelianLineInput[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const no = `Baris ${i + 1}`;
    if (line.idProduct === null) return { ok: false, error: `${no}: pilih produknya dulu.` };
    if (line.idSatuanInput === null) return { ok: false, error: `${no}: pilih satuannya dulu.` };

    const qtyFaktur = numericToDecimal(line.qtyFaktur);
    if (qtyFaktur === null || Number(qtyFaktur) <= 0) {
      return { ok: false, error: `${no}: qty faktur harus lebih dari nol.` };
    }
    const faktor = line.satuan?.find((s) => s.id === line.idSatuanInput)?.faktor ?? null;
    if (faktor !== null && !Number.isInteger(Number(qtyFaktur) * faktor)) {
      return {
        ok: false,
        error: `${no}: qty x faktor konversi (${faktor}) harus bilangan bulat.`,
      };
    }

    let qtyDiterima: string | null = null;
    if (line.qtyDiterima.trim() !== '') {
      qtyDiterima = numericToDecimal(line.qtyDiterima);
      if (qtyDiterima === null) return { ok: false, error: `${no}: qty diterima bukan angka.` };
      if (Number(qtyDiterima) > Number(qtyFaktur)) {
        return { ok: false, error: `${no}: qty diterima tidak boleh melebihi qty faktur.` };
      }
      if (Number(qtyDiterima) !== Number(qtyFaktur) && line.keterangan.trim() === '') {
        return { ok: false, error: `${no}: kiriman kurang wajib disertai keterangan selisih.` };
      }
    }

    const koli = line.koli.trim() === '' ? null : numericToDecimal(line.koli);
    if (line.koli.trim() !== '' && koli === null) {
      return { ok: false, error: `${no}: jumlah koli bukan angka.` };
    }

    detail.push({
      id_product: line.idProduct,
      id_satuan_input: line.idSatuanInput,
      qty_faktur: qtyFaktur,
      qty_diterima: qtyDiterima,
      harga_satuan_input: rupiahToDecimal(line.harga || '0'),
      diskon_baris: rupiahToDecimal(line.diskon || '0'),
      jumlah_koli: koli ?? '0',
      keterangan_selisih: line.keterangan.trim() || null,
    });
  }
  return { ok: true, detail };
}

// ---- the editor ----

/**
 * An updater, not a value — pass the `useState` setter straight in.
 *
 * Choosing a product writes to its line twice: once with the product and its
 * units, and again with the price after the history lookup lands. Handed a
 * plain `next` array, the second write would be built from the array as it
 * stood before the first, and the product it had just chosen would vanish.
 */
export type LinesUpdater = (updater: (prev: LineDraft[]) => LineDraft[]) => void;

export function PembelianLineEditor({
  lines,
  onChange,
  idSupplier,
  pakaiKoli,
  editable,
}: {
  lines: LineDraft[];
  onChange: LinesUpdater;
  /** Narrows the "last bought for" lookup to the supplier this document names. */
  idSupplier: number | null;
  /** The header carries freight to spread, so each line needs its carton share. */
  pakaiKoli: boolean;
  editable: boolean;
}) {
  const patch = useCallback(
    (key: string, next: Partial<LineDraft>) => {
      onChange((prev) => prev.map((l) => (l.key === key ? { ...l, ...next } : l)));
    },
    [onChange]
  );

  const remove = useCallback(
    (key: string) => onChange((prev) => prev.filter((l) => l.key !== key)),
    [onChange]
  );

  return (
    <View style={styles.group}>
      <RamahSectionHeader>
        {`Baris faktur · ${lines.length} baris · subtotal ${formatRupiah(linesSubtotal(lines))}`}
      </RamahSectionHeader>

      {lines.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada baris</Text>
          <Text style={styles.emptySub}>
            Satu baris per produk yang tertulis di faktur supplier. Dokumen tanpa baris tidak bisa
            diajukan.
          </Text>
        </View>
      ) : (
        lines.map((line, i) => (
          <LineRow
            key={line.key}
            index={i}
            line={line}
            idSupplier={idSupplier}
            pakaiKoli={pakaiKoli}
            editable={editable}
            onPatch={patch}
            onRemove={remove}
          />
        ))
      )}

      {editable && (
        <View style={styles.addBar}>
          <RamahSecondaryButton
            label="Tambah baris"
            icon="plus"
            onPress={() => onChange((prev) => [...prev, emptyLine()])}
          />
        </View>
      )}
    </View>
  );
}

function LineRow({
  index,
  line,
  idSupplier,
  pakaiKoli,
  editable,
  onPatch,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  idSupplier: number | null;
  pakaiKoli: boolean;
  editable: boolean;
  onPatch: (key: string, next: Partial<LineDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const [loadingSatuan, setLoadingSatuan] = useState(false);
  const [productSheet, setProductSheet] = useState(false);
  const [satuanSheet, setSatuanSheet] = useState(false);

  const cariProduk = useCallback(async (term: string): Promise<RamahSearchOption[]> => {
    const page = await listProducts({ search: term || undefined, size: CARI_SIZE, is_aktif: true });
    return page.data.map((p) => ({ value: String(p.id), label: p.nama, sub: p.kode }));
  }, []);

  /**
   * Choosing a product costs two more reads, and both earn their place: the
   * product's units, because `id_satuan_input` has to be one the product
   * actually registers (there is no foreign key to catch a wrong one, only a
   * 400), and the last price this supplier charged, which the contract names
   * this screen as the caller for. The second is allowed to fail quietly — a
   * missing hint is not worth blocking an entry over.
   */
  const pickProduct = useCallback(
    async (option: RamahSearchOption) => {
      const id = Number(option.value);
      setLoadingSatuan(true);
      try {
        const detail = await getProduct(id);
        const options: SatuanOption[] = detail.satuan.map((s) => ({
          id: s.idSatuan,
          nama: s.nama,
          faktor: s.faktor,
        }));
        const chosen = detail.satuan.find((s) => s.def) ?? detail.satuan[0];
        onPatch(line.key, {
          idProduct: id,
          kode: detail.kode,
          nama: detail.nama,
          satuan: options,
          idSatuanInput: chosen ? chosen.idSatuan : null,
          namaSatuan: chosen ? chosen.nama : '',
          riwayat: '',
        });

        if (idSupplier === null || !chosen) return;
        try {
          const page = await listRiwayatBeli(id, { id_supplier: idSupplier, size: 1 });
          const last = page.data[0];
          if (!last) return;
          // Scaled from the base-unit price, not copied from `harga_satuan_input`:
          // the stored figure follows whatever unit was typed last time, so
          // 12.000/DUS and 1.000/PCS are the same price wearing different faces.
          const perDasar = decimalToNumber(last.harga_satuan_dasar);
          onPatch(line.key, {
            harga: String(Math.round(perDasar * chosen.faktor)),
            riwayat: `Terakhir ${formatRupiah(perDasar)}/${last.nama_satuan_dasar ?? ''} · ${formatTanggal(last.tanggal)}`,
          });
        } catch {
          // No hint, no harm.
        }
      } catch {
        onPatch(line.key, { idProduct: null, satuan: null, riwayat: '' });
      } finally {
        setLoadingSatuan(false);
      }
    },
    [idSupplier, line.key, onPatch]
  );

  /** The alternatives, fetched only when somebody actually wants to change the unit. */
  const loadSatuan = useCallback(async () => {
    if (line.idProduct === null) return;
    setLoadingSatuan(true);
    try {
      const detail = await getProduct(line.idProduct);
      onPatch(line.key, {
        satuan: detail.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
      });
      setSatuanSheet(true);
    } catch {
      // Leaving `satuan` null keeps the stored unit on screen, which is correct.
    } finally {
      setLoadingSatuan(false);
    }
  }, [line.idProduct, line.key, onPatch]);

  const faktor = line.satuan?.find((s) => s.id === line.idSatuanInput)?.faktor ?? null;
  const kurang =
    line.qtyDiterima.trim() !== '' &&
    Number(line.qtyDiterima.replace(',', '.')) !== Number(line.qtyFaktur.replace(',', '.'));

  return (
    <View style={styles.lineBox}>
      <View style={styles.lineTop}>
        <Text style={styles.lineNo}>{`#${index + 1}`}</Text>
        <View style={styles.grow}>
          <RamahPickerField
            label="Produk"
            value={line.idProduct === null ? '' : `${line.kode} · ${line.nama}`}
            placeholder="Cari nama atau kode barang"
            locked={!editable}
            onPress={() => setProductSheet(true)}
          />
        </View>
        {editable && (
          <RamahIconButton
            icon="trash-2"
            label={`Hapus baris ${index + 1}`}
            onPress={() => onRemove(line.key)}
            color={C.danger}
          />
        )}
      </View>

      {line.riwayat !== '' ? <RamahNote icon="clock">{line.riwayat}</RamahNote> : null}

      <View style={styles.fieldRow}>
        <View style={styles.fieldCell}>
          <Text style={styles.miniLabel}>Satuan</Text>
          {loadingSatuan ? (
            <ActivityIndicator color={C.brand} style={styles.satuanLoading} />
          ) : (
            <SatuanChip
              nama={line.namaSatuan}
              editable={editable}
              onPress={
                line.satuan === null ? () => void loadSatuan() : () => setSatuanSheet(true)
              }
            />
          )}
        </View>
        <View style={styles.fieldCell}>
          <RamahField
            label="Qty faktur"
            value={line.qtyFaktur}
            onChangeText={(v) => onPatch(line.key, { qtyFaktur: v })}
            keyboardType="numeric"
            placeholder="0"
            editable={editable}
            helper={faktor !== null && faktor !== 1 ? `×${faktor} satuan dasar` : undefined}
          />
        </View>
        <View style={styles.fieldCell}>
          <RamahField
            label="Qty diterima"
            value={line.qtyDiterima}
            onChangeText={(v) => onPatch(line.key, { qtyDiterima: v })}
            keyboardType="numeric"
            placeholder={line.qtyFaktur || '0'}
            editable={editable}
            helper="Kosong berarti sama dengan qty faktur"
          />
        </View>
        <View style={styles.fieldCell}>
          <RamahField
            label="Harga / satuan"
            prefix="Rp"
            value={line.harga}
            onChangeText={(v) => onPatch(line.key, { harga: v })}
            keyboardType="numeric"
            placeholder="0"
            editable={editable}
          />
        </View>
        <View style={styles.fieldCell}>
          <RamahField
            label="Diskon baris"
            prefix="Rp"
            value={line.diskon}
            onChangeText={(v) => onPatch(line.key, { diskon: v })}
            keyboardType="numeric"
            placeholder="0"
            editable={editable}
          />
        </View>
        {pakaiKoli && (
          <View style={styles.fieldCell}>
            <RamahField
              label="Jumlah koli"
              value={line.koli}
              onChangeText={(v) => onPatch(line.key, { koli: v })}
              keyboardType="numeric"
              placeholder="0"
              editable={editable}
            />
          </View>
        )}
      </View>

      {kurang && (
        <RamahField
          label="Keterangan selisih"
          required
          value={line.keterangan}
          onChangeText={(v) => onPatch(line.key, { keterangan: v })}
          placeholder="Kurang 5 pcs, supplier janji kirim susulan minggu depan"
          editable={editable}
          multiline
        />
      )}

      <View style={styles.lineFoot}>
        <Text style={styles.lineFootLabel}>Subtotal baris</Text>
        <Text style={styles.lineFootValue}>{formatRupiah(lineSubtotal(line))}</Text>
      </View>

      <RamahSearchSheet
        visible={productSheet}
        title="Cari produk"
        onClose={() => setProductSheet(false)}
        search={cariProduk}
        onPick={(o) => void pickProduct(o)}
        placeholder="Cari nama atau kode barang"
        emptyHint="Tidak ada produk aktif yang cocok."
      />

      <RamahSheet
        visible={satuanSheet}
        title={`Satuan ${line.nama || line.kode}`}
        onClose={() => setSatuanSheet(false)}>
        {(line.satuan ?? []).map((s) => (
          <RamahSheetOption
            key={s.id}
            label={s.faktor === 1 ? s.nama : `${s.nama} (×${s.faktor})`}
            selected={s.id === line.idSatuanInput}
            onPress={() => {
              onPatch(line.key, { idSatuanInput: s.id, namaSatuan: s.nama });
              setSatuanSheet(false);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/** The unit chip beside the qty fields — a read-only pill when the row cannot be edited. */
function SatuanChip({
  nama,
  editable,
  onPress,
}: {
  nama: string;
  editable: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={editable ? onPress : undefined}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={!editable}
      accessibilityRole="button"
      accessibilityLabel={`Satuan ${nama || '—'}${editable ? '. Ganti satuan' : ''}`}
      style={[styles.satuanChip, down && editable && styles.satuanChipDown]}>
      <Text style={styles.satuanChipText} numberOfLines={1}>
        {nama || '—'}
      </Text>
      {editable ? <Feather name="chevron-down" size={RamahIcon.meta} color={C.iconMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  group: { gap: L.cardGap },

  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.rowTitle, color: C.textTitle },
  emptySub: { ...T.caption, color: C.textBody },

  lineBox: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space3,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-end', gap: L.space2 },
  lineNo: { ...T.caption, color: C.textMuted, paddingBottom: 10 },

  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space3 },
  fieldCell: { flexGrow: 1, flexBasis: 130 },
  miniLabel: { ...T.fieldLabel, color: C.textBody, marginBottom: 6 },
  satuanLoading: { alignSelf: 'flex-start' },

  satuanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: L.controlHSm,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderHairline,
    backgroundColor: C.white,
  },
  satuanChipDown: { backgroundColor: C.surfaceStack },
  satuanChipText: { ...T.caption, color: C.textTitle },

  lineFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: L.space3,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
    paddingTop: L.space2,
  },
  lineFootLabel: { ...T.caption, color: C.textBody },
  lineFootValue: { ...T.rowTitle, color: C.textTitle },

  addBar: { alignItems: 'flex-start' },
});
