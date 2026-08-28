/**
 * Supplier — one supplier.
 *
 * `?ubah=1` opens the edit dialog on arrival (that is how the list's "Ubah"
 * button gets here) and `?baru=1` says the create form just landed. Both are
 * read once on the way in: they seed the screen rather than driving it.
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
  EmptyState,
  GhostButton,
  NeutralBadge,
  SecondaryButton,
  StatTile,
  Toast,
} from '@/components/shell/ui';
import { SupplierFormModal, type SupplierFormValues } from '@/components/supplier/form';
import { Colors as C, num, rp, tanggal } from '@/constants/theme-erp';
import { useLocalStore } from '@/hooks/use-local-store';
import { useCanWrite } from '@/services/permissions';
import {
  adaJatuhTempo,
  belumLunasOf,
  hutangOf,
  patchSupplier,
  supplierStore,
  TIPE_META,
  TODAY,
  totalBeliOf,
  type Supplier,
} from '@/stores/supplier';

function draftOf(c: Supplier): SupplierFormValues {
  return {
    kode: c.kode,
    nama: c.nama,
    tipe: c.tipe,
    narahubung: c.narahubung,
    telepon: c.telepon,
    email: c.email,
    npwp: c.npwp,
    kota: c.kota,
    alamat: c.alamat,
    tempo: String(c.tempo),
    aktif: c.aktif,
  };
}

export default function SupplierDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const suppliers = useLocalStore(supplierStore);
  const current = suppliers.find((c) => c.id === id) ?? null;

  const [draft, setDraft] = useState<SupplierFormValues | null>(null);
  const [draftErr, setDraftErr] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('supplier');

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

  // Runs once the record is in hand: the dataset is in memory, so this is the
  // same frame in practice, but the parameters still describe a supplier that
  // may not exist.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !current) return;
    seeded.current = true;
    if (params.baru === '1') toast(`Supplier ${current.nama} ditambahkan`);
    if (params.ubah === '1') setDraft(draftOf(current));
  }, [current, params.baru, params.ubah, toast]);

  const goBack = useCallback(() => {
    // Nothing to pop when this was a deep link, and `back()` would leave the app.
    if (router.canGoBack()) router.back();
    else router.replace('/supplier');
  }, [router]);

  const patchDraft = useCallback((patch: Partial<SupplierFormValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  function save() {
    if (!current || !draft) return;
    const nama = draft.nama.trim();
    if (!nama) return setDraftErr('400 — nama wajib diisi.');
    patchSupplier(current.id, {
      nama,
      tipe: draft.tipe,
      narahubung: draft.narahubung.trim(),
      telepon: draft.telepon.trim(),
      email: draft.email.trim(),
      npwp: draft.npwp.trim(),
      kota: draft.kota.trim(),
      alamat: draft.alamat.trim(),
      tempo: parseInt(draft.tempo || '0', 10) || 0,
      aktif: draft.aktif,
    });
    setDraft(null);
    setDraftErr('');
    toast('Perubahan tersimpan');
  }

  if (!current) {
    return (
      <AppShell title="Supplier">
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Supplier tidak ditemukan.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  const hutang = hutangOf(current);
  const jatuhTempo = adaJatuhTempo(current);
  const belum = belumLunasOf(current);

  return (
    <AppShell title="Supplier">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <BackButton onPress={goBack} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <Text style={styles.detailTitle}>{current.nama}</Text>
            <Badge {...TIPE_META[current.tipe]} label={TIPE_META[current.tipe].label} />
            {!current.aktif && <NeutralBadge />}
          </View>
          <View style={{ flex: 1 }} />
          {canWrite && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SecondaryButton label="Ubah supplier" onPress={() => setDraft(draftOf(current))} />
              <SecondaryButton
                label={current.aktif ? 'Nonaktifkan' : 'Aktifkan kembali'}
                tone={current.aktif ? 'text-danger' : 'text-primary'}
                onPress={() => {
                  patchSupplier(current.id, { aktif: !current.aktif });
                  toast(current.aktif ? 'Supplier dinonaktifkan' : 'Supplier diaktifkan kembali');
                }}
              />
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile
            label="Hutang berjalan"
            value={rp(hutang)}
            valueClass={hutang <= 0 ? 'text-foreground' : jatuhTempo ? 'text-danger' : 'text-foreground'}
            sub={
              hutang <= 0
                ? 'Tidak ada hutang berjalan'
                : jatuhTempo
                  ? 'Ada faktur lewat jatuh tempo'
                  : 'Ada hutang berjalan'
            }
            subClass={jatuhTempo ? 'text-danger' : 'text-faint'}
          />
          <StatTile
            label="Tempo bayar"
            value={current.tempo > 0 ? `${current.tempo} hari` : 'Tunai'}
            sub={current.tempo > 0 ? 'sejak tanggal faktur' : 'bayar di tempat'}
          />
          <StatTile
            label="Nilai pembelian"
            value={rp(totalBeliOf(current))}
            sub={`akumulasi ${current.faktur.length} faktur`}
          />
          <StatTile
            label="Faktur belum lunas"
            value={num(belum)}
            valueClass={belum > 0 ? C.red : C.text}
            sub={`dari ${current.faktur.length} faktur`}
          />
        </View>

        <Card>
          <CardHead title="Kontak & alamat" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <View style={styles.contactCell}>
              <Text style={styles.kLabel}>Narahubung</Text>
              <Text style={styles.kVal}>{current.narahubung || '—'}</Text>
            </View>
            <View style={styles.contactCell}>
              <Text style={styles.kLabel}>Telepon</Text>
              <Text style={styles.kVal}>{current.telepon || '—'}</Text>
            </View>
            <View style={styles.contactCell}>
              <Text style={styles.kLabel}>Email</Text>
              <Text style={styles.kVal}>{current.email || '—'}</Text>
            </View>
            <View style={[styles.contactCell, { borderRightWidth: 0 }]}>
              <Text style={styles.kLabel}>NPWP</Text>
              <Text style={styles.kVal}>{current.npwp || '—'}</Text>
            </View>
            <View style={styles.contactCell}>
              <Text style={styles.kLabel}>Kota</Text>
              <Text style={styles.kVal}>{current.kota || '—'}</Text>
            </View>
            <View style={[styles.contactCell, { flexBasis: '66%', borderRightWidth: 0 }]}>
              <Text style={styles.kLabel}>Alamat</Text>
              <Text style={styles.kVal}>{current.alamat || '—'}</Text>
            </View>
          </View>
        </Card>

        <Card>
          <CardHead
            title="Riwayat faktur pembelian"
            right={<Text style={{ fontSize: 14, color: C.muted3 }}>{current.faktur.length} faktur</Text>}
          />
          {current.faktur.length === 0 ? (
            <EmptyState
              title="Belum ada pembelian"
              sub="Faktur pembelian dari supplier ini akan muncul di sini."
            />
          ) : (
            current.faktur.map((h) => {
              const status =
                h.sisa <= 0
                  ? { label: 'Lunas', tone: 'green' as const }
                  : h.jatuh && h.jatuh < TODAY
                    ? { label: 'Jatuh tempo', tone: 'red' as const }
                    : { label: 'Belum jatuh tempo', tone: 'amber' as const };
              return (
                <View key={h.no} style={styles.notaRow}>
                  <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>{tanggal(h.tanggal)}</Text>
                  <Text style={{ width: 140, fontSize: 14, color: C.dark2, fontFamily: 'monospace' }}>
                    {h.no}
                  </Text>
                  <Text style={{ width: 120, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>
                    {rp(h.total)}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 20 }}>
                    <Badge {...status} small />
                  </View>
                  <Text
                    style={{
                      width: 120,
                      fontSize: 15,
                      fontWeight: '600',
                      textAlign: 'right',
                      color: h.sisa > 0 ? (status.label === 'Jatuh tempo' ? C.red : C.text) : C.muted,
                    }}>
                    {h.sisa > 0 ? rp(h.sisa) : '—'}
                  </Text>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>

      <SupplierFormModal
        visible={!!draft}
        values={draft ?? draftOf(current)}
        onChange={patchDraft}
        error={draftErr}
        onCancel={() => {
          setDraft(null);
          setDraftErr('');
        }}
        onSave={save}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  detailTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  contactCell: {
    flexGrow: 1,
    flexBasis: 200,
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: C.borderLighter,
    gap: 3,
  },
  kLabel: { fontSize: 12.5, color: C.muted2 },
  kVal: { fontSize: 15, color: C.text, lineHeight: 20 },
  notaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
});
