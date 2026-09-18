/**
 * The line editor for a document that takes goods **out of one room** —
 * `mutasi` and `pemakaian`.
 *
 * Both point at products directly rather than at another document's lines, both
 * allow the same product more than once (2 DUS and 3 PCS are two valid lines),
 * and both are capped by one thing: the balance of the room the goods leave,
 * summed over every line for that product. So one editor, in `shell/` because two
 * sections share it — a second copy is how the wording drifts apart.
 *
 * ## The cap is written before anything is typed
 *
 * The rule `components/pembelian/turunan.tsx` exists to protect holds here too:
 * the limit is printed under the quantity the moment a product is chosen, and
 * going past it is **allowed and then said in red** rather than refused. The
 * balance is a reading taken when the product was picked; the check that decides
 * runs at posting, under the trigger's lock, and a field that refuses what
 * somebody is reading off the shelf is worse than one that disagrees out loud.
 *
 * ## Where the balance comes from
 *
 * `GET /pos/product` for the room — units and `stok_akhir` for a whole page in
 * three queries. It answers active products only, which is also the right set to
 * move or use. A line loaded from a saved document carries neither its units nor
 * a balance, so `lengkapiBaris` reads them once per distinct product when the
 * editor opens, and again whenever the room changes: a balance quoted for the
 * wrong room is a wrong number, not an approximate one.
 */
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RamahField,
  RamahIconButton,
  RamahPickerField,
  RamahSearchSheet,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  type RamahSearchOption,
} from '@/components/shell/ramah';
import { formatNumber } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { numericToDecimal } from '@/services/decimal';
import { getProduct, listPosProducts, type PosProductRow } from '@/services/produk';

const CARI_SIZE = 8;

export interface SatuanBaris {
  id: number;
  nama: string;
  /** How many base units one of these holds. */
  faktor: number;
}

export interface BarisDraft {
  key: string;
  idProduct: number | null;
  kode: string;
  nama: string;
  /** Every unit the product registers, or `null` until read. */
  satuan: SatuanBaris[] | null;
  idSatuan: number | null;
  namaSatuan: string;
  faktor: number;
  /** As typed; parsed only when saving. */
  qty: string;
  keterangan: string;
  /** Balance in base units in the room the goods leave, or `null` when unknown. */
  stok: number | null;
  namaDasar: string;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `baris-${seq}`;
}

export function barisKosong(): BarisDraft {
  return {
    key: nextKey(),
    idProduct: null,
    kode: '',
    nama: '',
    satuan: null,
    idSatuan: null,
    namaSatuan: '',
    faktor: 1,
    qty: '',
    keterangan: '',
    stok: null,
    namaDasar: '',
  };
}

/** The fields both documents' saved lines carry. */
export interface BarisTersimpanBarang {
  idProduct: number;
  kode: string;
  nama: string;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
  qtyInput: string;
  namaSatuanDasar: string;
  keterangan?: string;
}

/** Seeds the editor from a saved document. Units and balance follow from `lengkapiBaris`. */
export function barisDari(lines: readonly BarisTersimpanBarang[]): BarisDraft[] {
  return lines.map((l) => {
    const n = Number(l.qtyInput);
    return {
      key: nextKey(),
      idProduct: l.idProduct,
      kode: l.kode,
      nama: l.nama,
      satuan: null,
      idSatuan: l.idSatuanInput,
      namaSatuan: l.namaSatuan,
      faktor: l.faktor,
      // "30.0000" is thirty, and a field showing the padding invites an edit.
      qty: Number.isFinite(n) ? String(n) : l.qtyInput,
      keterangan: l.keterangan ?? '',
      stok: null,
      namaDasar: l.namaSatuanDasar,
    };
  });
}

/**
 * Fills in units and the balance in `idRuang` for every chosen product — one
 * `GET /pos/product` per **distinct** product, searched by its code, whose exact
 * match the endpoint sorts to the top.
 *
 * A product the read does not return (retired since the line was written, or the
 * read failed) keeps `stok: null`: no limit is printed, which is honest, rather
 * than a zero, which would paint every line red.
 */
export async function lengkapiBaris(
  drafts: readonly BarisDraft[],
  idRuang: number
): Promise<BarisDraft[]> {
  const ids = [...new Set(drafts.map((d) => d.idProduct).filter((id): id is number => id !== null))];
  const found = new Map<number, PosProductRow>();
  await Promise.allSettled(
    ids.map(async (id) => {
      const kode = drafts.find((d) => d.idProduct === id)?.kode ?? '';
      if (kode === '') return;
      const page = await listPosProducts({ id_ruang: idRuang, search: kode, size: 5 });
      const hit = page.data.find((p) => p.id === id);
      if (hit) found.set(id, hit);
    })
  );
  return drafts.map((d) => {
    if (d.idProduct === null) return d;
    const p = found.get(d.idProduct);
    if (!p) return { ...d, stok: null };
    const satuan = p.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor }));
    // The stored `faktor` is a snapshot; the server converts with today's, so
    // today's is what the editor should be multiplying by.
    const unit = satuan.find((s) => s.id === d.idSatuan);
    return {
      ...d,
      satuan,
      faktor: unit?.faktor ?? d.faktor,
      stok: p.stokAkhir,
      namaDasar: p.dasar?.nama ?? d.namaDasar,
    };
  });
}

/**
 * Folds what `lengkapiBaris` read back into the lines **as they are now**.
 *
 * The read takes a moment, and somebody may have typed a quantity or removed a
 * row meanwhile; replacing the array wholesale would undo that. So only the four
 * fields the read owns are copied, and only onto a row still holding the same
 * product.
 */
export function terapkanLengkap(
  prev: readonly BarisDraft[],
  lengkap: readonly BarisDraft[]
): BarisDraft[] {
  const byKey = new Map(lengkap.map((d) => [d.key, d]));
  return prev.map((d) => {
    const u = byKey.get(d.key);
    if (!u || u.idProduct !== d.idProduct) return d;
    return { ...d, satuan: u.satuan ?? d.satuan, faktor: u.faktor, stok: u.stok, namaDasar: u.namaDasar };
  });
}

function qtyAngka(qty: string): number | null {
  const dec = numericToDecimal(qty);
  return dec === null ? null : Number(dec);
}

/** Base-unit total per product across every line — what the room's balance caps. */
export function totalPerProduk(drafts: readonly BarisDraft[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of drafts) {
    const n = qtyAngka(d.qty);
    if (d.idProduct === null || n === null) continue;
    out.set(d.idProduct, (out.get(d.idProduct) ?? 0) + n * d.faktor);
  }
  return out;
}

export interface BarisInput {
  id_product: number;
  id_satuan_input: number;
  qty_input: string;
  keterangan?: string | null;
}

export type BarisResult = { ok: true; detail: BarisInput[] } | { ok: false; error: string };

/**
 * The lines as a request body, or the first thing wrong with them.
 *
 * A row with no product and no quantity is the one "Tambah barang" left behind
 * and is dropped silently. `minimalSatu` is for `PUT .../detail`, which refuses an
 * empty set; the create endpoints accept one. Going over the balance is **not** an
 * error here — see the module header.
 */
export function barisToInput(
  drafts: readonly BarisDraft[],
  opts: { minimalSatu: boolean; pakaiKeterangan: boolean }
): BarisResult {
  const detail: BarisInput[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const nomor = i + 1;
    if (d.idProduct === null && d.qty.trim() === '') continue;
    if (d.idProduct === null) return { ok: false, error: `Baris ${nomor}: pilih barangnya.` };
    if (d.idSatuan === null) return { ok: false, error: `Baris ${nomor}: pilih satuannya.` };
    const dec = numericToDecimal(d.qty);
    const n = dec === null ? null : Number(dec);
    if (dec === null || n === null || n <= 0) {
      return { ok: false, error: `Baris ${nomor}: isi jumlah lebih dari 0.` };
    }
    // `qty x faktor` has to land on a whole base unit — `kartu_stok` counts
    // nothing smaller. Compared with a tolerance because 0.1 × 10 is not 1 in
    // binary floating point.
    const dasar = n * d.faktor;
    if (Math.abs(dasar - Math.round(dasar)) > 1e-9) {
      return {
        ok: false,
        error: `Baris ${nomor}: ${d.qty} ${d.namaSatuan} bukan jumlah ${d.namaDasar || 'satuan dasar'} yang bulat.`,
      };
    }
    const line: BarisInput = { id_product: d.idProduct, id_satuan_input: d.idSatuan, qty_input: dec };
    if (opts.pakaiKeterangan) line.keterangan = d.keterangan.trim() || null;
    detail.push(line);
  }
  if (opts.minimalSatu && detail.length === 0) {
    return { ok: false, error: 'Tambahkan minimal satu barang.' };
  }
  return { ok: true, detail };
}

export type BarisUpdater = (updater: (prev: BarisDraft[]) => BarisDraft[]) => void;

export function BarisBarangEditor({
  judul,
  drafts,
  onChange,
  idRuang,
  pakaiKeterangan,
}: {
  judul: string;
  drafts: BarisDraft[];
  onChange: BarisUpdater;
  /** The room the goods leave. `null` locks the picker: there is no balance to quote yet. */
  idRuang: number | null;
  pakaiKeterangan: boolean;
}) {
  const patch = useCallback(
    (key: string, next: Partial<BarisDraft>) =>
      onChange((prev) => prev.map((d) => (d.key === key ? { ...d, ...next } : d))),
    [onChange]
  );
  const remove = useCallback(
    (key: string) => onChange((prev) => prev.filter((d) => d.key !== key)),
    [onChange]
  );

  const totals = totalPerProduk(drafts);

  return (
    <View style={styles.group}>
      <RamahSectionHeader>{drafts.length ? `${judul} · ${drafts.length} baris` : judul}</RamahSectionHeader>

      {drafts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada barang</Text>
        </View>
      ) : (
        drafts.map((d, i) => (
          <BarisRow
            key={d.key}
            index={i}
            draft={d}
            idRuang={idRuang}
            totalDasar={d.idProduct === null ? 0 : (totals.get(d.idProduct) ?? 0)}
            pakaiKeterangan={pakaiKeterangan}
            onPatch={patch}
            onRemove={remove}
          />
        ))
      )}

      <View style={styles.addBar}>
        <RamahSecondaryButton
          label="Tambah barang"
          icon="plus"
          disabled={idRuang === null}
          onPress={() => onChange((prev) => [...prev, barisKosong()])}
        />
      </View>
    </View>
  );
}

function BarisRow({
  index,
  draft,
  idRuang,
  totalDasar,
  pakaiKeterangan,
  onPatch,
  onRemove,
}: {
  index: number;
  draft: BarisDraft;
  idRuang: number | null;
  /** This product's base-unit total across **every** line, not just this one. */
  totalDasar: number;
  pakaiKeterangan: boolean;
  onPatch: (key: string, next: Partial<BarisDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const [produkSheet, setProdukSheet] = useState(false);
  const [satuanSheet, setSatuanSheet] = useState(false);
  const [loadingSatuan, setLoadingSatuan] = useState(false);
  /**
   * The rows behind the options last shown, so a pick needs no second read. Read
   * only inside callbacks — never during render — which is what keeps it a ref.
   */
  const hasil = useRef<Map<number, PosProductRow>>(new Map());

  const cari = useCallback(
    async (term: string): Promise<RamahSearchOption[]> => {
      if (idRuang === null) return [];
      const page = await listPosProducts({
        id_ruang: idRuang,
        search: term || undefined,
        size: CARI_SIZE,
      });
      hasil.current = new Map(page.data.map((p) => [p.id, p]));
      // The balance is the one thing worth reading in this list: it is the cap.
      return page.data.map((p) => ({
        value: String(p.id),
        label: p.nama,
        sub: `Stok ${formatNumber(p.stokAkhir)} ${p.dasar?.nama ?? ''}`.trim(),
      }));
    },
    [idRuang]
  );

  const pilihProduk = useCallback(
    (option: RamahSearchOption) => {
      const p = hasil.current.get(Number(option.value));
      if (!p) return;
      const awal = p.satuan.find((s) => s.def) ?? p.dasar ?? p.satuan[0] ?? null;
      onPatch(draft.key, {
        idProduct: p.id,
        kode: p.kode,
        nama: p.nama,
        satuan: p.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
        idSatuan: awal?.idSatuan ?? null,
        namaSatuan: awal?.nama ?? '',
        faktor: awal?.faktor ?? 1,
        stok: p.stokAkhir,
        namaDasar: p.dasar?.nama ?? '',
      });
    },
    [draft.key, onPatch]
  );

  /** Only a line seeded from a saved document can reach this with no unit list. */
  const bukaSatuan = useCallback(async () => {
    if (draft.satuan !== null) {
      setSatuanSheet(true);
      return;
    }
    if (draft.idProduct === null) return;
    setLoadingSatuan(true);
    try {
      const detail = await getProduct(draft.idProduct);
      onPatch(draft.key, {
        satuan: detail.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
      });
      setSatuanSheet(true);
    } catch {
      // The stored unit stays on screen, which is still correct.
    } finally {
      setLoadingSatuan(false);
    }
  }, [draft.idProduct, draft.key, draft.satuan, onPatch]);

  const n = qtyAngka(draft.qty);
  const dasar = n === null ? null : n * draft.faktor;
  const lebih = draft.stok !== null && totalDasar > draft.stok;

  const helper: string[] = [];
  if (dasar !== null && draft.faktor !== 1) helper.push(`= ${formatNumber(dasar)} ${draft.namaDasar}`);
  if (draft.stok !== null) helper.push(`stok ${formatNumber(draft.stok)} ${draft.namaDasar}`);

  return (
    <View style={styles.lineBox}>
      <View style={styles.lineTop}>
        <View style={styles.grow}>
          <RamahPickerField
            label="Barang"
            value={draft.idProduct === null ? '' : draft.nama}
            placeholder={idRuang === null ? 'Pilih gudang dulu' : 'Cari nama barang'}
            locked={idRuang === null}
            onPress={() => setProdukSheet(true)}
          />
        </View>
        <RamahIconButton
          icon="trash-2"
          label={`Hapus baris ${index + 1}`}
          onPress={() => onRemove(draft.key)}
          color={C.danger}
        />
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.fieldCell}>
          <Text style={styles.miniLabel}>Satuan</Text>
          {loadingSatuan ? (
            <ActivityIndicator color={C.brand} style={styles.satuanLoading} />
          ) : (
            <SatuanChip
              nama={draft.namaSatuan}
              disabled={draft.idProduct === null}
              onPress={() => void bukaSatuan()}
            />
          )}
        </View>
        <View style={styles.fieldCell}>
          <RamahField
            label="Jumlah"
            required
            value={draft.qty}
            onChangeText={(v) => onPatch(draft.key, { qty: v })}
            keyboardType="numeric"
            placeholder="0"
            // Going past the balance is said, not refused — see the module header.
            error={
              lebih
                ? `Melebihi stok ${formatNumber(draft.stok ?? 0)} ${draft.namaDasar}`
                : undefined
            }
            helper={helper.length ? helper.join(' · ') : undefined}
          />
        </View>
      </View>

      {pakaiKeterangan ? (
        <RamahField
          label="Keterangan"
          value={draft.keterangan}
          onChangeText={(v) => onPatch(draft.key, { keterangan: v })}
          placeholder="Opsional"
          maxLength={500}
        />
      ) : null}

      <RamahSearchSheet
        visible={produkSheet}
        title="Cari barang"
        onClose={() => setProdukSheet(false)}
        search={cari}
        onPick={pilihProduk}
        placeholder="Cari nama barang"
        emptyHint="Tidak ada barang aktif yang cocok di gudang ini."
      />

      <RamahSheet
        visible={satuanSheet}
        title={`Satuan ${draft.nama}`}
        onClose={() => setSatuanSheet(false)}>
        {(draft.satuan ?? []).map((s) => (
          <RamahSheetOption
            key={s.id}
            label={s.faktor === 1 ? s.nama : `${s.nama} (×${s.faktor})`}
            selected={s.id === draft.idSatuan}
            onPress={() => {
              onPatch(draft.key, { idSatuan: s.id, namaSatuan: s.nama, faktor: s.faktor });
              setSatuanSheet(false);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/**
 * One saved line, read-only, for a `RamahStackCard` on the detail screens.
 *
 * `rincian` is whatever second fact the document has about the line — the base
 * quantity, or what an approver allowed — and `nilai` is drawn only once the
 * trigger has priced it, never before.
 */
export function BarisTerbaca({
  nama,
  jumlah,
  rincian,
  nilai,
  catatan,
}: {
  nama: string;
  jumlah: string;
  rincian?: string;
  nilai?: string;
  catatan?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={[nama, jumlah, rincian, nilai, catatan].filter(Boolean).join(', ')}
      style={styles.readRow}>
      <View style={styles.grow}>
        <Text style={styles.readTitle} numberOfLines={2}>
          {nama}
        </Text>
        <Text style={styles.readSub} numberOfLines={2}>
          {rincian ? `${jumlah} · ${rincian}` : jumlah}
        </Text>
        {catatan ? (
          <Text style={styles.readSub} numberOfLines={2}>
            {catatan}
          </Text>
        ) : null}
      </View>
      {nilai ? <Text style={styles.readValue}>{nilai}</Text> : null}
    </View>
  );
}

/** The unit chip beside the quantity, the same insides as the one on a pembelian line. */
function SatuanChip({
  nama,
  disabled,
  onPress,
}: {
  nama: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`Satuan ${nama || '—'}. Ganti satuan`}
      style={[styles.satuanChip, down && !disabled && styles.satuanChipDown, disabled && styles.off]}>
      <Text style={styles.satuanChipText} numberOfLines={1}>
        {nama || '—'}
      </Text>
      <Feather name="chevron-down" size={RamahIcon.meta} color={C.iconMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  off: { opacity: 0.4 },
  group: { gap: L.stack },

  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
  },
  emptyTitle: { ...T.bodySmall, color: C.textBody },

  lineBox: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space3,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-end', gap: L.space2 },

  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space3 },
  fieldCell: { flexGrow: 1, flexBasis: 130 },
  miniLabel: { ...T.caption, color: C.textBody, marginBottom: L.inline },
  satuanLoading: { alignSelf: 'flex-start' },

  satuanChip: {
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
  satuanChipDown: { backgroundColor: C.surfaceStack },
  satuanChipText: { ...T.bodySmall, color: C.textTitle },

  addBar: { alignItems: 'flex-start' },

  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  readTitle: { ...T.titleTiny, color: C.textTitle },
  readSub: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },
  readValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', flexShrink: 0 },
});
