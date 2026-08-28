/**
 * Stok Opname — one counting session.
 *
 * One address, two faces: a posted session is a result to read, a draft is a
 * sheet to keep counting on. The status decides, not a `view` flag — which is
 * also why reopening a running count from a deep link works at all.
 *
 * `?baru=1` says the new-count route just posted this one.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { OpnameWorksheet, netColor, netLabel, type OpnameDraft } from '@/components/opname/worksheet';
import { AppShell } from '@/components/shell/AppShell';
import { BackButton, Card, CardHead, GhostButton, KpiCard, Toast } from '@/components/shell/ui';
import { Colors as C, num, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  countedItems,
  netSelisih,
  opnameStore,
  prodNama,
  prodUnit,
  ruangNama,
  saveOpname,
  varianceItems,
  type Session,
} from '@/stores/opname';

function draftOf(t: Session): OpnameDraft {
  return {
    ruang: t.ruang,
    tanggal: t.tanggal,
    catatan: t.catatan || '',
    // Copied, so abandoning the sheet leaves the stored session untouched.
    items: t.items.map((it) => ({ ...it })),
    wsFilter: 'semua',
    err: '',
  };
}

export default function StokOpnameDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);

  const sessions = useLocalStore(opnameStore);
  const current = sessions.find((t) => t.id === id) ?? null;

  const canWrite = useCanWrite('opname');

  // Seeded during the first render, not from an effect: the dataset is already
  // in memory, and one frame of the posted-result table drawn over an
  // unfinished count would show `NaN` in every uncounted row.
  const [draft, setDraft] = useState<OpnameDraft | null>(() => {
    const s = opnameStore.get().find((t) => t.id === id);
    return s && s.status === 'draft' ? draftOf(s) : null;
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (announced.current || !current) return;
    announced.current = true;
    if (params.baru === '1') {
      const nVar = varianceItems(current.items).length;
      toast(
        `Opname ${current.no} diposting · ${
          nVar ? `${nVar} item disesuaikan di ${ruangNama(current.ruang)}` : 'stok cocok, tidak ada penyesuaian'
        }`
      );
    }
  }, [current, params.baru, toast]);

  const goBack = useCallback(() => {
    // Nothing to pop when this was a deep link, and `back()` would leave the app.
    if (router.canGoBack()) router.back();
    else router.replace('/stok-opname');
  }, [router]);

  if (!current) {
    return (
      <AppShell title="Stok Opname">
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Opname tidak ditemukan.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  // ---- still being counted ----

  if (current.status === 'draft' && draft) {
    const commit = (post: boolean) => {
      const counted = countedItems(draft.items);
      if (!counted.length) return setDraft({ ...draft, err: '400 — isi minimal satu hitungan fisik.' });
      if (post && counted.length < draft.items.length) {
        return setDraft({
          ...draft,
          err: `400 — ${draft.items.length - counted.length} item belum dihitung. Posting butuh seluruh item terhitung — simpan draft untuk lanjut nanti.`,
        });
      }
      saveOpname(
        { id: current.id, ruang: draft.ruang, tanggal: draft.tanggal, catatan: draft.catatan.trim(), items: draft.items },
        post
      );
      if (post) {
        // The session is posted; this same route now shows the result, and the
        // sheet's working copy has nothing left to hold.
        setDraft(null);
        const nVar = draft.items.filter((it) => (it.fisik as number) - it.sistem !== 0).length;
        toast(
          `Opname ${current.no} diposting · ${
            nVar ? `${nVar} item disesuaikan di ${ruangNama(draft.ruang)}` : 'stok cocok, tidak ada penyesuaian'
          }`
        );
      } else {
        toast(`Draft ${current.no} disimpan · ${counted.length}/${draft.items.length} item terhitung`);
      }
    };

    return (
      <AppShell title="Stok Opname">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          <OpnameWorksheet
            draft={draft}
            onChange={setDraft}
            no={current.no}
            ruangLocked
            canWrite={canWrite}
            backLabel="← Daftar"
            onBack={goBack}
            onSaveDraft={() => commit(false)}
            onPost={() => commit(true)}
          />
        </ScrollView>
        <Toast message={toastMsg} />
      </AppShell>
    );
  }

  // ---- posted ----

  const nVar = varianceItems(current.items).length;
  const net = netSelisih(current.items);

  return (
    <AppShell title="Stok Opname">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <BackButton onPress={goBack} />
          <Text style={styles.detailNo}>{current.no}</Text>
          <View style={[styles.badge, { backgroundColor: C.greenBg, borderColor: C.greenBorder }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.green }}>Selesai</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard label="Ruang" value={ruangNama(current.ruang)} sub={`Dihitung oleh ${current.petugas}`} />
          <KpiCard
            label="Tanggal opname"
            value={tanggal(current.tanggal)}
            sub={`${current.items.length} item dihitung`}
          />
          <KpiCard
            label="Item dengan selisih"
            value={num(nVar)}
            valueClass={nVar ? 'text-amber' : 'text-green'}
            sub={`net ${netLabel(net)}`}
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
          <CardHead
            title="Hasil hitung"
            right={
              <Text style={{ fontSize: 13.5, color: C.muted2 }}>
                Stok sistem disesuaikan ke stok fisik saat posting
              </Text>
            }
          />
          <View style={styles.wsHeadRow}>
            <Text style={{ flex: 1 }}>PRODUK</Text>
            <Text style={{ width: 120, textAlign: 'right' }}>SEBELUM</Text>
            <Text style={{ width: 120, textAlign: 'right' }}>HASIL HITUNG</Text>
            <Text style={{ width: 140, textAlign: 'right' }}>SELISIH</Text>
          </View>
          {current.items.map((it) => {
            const sel = (it.fisik as number) - it.sistem;
            return (
              <View key={it.kode} style={[styles.wsRow, { backgroundColor: sel === 0 ? '#fff' : '#FDF8EC' }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 15.5, fontWeight: '500' }} numberOfLines={1}>
                    {prodNama(it.kode)}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>
                    {it.kode} · {prodUnit(it.kode)}
                  </Text>
                </View>
                <Text style={{ width: 120, textAlign: 'right', fontSize: 16, color: C.muted3 }}>
                  {num(it.sistem)}
                </Text>
                <Text style={{ width: 120, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>
                  {num(it.fisik as number)}
                </Text>
                <Text
                  style={{
                    width: 140,
                    textAlign: 'right',
                    fontSize: 16,
                    fontWeight: '700',
                    color: netColor(sel),
                  }}>
                  {sel === 0 ? '0' : netLabel(sel)}
                </Text>
              </View>
            );
          })}
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
  badge: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  wsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
});
