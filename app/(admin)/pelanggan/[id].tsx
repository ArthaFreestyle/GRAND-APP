/**
 * Pelanggan — one customer.
 *
 * A route, so a customer can be deep linked and the back button returns to the
 * list instead of leaving the section. `?ubah=1` opens the edit dialog on
 * arrival, which is how the list's "Ubah" button gets here; `?baru=1` says the
 * create form just landed, and this screen does the announcing because the
 * record it names is only known once it has been read back.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PelangganFormModal,
  type PelangganFormValues,
} from '@/components/pelanggan/form';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card,
  CardHead,
  EmptyState,
  GhostButton,
  IconAction,
  NeutralBadge,
  StatTile,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, rp, tanggal } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { decimalToNumber, rupiahToDecimal } from '@/services/decimal';
import {
  getPelanggan,
  listPiutang,
  pelangganBus,
  updatePelanggan,
  type Pelanggan,
  type PiutangNota,
} from '@/services/pelanggan';
import { useCanWrite } from '@/services/permissions';

/** The dialog only ever fills itself from a customer that is already loaded. */
function draftOf(c: Pelanggan): PelangganFormValues {
  return {
    kode: c.kode,
    nama: c.nama,
    telepon: c.telepon,
    alamat: c.alamat,
    npwp: c.npwp,
    plafon: c.plafon === null ? '0' : String(Math.round(decimalToNumber(c.plafon))),
    tanpaBatas: c.plafon === null,
    aktif: c.aktif,
  };
}

export default function PelangganDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; ubah?: string; baru?: string }>();
  const id = Number(params.id);

  const [current, setCurrent] = useState<Pelanggan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [piutang, setPiutang] = useState<PiutangNota[]>([]);
  const [piutangTotal, setPiutangTotal] = useState(0);

  const [draft, setDraft] = useState<PelangganFormValues | null>(null);
  const [draftErr, setDraftErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pelanggan');

  // Read once, on the way in: the parameters seed this screen rather than
  // driving it, so closing the dialog does not have to rewrite the URL.
  const openEditOnLoad = useRef(params.ubah === '1');
  const announceCreated = useRef(params.baru === '1');

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

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoading(false);
      setLoadErr('Alamat pelanggan tidak dikenali.');
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadErr('');
    setPiutang([]);
    setPiutangTotal(0);
    getPelanggan(id)
      .then((detail) => {
        if (!alive) return;
        setCurrent(detail);
        if (announceCreated.current) {
          announceCreated.current = false;
          toast(`Pelanggan ${detail.nama} ditambahkan`);
        }
        if (openEditOnLoad.current) {
          openEditOnLoad.current = false;
          setDraft(draftOf(detail));
        }
        // Outstanding notes are their own paginated read; the customer record
        // never carries them.
        listPiutang(id, { size: 50 })
          .then((p) => {
            if (!alive) return;
            setPiutang(p.data);
            setPiutangTotal(p.paging.total_item ?? p.data.length);
          })
          .catch(() => {
            if (alive) setPiutang([]);
          });
      })
      .catch((e) => {
        if (!alive) return;
        setCurrent(null);
        // Arrived at cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page.
        setLoadErr(messageOf(e, 'Gagal memuat detail pelanggan.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, toast]);

  /** Every write answers with the whole customer, so this is the only sync needed. */
  const applyDetail = useCallback((saved: Pelanggan) => {
    setCurrent(saved);
    pelangganBus.publish({ kind: 'saved', row: saved });
  }, []);

  const goBack = useCallback(() => {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pelanggan');
  }, [router]);

  const patchDraft = useCallback((patch: Partial<PelangganFormValues>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDraftErr('');
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
    setDraftErr('');
  }, []);

  async function save() {
    if (!current || !draft || saving) return;
    const nama = draft.nama.trim();
    if (!nama) return setDraftErr('Nama wajib diisi.');

    setSaving(true);
    try {
      applyDetail(
        await updatePelanggan(current.id, {
          kode: draft.kode.trim() || null,
          nama,
          telepon: draft.telepon.trim() || null,
          alamat: draft.alamat.trim() || null,
          npwp: draft.npwp.trim() || null,
          plafon_kredit: draft.tanpaBatas ? null : rupiahToDecimal(draft.plafon),
          is_aktif: draft.aktif,
        })
      );
      closeDraft();
      toast('Perubahan tersimpan');
    } catch (e) {
      // 409 is a duplicate kode; the server names it.
      setDraftErr(messageOf(e, 'Gagal menyimpan pelanggan.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAktif() {
    if (!current || saving) return;
    const next = !current.aktif;
    setSaving(true);
    try {
      applyDetail(await updatePelanggan(current.id, { is_aktif: next }));
      toast(next ? 'Pelanggan diaktifkan kembali' : 'Pelanggan dinonaktifkan');
    } catch (e) {
      toast(messageOf(e, 'Gagal mengubah status pelanggan.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- derived ----

  const piutangJalan = piutang.reduce((s, n) => s + decimalToNumber(n.sisa_piutang), 0);
  const plafonAngka = current && current.plafon !== null ? decimalToNumber(current.plafon) : null;
  const nearLimit = plafonAngka !== null && plafonAngka > 0 && piutangJalan >= plafonAngka * 0.9;
  const sisaLimit = plafonAngka === null ? null : plafonAngka - piutangJalan;

  return (
    <AppShell
      title={current ? current.nama : 'Detail pelanggan'}
      onBack={goBack}
      headerRight={
        current && canWrite ? (
          <>
            <IconAction
              name="edit-2"
              label="Ubah pelanggan"
              onPress={() => setDraft(draftOf(current))}
            />
            {/* Archiving, not deleting: the contract has no DELETE for a
                pelanggan, and `is_aktif: false` is the only removal there is. The
                bin is what everyone reads as "take this out of the way", and
                the way back is the same button pointing the other way. */}
            <IconAction
              name={current.aktif ? 'trash-2' : 'rotate-ccw'}
              label={current.aktif ? 'Nonaktifkan pelanggan' : 'Aktifkan kembali'}
              tone={current.aktif ? 'danger' : 'primary'}
              onPress={toggleAktif}
              disabled={saving}
            />
          </>
        ) : undefined
      }>
      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {!loading && !current && (
        <View style={styles.centerBox}>
          <Text style={styles.errText}>{loadErr || 'Pelanggan tidak ditemukan.'}</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      )}

      {!loading && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {/* Everything that acts on the record is in the header bar now.
              What the record *is* stays here. */}
          {!current.aktif && (
            <View style={styles.detailHead}>
              <NeutralBadge />
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Piutang berjalan"
              value={rp(piutangJalan)}
              valueClass={piutangJalan <= 0 ? 'text-foreground' : nearLimit ? 'text-danger' : 'text-foreground'}
              sub={
                piutangJalan <= 0
                  ? 'Tidak ada tagihan berjalan'
                  : nearLimit
                    ? 'Mendekati / melewati plafon'
                    : 'Ada tagihan berjalan'
              }
              subClass={nearLimit ? 'text-danger' : 'text-faint'}
            />
            <StatTile
              label="Plafon kredit"
              value={plafonAngka === null ? 'Tanpa batas' : rp(plafonAngka)}
              sub={
                plafonAngka === null
                  ? 'Penjualan kredit tidak pernah ditolak'
                  : plafonAngka === 0
                    ? 'Tunai saja — kredit selalu ditolak'
                    : 'Ditegakkan saat posting nota kredit'
              }
            />
            <StatTile
              label="Sisa plafon"
              value={sisaLimit === null ? '—' : rp(Math.max(0, sisaLimit))}
              valueClass={sisaLimit !== null && sisaLimit < 0 ? 'text-danger' : 'text-foreground'}
              sub={plafonAngka === null ? 'tanpa batas' : `dari ${rp(plafonAngka)}`}
            />
            <StatTile
              label="Nota belum lunas"
              value={num(piutang.length)}
              valueClass={piutang.length > 0 ? C.red : C.text}
              sub={piutangTotal > piutang.length ? `dari ${piutangTotal} nota` : 'seluruhnya'}
            />
          </View>

          <Card>
            <CardHead title="Kontak & alamat" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Kode</Text>
                <Text style={styles.kVal}>{current.kode || '—'}</Text>
              </View>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Telepon</Text>
                <Text style={styles.kVal}>{current.telepon || '—'}</Text>
              </View>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>NPWP</Text>
                <Text style={styles.kVal}>{current.npwp || '—'}</Text>
              </View>
              <View style={[styles.contactCell, { borderRightWidth: 0 }]}>
                <Text style={styles.kLabel}>Alamat</Text>
                <Text style={styles.kVal}>{current.alamat || '—'}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <CardHead
              title="Piutang berjalan"
              right={<Text style={{ fontSize: 14, color: C.muted3 }}>{piutangTotal} nota</Text>}
            />
            {piutang.length === 0 ? (
              <EmptyState
                title="Tidak ada piutang berjalan"
                sub="Hanya nota kredit yang sudah diposting dan belum lunas yang muncul di sini — nota tunai tidak pernah jadi piutang."
              />
            ) : (
              piutang.map((h) => (
                <View key={h.id_penjualan} style={styles.notaRow}>
                  <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>{tanggal(h.tanggal ?? '')}</Text>
                  <Text style={{ flex: 1, fontSize: 14, color: C.dark2, fontFamily: 'monospace' }} numberOfLines={1}>
                    {h.nomor}
                  </Text>
                  <Text style={{ width: 140, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>
                    {rp(decimalToNumber(h.total))}
                  </Text>
                  <Text
                    style={{
                      width: 140,
                      fontSize: 15,
                      fontWeight: '600',
                      textAlign: 'right',
                      color: C.red,
                    }}>
                    {rp(decimalToNumber(h.sisa_piutang))}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}

      <PelangganFormModal
        visible={!!draft}
        values={draft ?? { kode: '', nama: '', telepon: '', alamat: '', npwp: '', plafon: '0', tanpaBatas: true, aktif: true }}
        onChange={patchDraft}
        error={draftErr}
        onCancel={closeDraft}
        onSave={save}
      />

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  contactCell: {
    minWidth: 200,
    flexGrow: 1,
    flexBasis: 0,
    padding: 16,
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: C.borderLight,
  },
  kLabel: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.4, color: C.muted },
  kVal: { fontSize: 15, color: C.text },
  notaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderLighter,
  },
});
