/**
 * Laporan — the two reports that are safe to open cold, and a way into the third.
 *
 * **Nilai persediaan** answers "what is the stock worth right now" and takes no
 * period at all — it is a balance, not a flow. **Laba kotor** answers "did we
 * make money last month" and is one row per calendar month inside a range. Both
 * are small responses whatever the shop's size: one row per room, one row per
 * month.
 *
 * **Pergerakan is a route of its own**, and that is a consequence of the
 * contract rather than a layout preference. It is the one report with no paging
 * *and* no natural bound — a row per `(barang, ruang, jenis_transaksi)` over
 * whatever range is asked for — so a shop with four hundred products would open
 * this screen and pull thousands of rows it did not ask for. It gets its own
 * screen where the filters are the first thing on it.
 *
 * ## The one arithmetic trap on this screen, and why it is not committed here
 *
 * `LabaKotor.total_penjualan` is **already net of PPN**. Output VAT collected at
 * the till is the state's money passing through a receipt, not the shop's
 * revenue, and the contract separates it precisely so a report does not overstate
 * the margin by exactly the tax every month. So this screen prints turnover, cost
 * and profit, and prints `total_ppn` as its own line clearly labelled as tax
 * collected — it never adds the two into something called sales.
 *
 * ## Why there is no period picker
 *
 * The range is the last twelve months, fixed, and the screen says so. A picker
 * would be three more controls on a screen whose whole job is to show four
 * numbers, and the report is one row per month — scrolling twelve rows is
 * cheaper than choosing which twelve. The day a shop needs a specific quarter,
 * the endpoint already takes `dari`/`sampai` and this is where it goes.
 */
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahSectionHeader,
  RamahStackCard,
} from '@/components/shell/ramah';
import { formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import {
  laporanLabaKotor,
  laporanNilaiPersediaan,
  namaBulan,
  type LabaKotor,
  type NilaiPersediaan,
} from '@/services/laporan';

/** Twelve months back from the first of this one. See the file header. */
function rentangSetahun(): { dari: string; sampai: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const mulai = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  // Built from local parts rather than `toISOString()`, which converts to UTC
  // first and east of Greenwich turns the first of a month into the last day of
  // the one before it.
  return {
    dari: `${mulai.getFullYear()}-${pad(mulai.getMonth() + 1)}-01`,
    sampai: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

export default function LaporanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [persediaan, setPersediaan] = useState<NilaiPersediaan[] | null>(null);
  const [persediaanErr, setPersediaanErr] = useState('');
  const [laba, setLaba] = useState<LabaKotor[] | null>(null);
  const [labaErr, setLabaErr] = useState('');
  const [readAt, setReadAt] = useState<Date | null>(null);

  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = String(reloadToken);
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rentang = rentangSetahun();
      /**
       * Settled, not raced: the two answer different questions and fail
       * independently. A gross-profit read that will not load still leaves a
       * perfectly correct statement of what the stock is worth, and replacing
       * both with one error page would throw away a number that arrived.
       */
      const [nilai, profit] = await Promise.allSettled([
        laporanNilaiPersediaan(),
        laporanLabaKotor(rentang),
      ]);
      if (!alive) return;

      if (nilai.status === 'fulfilled') {
        setPersediaan(nilai.value);
        setPersediaanErr('');
      } else {
        setPersediaan(null);
        setPersediaanErr(messageOf(nilai.reason, 'Gagal memuat nilai persediaan.'));
      }

      if (profit.status === 'fulfilled') {
        // Chronological from the server; reversed here so the month somebody
        // actually wants is the one at the top rather than one a year ago.
        setLaba([...profit.value].reverse());
        setLabaErr('');
      } else {
        setLaba(null);
        setLabaErr(messageOf(profit.reason, 'Gagal memuat laba kotor.'));
      }

      // When *this device* read the figures, which no payload carries. The guide
      // asks for it on every operational number: a number with no time on it
      // cannot be told from a stale one.
      setReadAt(new Date());
      setLoadedKey(requestKey);
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken, requestKey]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const totalPersediaan = (persediaan ?? []).reduce(
    (t, r) => t + decimalToNumber(r.total_nilai),
    0
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Laporan" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + L.space10 }]}>
        {readAt ? (
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Muat ulang laporan"
            style={styles.stamp}
            hitSlop={6}>
            <Feather name="refresh-cw" size={RamahIcon.meta} color={C.iconMuted} />
            <Text style={styles.stampText}>{`Dibaca ${stempelPembaruan(readAt)}`}</Text>
            <Text style={styles.stampAction}>Muat ulang</Text>
          </Pressable>
        ) : null}

        {/* ---- Nilai persediaan ---- */}
        <RamahSectionHeader>Nilai persediaan</RamahSectionHeader>
        {persediaanErr ? (
          <RamahInlineError message={persediaanErr} onRetry={reload} />
        ) : loading && persediaan === null ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : (persediaan?.length ?? 0) === 0 ? (
          <Text style={styles.kosong}>Belum ada stok bernilai di gudang mana pun.</Text>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Seluruh gudang</Text>
              {/* Guide §3: a figure is always `--text-title`, never toned. */}
              <Text style={styles.totalValue}>{formatRupiah(totalPersediaan)}</Text>
            </View>
            <RamahStackCard>
              {(persediaan ?? []).map((r) => (
                <View key={r.id_ruang} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={2}>
                    {r.nama_ruang || `Ruang #${r.id_ruang}`}
                  </Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {formatRupiah(r.total_nilai ?? '0')}
                  </Text>
                </View>
              ))}
            </RamahStackCard>
          </>
        )}

        {/* ---- Laba kotor ---- */}
        <RamahSectionHeader>Laba kotor per bulan</RamahSectionHeader>
        {labaErr ? (
          <RamahInlineError message={labaErr} onRetry={reload} />
        ) : loading && laba === null ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : (laba?.length ?? 0) === 0 ? (
          <Text style={styles.kosong}>
            Belum ada nota penjualan yang diposting dalam dua belas bulan terakhir.
          </Text>
        ) : (
          <>
            {(laba ?? []).map((b) => (
              <BulanCard key={b.bulan} row={b} />
            ))}
            <RamahNote icon="info">Omzet tanpa PPN.</RamahNote>
          </>
        )}

        {/* ---- Pergerakan, as a link ---- */}
        <RamahSectionHeader>Pergerakan stok</RamahSectionHeader>
        <Pressable
          onPress={() => router.push('/laporan/pergerakan')}
          accessibilityRole="button"
          accessibilityLabel="Buka laporan pergerakan stok"
          style={styles.linkCard}>
          <View style={styles.grow}>
            <Text style={styles.linkTitle}>Barang ini keluar ke mana saja</Text>
            <Text style={styles.linkSub}>
              Rekap masuk dan keluar per barang, gudang dan jenis transaksi.
            </Text>
          </View>
          <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * One month.
 *
 * Four figures, and the order is the arithmetic: turnover, minus cost, equals
 * profit — with the tax collected printed underneath and outside that sum,
 * because it is not part of it.
 */
function BulanCard({ row }: { row: LabaKotor }) {
  const omzet = decimalToNumber(row.total_penjualan);
  const hpp = decimalToNumber(row.total_hpp);
  const profit = decimalToNumber(row.laba_kotor);
  const ppn = decimalToNumber(row.total_ppn);
  // Guide §3 again: the margin is a *chip* beside the figure, never the figure's
  // colour — and it is only drawn when there is turnover to divide by.
  const margin = omzet > 0 ? Math.round((profit / omzet) * 100) : null;

  return (
    <View style={styles.bulanCard}>
      <View style={styles.bulanHead}>
        <Text style={styles.bulanNama}>{namaBulan(row.bulan)}</Text>
        {margin === null ? null : (
          <View style={[styles.marginChip, margin < 0 && styles.marginChipRugi]}>
            <Text style={[styles.marginText, margin < 0 && styles.marginTextRugi]}>
              {`${margin}% margin`}
            </Text>
          </View>
        )}
      </View>
      {/* Guide §3: "Label ... di atas nilai. Tidak pernah di samping" — and not
          under it either; the label is what the figure is *for*. */}
      <Text style={styles.bulanCaption}>Laba kotor</Text>
      <Text style={styles.bulanValue}>{formatRupiah(profit)}</Text>
      <View style={styles.bulanDivider} />
      <Rincian label="Omzet (tanpa PPN)" value={formatRupiah(omzet)} />
      <Rincian label="Harga pokok" value={`− ${formatRupiah(hpp)}`} />
      {/* Drawn only when it is non-zero: a shop that does not collect output VAT
          should not read a line of zeros every month. */}
      {ppn > 0 ? <Rincian label="PPN dipungut (bukan omzet)" value={formatRupiah(ppn)} /> : null}
    </View>
  );
}

function Rincian({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rincian}>
      <Text style={styles.rincianLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.rincianValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, gap: L.cardGap },

  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: L.space1 },
  // Guide §1 wants a time on every operational number, and `T.caption` is the
  // merchant scale's metadata size — the stamp is both.
  stampText: { ...T.caption, color: C.textMuted, flex: 1, minWidth: 0 },
  stampAction: { ...T.caption, color: C.textLink },

  loadingBox: { paddingVertical: L.space6, alignItems: 'center' },
  kosong: { ...T.caption, color: C.textBody, paddingVertical: L.space4 },

  totalCard: {
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    gap: 2,
  },
  totalLabel: { ...T.fieldLabel, color: C.textBody },
  totalValue: { ...T.metric, color: C.textTitle },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    paddingHorizontal: L.cardPad,
    paddingVertical: L.cardPadDense,
    // Guide §7: a list row is 56, whether or not it happens to be tappable.
    minHeight: L.rowH,
  },
  rowLabel: { ...T.body, color: C.textTitle, flex: 1, minWidth: 0 },
  rowValue: { ...T.rowTitle, color: C.textTitle, textAlign: 'right' },

  bulanCard: {
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    gap: 2,
  },
  bulanHead: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  bulanNama: { ...T.rowTitle, color: C.textTitle, flex: 1, minWidth: 0 },
  marginChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: C.brandTint,
  },
  marginChipRugi: { backgroundColor: C.red50 },
  marginText: { ...T.delta, color: C.brandInk },
  marginTextRugi: { color: C.red600 },
  bulanValue: { ...T.metric, color: C.textTitle },
  bulanCaption: { ...T.caption, color: C.textBody, paddingTop: L.space2 },
  bulanDivider: { height: 1, backgroundColor: C.borderHairline, marginVertical: L.space3 },

  rincian: { flexDirection: 'row', alignItems: 'baseline', gap: L.space3, paddingVertical: 3 },
  rincianLabel: { ...T.caption, color: C.textBody, flex: 1, minWidth: 0 },
  rincianValue: { ...T.caption, color: C.textTitle, textAlign: 'right' },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
  },
  linkTitle: { ...T.rowTitle, color: C.textTitle },
  linkSub: { ...T.caption, color: C.textBody },
});
