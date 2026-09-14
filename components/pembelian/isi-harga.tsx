/**
 * The last step of a new nota — "Harga beli": what each line costs, before the
 * document is created.
 *
 * It sits **after** the supplier on purpose. A purchase price is a fact about a
 * supplier, and the only opening figure this app can honestly offer is the
 * last price *that* supplier was paid for the product
 * (`GET /product/{id}/riwayat-beli`, `harga_satuan_dasar`, scaled by the chosen
 * unit's `faktor`). Asking for prices before the supplier is known would mean
 * either empty fields or somebody else's price.
 *
 * Before this step existed the flow sent that history figure — or zero — and
 * left the real price to be typed on the draft through "Ubah" on its lines,
 * which nobody could find. A price is the one number on a purchase line that is
 * almost never right by default, so it gets a screen in the flow rather than a
 * detour after it.
 *
 * An empty field blocks creating the nota; a typed 0 does not, because a bonus
 * item on a faktur is ordinary and is the one case where zero is the real price.
 */
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';

import type { BarangDipilih } from './pilih-barang';

export interface BarisHarga {
  /** `${idProduct}:${idSatuan}` — a price typed per rim is not a price per lembar. */
  key: string;
  barang: BarangDipilih;
  /** Whole rupiah as digits, '' when neither typed nor known from history. */
  harga: string;
  /** Date of the history price the field is still showing, or `null`. */
  terakhir: string | null;
}

export function IsiHargaStep({
  namaPemasok,
  baris,
  riwayatLoading,
  onHarga,
  onBack,
  onBuat,
  membuat,
  buatErr,
  dockPad,
}: {
  namaPemasok: string;
  baris: readonly BarisHarga[];
  riwayatLoading: boolean;
  onHarga: (key: string, digits: string) => void;
  onBack: () => void;
  onBuat: () => void;
  membuat: boolean;
  buatErr: string;
  dockPad: number;
}) {
  const subtotal = baris.reduce(
    (sum, b) => sum + b.barang.qty * (b.harga === '' ? 0 : parseInt(b.harga, 10)),
    0
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Harga beli" onBack={onBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.pemasok} numberOfLines={1}>
            {namaPemasok}
          </Text>
          {riwayatLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={C.brand} />
              <Text style={styles.loadingText}>Membaca harga terakhir…</Text>
            </View>
          ) : null}
        </View>

        {baris.map((b) => {
          const nilai = b.barang.qty * (b.harga === '' ? 0 : parseInt(b.harga, 10));
          return (
            <View key={b.key} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.grow}>
                  <Text style={styles.nama} numberOfLines={2}>
                    {b.barang.nama}
                  </Text>
                  <Text style={styles.qty}>
                    {`${formatNumber(b.barang.qty)} ${b.barang.namaSatuan}`}
                  </Text>
                </View>
                <Text style={styles.nilai} numberOfLines={1}>
                  {formatRupiah(nilai)}
                </Text>
              </View>
              <RamahField
                label={`Harga per ${b.barang.namaSatuan || 'satuan'}`}
                required
                value={b.harga}
                onChangeText={(v) => onHarga(b.key, v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                prefix="Rp"
                placeholder="0"
                helper={b.terakhir ? `Harga terakhir · ${formatTanggal(b.terakhir)}` : undefined}
                accessibilityLabel={`Harga beli ${b.barang.nama} per ${b.barang.namaSatuan}`}
              />
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatRupiah(subtotal)}</Text>
        </View>
        {buatErr ? <RamahInlineError message={buatErr} /> : null}
        <RamahPrimaryButton
          label={membuat ? 'Membuat nota…' : 'Buat nota pembelian'}
          icon="file-plus"
          onPress={onBuat}
          disabled={membuat}
          busy={membuat}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space8,
    gap: L.stack,
  },

  intro: { gap: L.inline },
  pemasok: { ...T.titleSmall, color: C.textTitle },
  loading: { flexDirection: 'row', alignItems: 'center', gap: L.related },
  loadingText: { ...T.bodySmall, color: C.textBody },

  card: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.stack,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  nama: { ...T.titleTiny, color: C.textTitle },
  qty: { ...T.bodySmall, color: C.textBody },
  nilai: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', maxWidth: 140 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { ...T.bodyModerate, color: C.textBody },
  totalValue: { ...T.titleSmall, color: C.textTitle },
});
