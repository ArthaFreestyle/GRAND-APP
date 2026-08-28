/**
 * Pembelian — one purchase invoice.
 *
 * `?baru=1` says the entry form just landed here; it is read once on the way in
 * so the confirmation names the number the store generated.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  BackButton,
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
  jatuhOf,
  lunasiFaktur,
  pembelianStore,
  prodNama,
  statusOf,
  sup,
  TODAY,
  totalOf,
} from '@/stores/pembelian';

export default function PembelianDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);

  const faktur = useLocalStore(pembelianStore);
  const current = faktur.find((f) => f.id === id) ?? null;

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pembelian');

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
    toast(`Faktur ${current.no} disimpan · hutang tercatat ke ${sup(current.supId)?.nama ?? 'supplier'}`);
  }, [current, params.baru, toast]);

  const goBack = useCallback(() => {
    // Nothing to pop when this was a deep link, and `back()` would leave the app.
    if (router.canGoBack()) router.back();
    else router.replace('/pembelian');
  }, [router]);

  if (!current) {
    return (
      <AppShell title="Pembelian">
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Faktur tidak ditemukan.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  const total = totalOf(current);
  const sisa = total - current.dibayar;
  const st = statusOf(current);
  const s = sup(current.supId);
  const j = jatuhOf(current);
  const overdue = sisa > 0 && !!j && j < TODAY;

  return (
    <AppShell title="Pembelian">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <BackButton onPress={goBack} />
          <Text style={styles.detailNo}>{current.no}</Text>
          <Badge label={st.label} tone={st.tone} />
          <View style={{ flex: 1 }} />
          {canWrite && sisa > 0 && (
            <PrimaryButton
              label="Lunasi hutang"
              onPress={() => {
                lunasiFaktur(current.id);
                toast(`Hutang faktur ${current.no} dilunasi`);
              }}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile label="Total faktur" value={rp(total)} sub={`${current.items.length} jenis item`} />
          <StatTile
            label="Sudah dibayar"
            value={rp(current.dibayar)}
            valueClass="text-green"
            sub={
              current.dibayar <= 0
                ? 'Belum ada pembayaran'
                : current.dibayar >= total
                  ? 'Faktur lunas'
                  : 'Sebagian dari total'
            }
          />
          <StatTile
            label="Sisa hutang"
            value={rp(sisa)}
            valueClass={sisa <= 0 ? 'text-foreground' : overdue ? 'text-danger' : 'text-foreground'}
            sub={
              sisa <= 0
                ? 'Tidak ada hutang'
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
            title={s ? s.nama : '—'}
            right={
              <Text style={{ fontSize: 13.5, color: C.muted3 }}>
                Faktur {tanggal(current.tanggal)} · tempo {s && s.tempo > 0 ? `${s.tempo} hari` : 'tunai'}
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
            <Text style={{ fontSize: 14, color: C.muted3 }}>Total faktur</Text>
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
