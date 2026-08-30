/**
 * Mutasi & Pemakaian — one stock document.
 *
 * `?baru=1` says the entry form just landed here; it is read once on the way in
 * so the confirmation can name the number and the effect the store settled on
 * (a transfer to the branch travels; one within a site lands immediately).
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
  KpiCard,
  PrimaryButton,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  jenisMeta,
  mutasiStore,
  prodNama,
  prodUnit,
  ruangNama,
  statusMeta,
  terimaTrx,
  totalQty,
  unitNama,
} from '@/stores/mutasi';

export default function MutasiDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);

  const trx = useLocalStore(mutasiStore);
  const current = trx.find((t) => t.id === id) ?? null;

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('mutasi');

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
    if (current.jenis === 'mutasi') {
      const tujuan = ruangNama(current.ke ?? 0);
      toast(
        `Mutasi ${current.no} disimpan · ${
          current.status === 'transit' ? `menunggu diterima di ${tujuan}` : `stok dipindah ke ${tujuan}`
        }`
      );
    } else {
      toast(`Pemakaian ${current.no} dicatat · stok dikeluarkan untuk ${unitNama(current.unit ?? 0)}`);
    }
  }, [current, params.baru, toast]);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/mutasi-pemakaian');
  }, [router]);

  if (!current) {
    return (
      <AppShell title="Detail transaksi" onBack={goBack}>
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Transaksi tidak ditemukan.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  const jm = jenisMeta(current.jenis);
  const st = statusMeta(current);
  const isMutasi = current.jenis === 'mutasi';
  const canReceive = canWrite && isMutasi && current.status === 'transit';

  return (
    <AppShell title={current.no} onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <Badge label={jm.label} tone={jm.tone} />
          <Badge label={st.label} tone={st.tone} />
          <View style={{ flex: 1 }} />
          {canReceive && (
            <PrimaryButton
              label="Terima di tujuan"
              onPress={() => {
                terimaTrx(current.id);
                toast(`Mutasi ${current.no} diterima di ${ruangNama(current.ke ?? 0)}`);
              }}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard label="Dari ruang" value={ruangNama(current.dari)} sub="stok berkurang di sini" />
          <KpiCard
            label={isMutasi ? 'Ke ruang' : 'Unit pemakai'}
            value={isMutasi ? ruangNama(current.ke ?? 0) : unitNama(current.unit ?? 0)}
            valueClass={isMutasi ? 'text-foreground' : 'text-amber'}
            sub={
              isMutasi
                ? current.status === 'transit'
                  ? 'stok belum ditambahkan'
                  : 'stok bertambah di sini'
                : 'stok keluar / dikonsumsi'
            }
          />
          <KpiCard
            label="Tanggal"
            value={tanggal(current.tanggal)}
            sub={`${current.items.length} jenis · ${num(totalQty(current))} unit`}
          />
        </View>

        {!!current.catatan && (
          <Card className="p-3.5">
            <Text style={{ fontSize: 12.5, color: C.muted2 }}>Catatan</Text>
            <Text style={{ fontSize: 15, color: C.text, marginTop: 3, lineHeight: 20 }}>
              {current.catatan}
            </Text>
          </Card>
        )}

        <Card>
          <CardHead title="Rincian item" />
          <View style={styles.itemsHeadRow}>
            <Text style={{ flex: 1 }}>PRODUK</Text>
            <Text style={{ width: 180, textAlign: 'right' }}>QTY</Text>
          </View>
          {current.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '500' }}>{prodNama(it.kode)}</Text>
                <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode}</Text>
              </View>
              <Text style={{ width: 180, textAlign: 'right', fontSize: 17, fontWeight: '600' }}>
                {it.qty.toLocaleString('id-ID')} {prodUnit(it.kode)}
              </Text>
            </View>
          ))}
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
    height: 38,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
});
