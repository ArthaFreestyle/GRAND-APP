/**
 * Permintaan pemakaian baru — which room, who is asking, for what, and which goods.
 *
 * **Who is asking** is `id_pemohon`, a real user id, and not necessarily the
 * person typing. Choosing somebody else needs `GET /user`, which the contract
 * keeps `SUPERADMIN`-only even for reading. So for every other grant the
 * requester is the signed-in user and the field is locked; a superadmin gets a
 * search. That is the contract's shape, not a missing feature — and a superadmin
 * who requests for themselves needs a *second* superadmin to approve it, because
 * `pemakaian_penyetuju_check` refuses self-approval. The detail says so when it
 * matters rather than here.
 *
 * `keperluan` is required (`NOT NULL`) and is what the list leads with, so it is
 * the one text field that is not optional. Each line takes its own `keterangan`
 * — 1 DUS for the workshop and 3 PCS for the office are two lines of one request.
 *
 * Lines are optional to save (the create accepts none), but `ajukan` refuses an
 * empty request. It saves a draft; the pill says so.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BarisBarangEditor,
  barisToInput,
  lengkapiBaris,
  terapkanLengkap,
  type BarisDraft,
} from '@/components/shell/baris-barang';
import { DaftarRuangPilihan, useDaftarRuang } from '@/components/shell/pilih-ruang';
import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahPickerField,
  RamahPrimaryButton,
  RamahSearchSheet,
  RamahSecondaryButton,
  RamahSheet,
  type RamahSearchOption,
} from '@/components/shell/ramah';
import { todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createPemakaian, pemakaianBus } from '@/services/pemakaian';
import { useActiveRole } from '@/services/permissions';
import { useSession } from '@/services/session';
import { cariUser, namaUser } from '@/services/user';

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function PemakaianBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const session = useSession();
  const role = useActiveRole();
  const daftar = useDaftarRuang();

  const bolehPilihPemohon = role === 'SUPERADMIN';

  const [tanggal, setTanggal] = useState(todayISO);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [pemohon, setPemohon] = useState<{ id: number; nama: string } | null>(() =>
    session?.user?.id ? { id: session.user.id, nama: namaUser(session.user) } : null
  );
  const [keperluan, setKeperluan] = useState('');
  const [lines, setLines] = useState<BarisDraft[]>([]);
  const [sheet, setSheet] = useState<'ruang' | 'pemohon' | null>(null);

  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemakaian');
  }, [router]);

  const updateLines = useCallback(
    (updater: (prev: BarisDraft[]) => BarisDraft[]) => setLines(updater),
    []
  );

  const cariPemohon = useCallback(async (term: string): Promise<RamahSearchOption[]> => {
    const users = await cariUser(term);
    return users.map((u) => ({
      value: String(u.id),
      label: u.nama,
      sub: u.nama !== u.username ? u.username : undefined,
    }));
  }, []);

  async function pilihRuang(id: number) {
    setRuangId(id);
    setSheet(null);
    setErr('');
    if (lines.some((l) => l.idProduct !== null)) {
      const lengkap = await lengkapiBaris(lines, id);
      setLines((prev) => terapkanLengkap(prev, lengkap));
    }
  }

  async function simpan() {
    if (saving) return;
    if (!TANGGAL_RE.test(tanggal)) return setErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
    if (ruangId === null) return setErr('Pilih gudangnya.');
    if (pemohon === null) return setErr('Pilih pemohonnya.');
    if (keperluan.trim() === '') return setErr('Isi keperluannya.');
    const detail = barisToInput(lines, { minimalSatu: false, pakaiKeterangan: true });
    if (!detail.ok) return setErr(detail.error);

    setSaving(true);
    setErr('');
    try {
      const created = await createPemakaian({
        tanggal,
        id_ruang: ruangId,
        id_pemohon: pemohon.id,
        keperluan: keperluan.trim(),
        detail: detail.detail,
      });
      pemakaianBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pemakaian/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan permintaan.'));
      setSaving(false);
    }
  }

  const namaRuang = ruangId === null ? '' : (daftar.ruang.find((r) => r.id === ruangId)?.nama ?? '');

  return (
    <View style={styles.screen}>
      <RamahHeader title="Permintaan baru" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.fields}>
          {daftar.err ? <RamahInlineError message={daftar.err} onRetry={daftar.reload} /> : null}
          {!daftar.loading && !daftar.err && daftar.ruang.length === 0 ? (
            <View style={styles.kosongBox}>
              <Text style={styles.kosong}>Tidak ada gudang aktif di unit kerja ini.</Text>
              <RamahSecondaryButton
                label="Atur gudang"
                icon="settings"
                onPress={() => router.push('/pengaturan')}
              />
            </View>
          ) : null}

          <RamahField
            label="Keperluan"
            required
            value={keperluan}
            onChangeText={setKeperluan}
            placeholder="Servis truk pengiriman"
            multiline
            maxLength={1000}
          />
          <RamahPickerField
            label="Gudang"
            required
            value={namaRuang}
            placeholder={daftar.loading ? 'Memuat gudang…' : 'Pilih gudang'}
            locked={daftar.loading || daftar.ruang.length === 0}
            onPress={() => setSheet('ruang')}
          />
          <RamahPickerField
            label="Pemohon"
            required
            value={pemohon?.nama ?? ''}
            placeholder="Pilih pemohon"
            locked={!bolehPilihPemohon}
            onPress={() => setSheet('pemohon')}
          />
          <RamahField
            label="Tanggal"
            required
            value={tanggal}
            onChangeText={setTanggal}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            maxLength={10}
          />
        </View>

        <BarisBarangEditor
          judul="Barang diminta"
          drafts={lines}
          onChange={updateLines}
          idRuang={ruangId}
          pakaiKeterangan
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {err ? <RamahInlineError message={err} /> : null}
        <RamahPrimaryButton
          label="Simpan draf"
          onPress={() => void simpan()}
          busy={saving}
          disabled={saving}
        />
      </View>

      <RamahSheet visible={sheet === 'ruang'} title="Gudang" onClose={() => setSheet(null)}>
        <DaftarRuangPilihan
          ruang={daftar.ruang}
          selectedId={ruangId}
          onPick={(r) => void pilihRuang(r.id)}
        />
      </RamahSheet>

      {bolehPilihPemohon ? (
        <RamahSearchSheet
          visible={sheet === 'pemohon'}
          title="Pemohon"
          onClose={() => setSheet(null)}
          search={cariPemohon}
          onPick={(o) => {
            setPemohon({ id: Number(o.value), nama: o.label });
            setErr('');
          }}
          placeholder="Cari nama atau username"
          emptyHint="Tidak ada akun aktif yang cocok."
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space4,
    paddingBottom: L.space10,
    gap: L.group,
  },
  fields: { gap: L.space5 },
  kosongBox: { gap: L.space3, alignItems: 'flex-start' },
  kosong: { ...T.bodySmall, color: C.textBody },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.related,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
