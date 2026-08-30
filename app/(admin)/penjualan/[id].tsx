/**
 * Penjualan — one sales note.
 *
 * `?baru=1` says the entry form just landed here; it is read once on the way in
 * so the confirmation names the number the store generated.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  Badge,
  Card,
  CardHead,
  GhostButton,
  PrimaryButton,
  StatTile,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, rp, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  cust,
  jatuhOf,
  lunasiNota,
  penjualanStore,
  prodNama,
  statusOf,
  TODAY,
  totalOf,
} from '@/stores/penjualan';

export default function PenjualanDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);

  const nota = useLocalStore(penjualanStore);
  const current = nota.find((f) => f.id === id) ?? null;

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('penjualan');

  const toast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !current || params.baru !== '1') return;
    announced.current = true;
    const sisa = totalOf(current) - current.dibayar;
    toast(
      `Nota ${current.no} disimpan${sisa > 0 ? ` · piutang tercatat ke ${cust(current.custId)?.nama ?? 'pelanggan'}` : ' · lunas'}`
    );
  }, [current, params.baru, toast]);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penjualan');
  }, [router]);

  if (!current) {
    return (
      <AppShell title="Detail nota" onBack={goBack}>
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Nota tidak ditemukan.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  const total = totalOf(current);
  const sisa = total - current.dibayar;
  const st = statusOf(current);
  const c = cust(current.custId);
  const j = jatuhOf(current);
  const overdue = sisa > 0 && !!j && j < TODAY;

  return (
    <AppShell title={current.no} onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <Badge label={st.label} tone={st.tone} />
          <View style={{ flex: 1 }} />
          {canWrite && sisa > 0 && (
            <PrimaryButton
              label="Terima pelunasan"
              onPress={() => {
                lunasiNota(current.id);
                toast(`Pelunasan nota ${current.no} diterima`);
              }}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile label="Total nota" value={rp(total)} sub={`${current.items.length} jenis item`} />
          <StatTile
            label="Sudah diterima"
            value={rp(current.dibayar)}
            valueClass="text-green"
            sub={
              current.dibayar <= 0
                ? 'Belum ada pembayaran'
                : current.dibayar >= total
                  ? 'Nota lunas'
                  : 'Sebagian dari total'
            }
          />
          <StatTile
            label="Sisa piutang"
            value={rp(sisa)}
            valueClass={sisa <= 0 ? 'text-foreground' : overdue ? 'text-danger' : 'text-foreground'}
            sub={
              sisa <= 0
                ? 'Tidak ada piutang'
                : j
                  ? overdue
                    ? `Lewat tempo ${tanggal(j)}`
                    : `Jatuh tempo ${tanggal(j)}`
                  : 'Tunai — bayar di tempat'
            }
            subClass={overdue ? 'text-danger' : 'text-faint'}
          />
        </View>

        <Card>
          <CardHead
            title={c ? c.nama : '—'}
            right={
              <Text style={{ fontSize: 13.5, color: C.muted3 }}>
                Nota {tanggal(current.tanggal)} · tempo {c && c.tempo > 0 ? `${c.tempo} hari` : 'tunai'}
              </Text>
            }
          />
          <View style={styles.itemsHeadRow}>
            <Text style={{ flex: 1 }}>PRODUK</Text>
            <Text style={{ width: 110, textAlign: 'right' }}>QTY</Text>
            <Text style={{ width: 140, textAlign: 'right' }}>HARGA</Text>
            <Text style={{ width: 150, textAlign: 'right' }}>SUBTOTAL</Text>
          </View>
          {current.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '500' }}>{prodNama(it.kode)}</Text>
                <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode}</Text>
              </View>
              <Text style={{ width: 110, textAlign: 'right', fontSize: 15 }}>
                {it.qty.toLocaleString('id-ID')} {it.satuan}
              </Text>
              <Text style={{ width: 140, textAlign: 'right', fontSize: 15, color: C.dark2 }}>
                {rp(it.harga)}
              </Text>
              <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>
                {rp(it.qty * it.harga)}
              </Text>
            </View>
          ))}
          <View style={styles.itemsFoot}>
            <Text style={{ fontSize: 14, color: C.muted3 }}>Total nota</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.2 }}>{rp(total)}</Text>
          </View>
        </Card>
      </ScrollView>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  itemsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  itemsFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 20,
    padding: 14,
    backgroundColor: C.tableHeaderBg,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
});
