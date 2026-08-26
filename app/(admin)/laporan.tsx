import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { Card, KpiCard, OptionPicker, SecondaryButton, TabSwitch, Toast } from '@/components/shell/ui';
import { Colors as C, rp, rpShort } from '@/constants/theme-erp';

type ReportKey = 'ringkasan' | 'penjualan' | 'pembelian' | 'persediaan';

interface ProdRef {
  kode: string; nama: string; kategori: string; satuan: string;
  hargaBeli: number; hargaJual: number; stok: number; min: number; sold: number[];
}
interface SupRef { id: number; kode: string; nama: string }
interface Purchase { no: string; sup: number; month: string; total: number; dibayar: number }

const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const MONTH_SHORT = ['Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu'];

const PRODS: ProdRef[] = [
  { kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', kategori: 'ATK', satuan: 'pcs', hargaBeli: 2600, hargaJual: 3500, stok: 480, min: 200, sold: [1200, 1350, 1100, 1500, 1420, 1680] },
  { kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', kategori: 'Kertas', satuan: 'rim', hargaBeli: 42000, hargaJual: 52000, stok: 65, min: 40, sold: [180, 210, 175, 240, 220, 265] },
  { kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', kategori: 'Buku', satuan: 'pcs', hargaBeli: 3200, hargaJual: 4200, stok: 320, min: 150, sold: [900, 820, 760, 1100, 980, 1240] },
  { kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', kategori: 'ATK', satuan: 'pcs', hargaBeli: 2100, hargaJual: 2800, stok: 90, min: 120, sold: [600, 540, 480, 720, 650, 690] },
  { kode: 'BRG-045', nama: 'Map Plastik Kancing A4', kategori: 'ATK', satuan: 'pcs', hargaBeli: 2400, hargaJual: 3500, stok: 210, min: 100, sold: [420, 380, 410, 520, 470, 560] },
  { kode: 'BRG-080', nama: 'Lakban Bening 2 inch', kategori: 'Perlengkapan', satuan: 'pcs', hargaBeli: 8500, hargaJual: 11500, stok: 140, min: 60, sold: [320, 280, 300, 360, 340, 410] },
  { kode: 'BRG-060', nama: 'Stapler Kenko HD-10', kategori: 'Perlengkapan', satuan: 'pcs', hargaBeli: 18000, hargaJual: 26000, stok: 45, min: 25, sold: [55, 48, 60, 72, 68, 80] },
  { kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', kategori: 'Tinta', satuan: 'pcs', hargaBeli: 68000, hargaJual: 82000, stok: 24, min: 30, sold: [40, 55, 48, 62, 58, 70] },
];
const SUPPLIERS: SupRef[] = [
  { id: 1, kode: 'SUP-001', nama: 'PT Sinar Dunia Distribusi' },
  { id: 2, kode: 'SUP-002', nama: 'CV Tiga Roda ATK' },
  { id: 3, kode: 'SUP-003', nama: 'PT Faber Nusantara' },
  { id: 4, kode: 'SUP-004', nama: 'CV Lakban Sejahtera' },
  { id: 5, kode: 'SUP-005', nama: 'PT Epson Tinta Prima' },
];
const PURCHASES: Purchase[] = [
  { no: 'PB-2603-01', sup: 1, month: '2026-03', total: 22000000, dibayar: 22000000 },
  { no: 'PB-2603-02', sup: 2, month: '2026-03', total: 8400000, dibayar: 8400000 },
  { no: 'PB-2604-01', sup: 1, month: '2026-04', total: 18500000, dibayar: 18500000 },
  { no: 'PB-2604-02', sup: 3, month: '2026-04', total: 6200000, dibayar: 6200000 },
  { no: 'PB-2605-01', sup: 1, month: '2026-05', total: 15800000, dibayar: 15800000 },
  { no: 'PB-2605-02', sup: 4, month: '2026-05', total: 3600000, dibayar: 3600000 },
  { no: 'PB-2606-01', sup: 1, month: '2026-06', total: 26400000, dibayar: 26400000 },
  { no: 'PB-2606-02', sup: 2, month: '2026-06', total: 9800000, dibayar: 5000000 },
  { no: 'PB-2607-01', sup: 1, month: '2026-07', total: 21200000, dibayar: 21200000 },
  { no: 'PB-2607-02', sup: 5, month: '2026-07', total: 7500000, dibayar: 7500000 },
  { no: 'PB-2607-03', sup: 3, month: '2026-07', total: 5400000, dibayar: 0 },
  { no: 'PB-2608-01', sup: 1, month: '2026-08', total: 24800000, dibayar: 12000000 },
  { no: 'PB-2608-02', sup: 2, month: '2026-08', total: 10600000, dibayar: 0 },
  { no: 'PB-2608-03', sup: 4, month: '2026-08', total: 4200000, dibayar: 4200000 },
];

function periodLabel(period: string): string {
  if (period === 'all') return '6 bulan terakhir';
  const idx = MONTHS.indexOf(period);
  return idx >= 0 ? `${MONTH_SHORT[idx]} ${period.slice(0, 4)}` : period;
}
function soldInPeriod(p: ProdRef, period: string): number {
  if (period === 'all') return p.sold.reduce((a, b) => a + b, 0);
  const i = MONTHS.indexOf(period);
  return i >= 0 ? p.sold[i] : 0;
}
function purchasesInPeriod(period: string): Purchase[] {
  return period === 'all' ? PURCHASES.slice() : PURCHASES.filter((x) => x.month === period);
}

export default function LaporanScreen() {
  const [report, setReport] = useState<ReportKey>('ringkasan');
  const [period, setPeriod] = useState('2026-08');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  const sales = PRODS.map((p) => {
    const qty = soldInPeriod(p, period);
    const omzet = qty * p.hargaJual;
    const laba = qty * (p.hargaJual - p.hargaBeli);
    return { p, qty, omzet, laba };
  });
  const totOmzet = sales.reduce((a, x) => a + x.omzet, 0);
  const totLaba = sales.reduce((a, x) => a + x.laba, 0);
  const totUnit = sales.reduce((a, x) => a + x.qty, 0);
  const marginPct = totOmzet > 0 ? (totLaba / totOmzet) * 100 : 0;

  const buys = purchasesInPeriod(period);
  const totBeli = buys.reduce((a, x) => a + x.total, 0);
  const totBayar = buys.reduce((a, x) => a + x.dibayar, 0);
  const totHutang = totBeli - totBayar;

  const nilaiBeli = PRODS.reduce((a, p) => a + p.stok * p.hargaBeli, 0);
  const nilaiJual = PRODS.reduce((a, p) => a + p.stok * p.hargaJual, 0);
  const lowCount = PRODS.filter((p) => p.stok <= p.min).length;

  let kpiCards: { label: string; value: string; sub: string; color?: string }[];
  if (report === 'ringkasan') {
    kpiCards = [
      { label: `Penjualan (${periodLabel(period)})`, value: rp(totOmzet), sub: `${totUnit.toLocaleString('id-ID')} unit terjual` },
      { label: 'Laba kotor', value: rp(totLaba), sub: `margin ${marginPct.toFixed(1)}%`, color: C.green },
      { label: 'Pembelian', value: rp(totBeli), sub: `${buys.length} faktur` },
      { label: 'Nilai persediaan', value: rp(nilaiBeli), sub: `harga beli · ${PRODS.length} SKU` },
    ];
  } else if (report === 'penjualan') {
    kpiCards = [
      { label: 'Omzet', value: rp(totOmzet), sub: periodLabel(period) },
      { label: 'Laba kotor', value: rp(totLaba), sub: 'setelah HPP', color: C.green },
      { label: 'Margin rata-rata', value: `${marginPct.toFixed(1)}%`, sub: 'laba / omzet', color: C.primaryDark },
      { label: 'Unit terjual', value: totUnit.toLocaleString('id-ID'), sub: `${PRODS.length} jenis produk` },
    ];
  } else if (report === 'pembelian') {
    kpiCards = [
      { label: 'Total pembelian', value: rp(totBeli), sub: periodLabel(period) },
      { label: 'Jumlah faktur', value: buys.length.toLocaleString('id-ID'), sub: 'periode terpilih' },
      { label: 'Sudah terbayar', value: rp(totBayar), sub: totBeli > 0 ? `${Math.round((totBayar / totBeli) * 100)}% dari nilai` : '—', color: C.green },
      { label: 'Sisa hutang', value: rp(totHutang), sub: totHutang > 0 ? 'belum jatuh / berjalan' : 'lunas', color: totHutang > 0 ? C.red : C.green },
    ];
  } else {
    kpiCards = [
      { label: 'Total SKU', value: PRODS.length.toLocaleString('id-ID'), sub: 'produk aktif' },
      { label: 'Nilai persediaan (beli)', value: rp(nilaiBeli), sub: 'harga pokok' },
      { label: 'Nilai persediaan (jual)', value: rp(nilaiJual), sub: 'potensi omzet', color: C.primaryDark },
      { label: 'Di bawah minimum', value: lowCount.toLocaleString('id-ID'), sub: lowCount > 0 ? 'perlu restock' : 'stok aman', color: lowCount > 0 ? C.red : C.green },
    ];
  }

  const monthSales = MONTHS.map((_, i) => PRODS.reduce((a, p) => a + p.sold[i] * p.hargaJual, 0));
  const monthBuys = MONTHS.map((m) => PURCHASES.filter((x) => x.month === m).reduce((a, x) => a + x.total, 0));
  const chartMax = Math.max(1, ...monthSales, ...monthBuys);

  const topSorted = sales.slice().sort((a, b) => b.omzet - a.omzet).slice(0, 5);
  const topMax = Math.max(1, ...topSorted.map((x) => x.omzet));

  const salesSorted = sales.slice().sort((a, b) => b.omzet - a.omzet);
  const bySup = SUPPLIERS.map((sp) => {
    const rows = buys.filter((b) => b.sup === sp.id);
    const nilai = rows.reduce((a, b) => a + b.total, 0);
    const terbayar = rows.reduce((a, b) => a + b.dibayar, 0);
    return { sp, faktur: rows.length, nilai, terbayar, sisa: nilai - terbayar };
  }).filter((x) => x.faktur > 0).sort((a, b) => b.nilai - a.nilai);
  const stockSorted = PRODS.slice().sort((a, b) => b.stok * b.hargaBeli - a.stok * a.hargaBeli);

  const reportTabs: { key: ReportKey; label: string }[] = [
    { key: 'ringkasan', label: 'Ringkasan' },
    { key: 'penjualan', label: 'Penjualan' },
    { key: 'pembelian', label: 'Pembelian' },
    { key: 'persediaan', label: 'Persediaan' },
  ];

  return (
    <AppShell title="Laporan">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.wrap}>
        <View style={styles.toolbar}>
          <TabSwitch options={reportTabs} active={report} onPick={setReport} />
          <View style={{ flex: 1 }} />
          {report !== 'persediaan' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13.5, color: C.muted3 }}>Periode</Text>
              <View style={{ width: 220 }}>
                <OptionPicker
                  options={[{ value: 'all', label: '6 bulan terakhir' }, ...MONTHS.map((m, i) => ({ value: m, label: `${MONTH_SHORT[i]} ${m.slice(0, 4)}` })).reverse()]}
                  value={period}
                  onChange={setPeriod}
                />
              </View>
            </View>
          )}
          <SecondaryButton
            label="Ekspor CSV"
            onPress={() => toast(`Laporan ${reportTabs.find((r) => r.key === report)?.label}${report !== 'persediaan' ? ` · ${periodLabel(period)}` : ''} diekspor ke CSV`)}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {kpiCards.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} color={k.color} />
          ))}
        </View>

        {report === 'ringkasan' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Card style={{ flex: 2, minWidth: 340, padding: 18, gap: 14 }}>
              <View style={styles.chartHead}>
                <Text style={styles.cardHeadTextLocal}>Penjualan vs Pembelian</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: C.primary }]} /><Text style={styles.legendText}>Penjualan</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: C.primaryTintBorder }]} /><Text style={styles.legendText}>Pembelian</Text></View>
                </View>
              </View>
              <View style={styles.chartRow}>
                {MONTHS.map((m, i) => {
                  const on = period !== 'all' && m === period;
                  return (
                    <View key={m} style={styles.chartCol}>
                      <View style={styles.chartBars}>
                        <View style={[styles.bar, { backgroundColor: C.primary, height: Math.max(2, Math.round((monthSales[i] / chartMax) * 150)) }]} />
                        <View style={[styles.bar, { backgroundColor: C.primaryTintBorder, height: Math.max(2, Math.round((monthBuys[i] / chartMax) * 150)) }]} />
                      </View>
                      <Text style={{ fontSize: 12.5, color: on ? C.primaryDark : C.muted, fontWeight: on ? '700' : '500' }}>{MONTH_SHORT[i]}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
            <Card style={{ flex: 1, minWidth: 280, padding: 18, gap: 12 }}>
              <Text style={styles.cardHeadTextLocal}>Produk terlaris</Text>
              <View style={{ gap: 14 }}>
                {topSorted.map((x) => (
                  <View key={x.p.kode} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{x.p.nama}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600' }}>{rpShort(x.omzet)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.round((x.omzet / topMax) * 100)}%` }]} />
                    </View>
                    <Text style={{ fontSize: 12, color: C.muted }}>{x.qty.toLocaleString('id-ID')} {x.p.satuan} terjual</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {report === 'penjualan' && (
          <Card>
            <View style={styles.tableHeadRow}>
              <Text style={{ flex: 1 }}>PRODUK</Text>
              <Text style={{ width: 120, textAlign: 'right' }}>QTY TERJUAL</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>OMZET</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>LABA KOTOR</Text>
              <Text style={{ width: 90, textAlign: 'right' }}>MARGIN</Text>
            </View>
            {salesSorted.map((x) => (
              <View key={x.p.kode} style={styles.dataRow}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{x.p.nama}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{x.p.kode}</Text>
                </View>
                <Text style={{ width: 120, textAlign: 'right', fontSize: 15 }}>{x.qty.toLocaleString('id-ID')}</Text>
                <Text style={{ width: 150, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>{rp(x.omzet)}</Text>
                <Text style={{ width: 150, textAlign: 'right', fontSize: 15, color: C.green }}>{rp(x.laba)}</Text>
                <Text style={{ width: 90, textAlign: 'right', fontSize: 14, color: C.dark2 }}>{x.omzet > 0 ? `${((x.laba / x.omzet) * 100).toFixed(1)}%` : '—'}</Text>
              </View>
            ))}
            <View style={styles.footRow}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.dark2 }}>TOTAL</Text>
              <Text style={{ width: 120, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>{totUnit.toLocaleString('id-ID')}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800' }}>{rp(totOmzet)}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800', color: C.green }}>{rp(totLaba)}</Text>
              <Text style={{ width: 90, textAlign: 'right', fontSize: 14, fontWeight: '700' }}>{marginPct.toFixed(1)}%</Text>
            </View>
          </Card>
        )}

        {report === 'pembelian' && (
          <Card>
            <View style={styles.tableHeadRow}>
              <Text style={{ flex: 1 }}>SUPPLIER</Text>
              <Text style={{ width: 90, textAlign: 'right' }}>FAKTUR</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>NILAI BELI</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>TERBAYAR</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>SISA HUTANG</Text>
            </View>
            {bySup.map((x) => (
              <View key={x.sp.id} style={styles.dataRow}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{x.sp.nama}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{x.sp.kode}</Text>
                </View>
                <Text style={{ width: 90, textAlign: 'right', fontSize: 15 }}>{x.faktur}</Text>
                <Text style={{ width: 150, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>{rp(x.nilai)}</Text>
                <Text style={{ width: 150, textAlign: 'right', fontSize: 15, color: C.green }}>{rp(x.terbayar)}</Text>
                <Text style={{ width: 150, textAlign: 'right', fontSize: 15, color: x.sisa > 0 ? C.red : C.green }}>{x.sisa > 0 ? rp(x.sisa) : 'lunas'}</Text>
              </View>
            ))}
            <View style={styles.footRow}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.dark2 }}>TOTAL</Text>
              <Text style={{ width: 90, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>{buys.length}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800' }}>{rp(totBeli)}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 15, fontWeight: '700', color: C.green }}>{rp(totBayar)}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800', color: totHutang > 0 ? C.red : C.green }}>{totHutang > 0 ? rp(totHutang) : 'lunas'}</Text>
            </View>
          </Card>
        )}

        {report === 'persediaan' && (
          <Card>
            <View style={styles.tableHeadRow}>
              <Text style={{ flex: 1 }}>PRODUK</Text>
              <Text style={{ width: 130, textAlign: 'right' }}>STOK</Text>
              <Text style={{ width: 120 }}>STATUS</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>NILAI BELI</Text>
              <Text style={{ width: 150, textAlign: 'right' }}>NILAI JUAL</Text>
            </View>
            {stockSorted.map((p) => {
              const st = p.stok <= 0
                ? { label: 'Habis', color: C.red, bg: C.redBg, border: C.redBorder }
                : p.stok <= p.min
                ? { label: 'Menipis', color: C.amber, bg: C.amberBg, border: C.amberBorder }
                : { label: 'Aman', color: C.green, bg: C.greenBg, border: C.greenBorder };
              return (
                <View key={p.kode} style={styles.dataRow}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{p.nama}</Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>{p.kode} · {p.kategori}</Text>
                  </View>
                  <Text style={{ width: 130, textAlign: 'right', fontSize: 15 }}>{p.stok.toLocaleString('id-ID')} {p.satuan}</Text>
                  <View style={{ width: 120 }}>
                    <View style={[styles.badge, { backgroundColor: st.bg, borderColor: st.border }]}>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={{ width: 150, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>{rp(p.stok * p.hargaBeli)}</Text>
                  <Text style={{ width: 150, textAlign: 'right', fontSize: 15, color: C.dark2 }}>{rp(p.stok * p.hargaJual)}</Text>
                </View>
              );
            })}
            <View style={styles.footRow}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.dark2 }}>TOTAL {PRODS.length} SKU</Text>
              <View style={{ width: 130 }} />
              <View style={{ width: 120 }} />
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800' }}>{rp(nilaiBeli)}</Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '800' }}>{rp(nilaiJual)}</Text>
            </View>
          </Card>
        )}
      </ScrollView>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cardHeadTextLocal: { fontSize: 16.5, fontWeight: '700', color: C.text },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 11, height: 11, borderRadius: 3 },
  legendText: { fontSize: 13, color: C.muted3 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, height: 190, paddingTop: 6 },
  chartCol: { flex: 1, alignItems: 'center', gap: 8, minWidth: 0 },
  chartBars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 5 },
  bar: { width: 16, borderRadius: 4 },
  barTrack: { height: 8, borderRadius: 5, backgroundColor: '#EEF1F5', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5, backgroundColor: C.primary },
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 46, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 62, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 56, backgroundColor: C.tableHeaderBg, borderTopWidth: 1, borderTopColor: C.borderLight },
  badge: { height: 24, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
