/**
 * H3 — check the reading before it becomes a real document.
 *
 * Two groups, not the board's three-tier badge: the contract carries no
 * confidence score at all (`OCRPembelianBaris.indeks_usulan` is
 * `number | null`, recognised or not), so this is matched-and-editable versus
 * unmatched-and-informational, full stop. Inventing a middle tier on the one
 * screen whose entire job is to be checked would be worse than not drawing it.
 *
 * A `FlatList` rather than the `ScrollView` `IsiHargaStep` uses for the manual
 * flow's price step — a faktur with several dozen lines is the case OCR exists
 * for, unlike a hand-picked list from `pilih-barang`.
 *
 * Money and quantity fields hold the raw decimal strings the server sent,
 * edited in place and sent back as-is — never round-tripped through
 * `services/decimal.ts`, which is for converting a value a human typed as
 * whole rupiah. These already arrived as the decimal strings `POST /pembelian`
 * wants.
 */
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import { formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import type { OcrBaris, OcrInfo } from '@/services/ocr-pembelian';
import type { PembelianLineInput } from '@/services/pembelian';

type Entry =
  | { kind: 'peringatan'; key: 'peringatan' }
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'matched'; key: string; index: number; baris: OcrBaris | undefined; line: PembelianLineInput }
  | { kind: 'unmatched'; key: string; baris: OcrBaris };

export function OcrPeriksaStep({
  namaPemasok,
  ocr,
  detail,
  onQty,
  onHarga,
  onBack,
  onBuat,
  membuat,
  buatErr,
  dockPad,
}: {
  namaPemasok: string;
  ocr: OcrInfo;
  detail: readonly PembelianLineInput[];
  onQty: (index: number, value: string) => void;
  onHarga: (index: number, value: string) => void;
  onBack: () => void;
  onBuat: () => void;
  membuat: boolean;
  buatErr: string;
  dockPad: number;
}) {
  const barisByIndex = useMemo(() => {
    const m = new Map<number, OcrBaris>();
    for (const b of ocr.baris) {
      if (b.indeks_usulan !== null && b.indeks_usulan !== undefined) m.set(b.indeks_usulan, b);
    }
    return m;
  }, [ocr.baris]);

  const unmatched = useMemo(
    () => ocr.baris.filter((b) => b.indeks_usulan === null || b.indeks_usulan === undefined),
    [ocr.baris]
  );

  const supplierBeda = !!ocr.supplier_terbaca && ocr.supplier_terbaca !== namaPemasok;
  const totalBeda = !!ocr.total_terbaca && ocr.total_terbaca !== ocr.total_dihitung;
  const adaPeringatan = ocr.peringatan.length > 0 || supplierBeda || totalBeda;

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    if (adaPeringatan) out.push({ kind: 'peringatan', key: 'peringatan' });
    out.push({ kind: 'heading', key: 'h-matched', label: `Baris terbaca (${detail.length})` });
    detail.forEach((line, index) =>
      out.push({ kind: 'matched', key: `m-${index}`, index, baris: barisByIndex.get(index), line })
    );
    if (unmatched.length) {
      out.push({ kind: 'heading', key: 'h-unmatched', label: `Belum cocok (${unmatched.length})` });
      unmatched.forEach((b, i) => out.push({ kind: 'unmatched', key: `u-${i}`, baris: b }));
    }
    return out;
  }, [adaPeringatan, detail, barisByIndex, unmatched]);

  const renderItem = ({ item }: { item: Entry }) => {
    if (item.kind === 'peringatan') {
      return (
        <View style={styles.peringatanBox}>
          {supplierBeda ? (
            <Text style={styles.peringatanLine}>
              {`Kop dokumen menyebut "${ocr.supplier_terbaca}" — pemasok yang dipilih: ${namaPemasok}.`}
            </Text>
          ) : null}
          {totalBeda ? (
            <Text style={styles.peringatanLine}>
              {`Total tertulis ${formatRupiah(ocr.total_terbaca!)}, total dari baris ${formatRupiah(ocr.total_dihitung)}.`}
            </Text>
          ) : null}
          {ocr.peringatan.map((p, i) => (
            <Text key={i} style={styles.peringatanLine}>
              {p}
            </Text>
          ))}
        </View>
      );
    }
    if (item.kind === 'heading') {
      return (
        <View style={styles.listHeading}>
          <RamahSectionHeader>{item.label}</RamahSectionHeader>
        </View>
      );
    }
    if (item.kind === 'matched') {
      return (
        <View style={styles.card}>
          <Text style={styles.nama} numberOfLines={2}>
            {item.baris?.nama_product || `Baris ${item.index + 1}`}
          </Text>
          {item.baris?.teks_asli ? (
            <Text style={styles.asli} numberOfLines={1}>
              {`"${item.baris.teks_asli}"`}
            </Text>
          ) : null}
          <View style={styles.row2}>
            <View style={styles.grow}>
              <RamahField
                label="Qty faktur"
                required
                value={item.line.qty_faktur}
                onChangeText={(v) => onQty(item.index, v.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.grow}>
              <RamahField
                label="Harga satuan"
                required
                value={item.line.harga_satuan_input}
                onChangeText={(v) => onHarga(item.index, v.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                prefix="Rp"
              />
            </View>
          </View>
        </View>
      );
    }
    const meta = [
      item.baris.qty ? `Qty ${item.baris.qty}` : null,
      item.baris.harga ? formatRupiah(item.baris.harga) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={styles.unmatchedCard}>
        <Text style={styles.nama} numberOfLines={2}>
          {item.baris.teks_asli}
        </Text>
        <Text style={styles.unmatchedMeta}>{meta || 'Tidak terbaca'}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <RamahHeader title="Periksa hasil baca" onBack={onBack} />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {buatErr ? <RamahInlineError message={buatErr} /> : null}
        <RamahPrimaryButton
          label={membuat ? 'Membuat nota…' : 'Buat nota pembelian'}
          icon="file-plus"
          onPress={onBuat}
          disabled={membuat || detail.length === 0}
          busy={membuat}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },

  listHeading: { paddingTop: L.group - L.stack, paddingBottom: L.related },

  peringatanBox: {
    backgroundColor: C.amber50,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.inline,
    marginBottom: L.stack,
  },
  peringatanLine: { ...T.bodySmall, color: C.amber700 },

  card: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.stack,
    marginBottom: L.stack,
  },
  nama: { ...T.titleTiny, color: C.textTitle },
  asli: { ...T.bodySmall, color: C.textMuted },
  row2: { flexDirection: 'row', gap: L.stack },

  unmatchedCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderStyle: 'dashed',
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.inline,
    marginBottom: L.stack,
  },
  unmatchedMeta: { ...T.bodySmall, color: C.textMuted },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
