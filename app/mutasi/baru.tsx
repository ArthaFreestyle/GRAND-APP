/**
 * Mutasi baru — two rooms, and what moves between them.
 *
 * **Both rooms are required, and they are two questions, not one.** The screen
 * this rebuild replaced folded mutasi and pemakaian into one form with a single
 * room; a mutasi without a destination is not a mutasi. The source is where the
 * balance is checked and the only room the grant is checked against; the
 * destination is never restricted by the contract, but can only be offered from
 * `GET /ruang` — see `services/mutasi.ts`.
 *
 * A room frozen by stok opname is drawn and cannot be picked for either end, and
 * one room cannot be both (`mutasi_ruang_check`).
 *
 * Lines are optional here: `POST /mutasi` accepts a draft with none, because a
 * mutasi is often opened while the trolley is still being loaded. The lines'
 * stock hint follows the source room, so changing it re-reads every balance.
 *
 * It saves a **draft**, and the pill says so. Nothing moves until a superadmin
 * posts it, and the detail it lands on says that.
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
  RamahSecondaryButton,
  RamahSheet,
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
import { createMutasi, mutasiBus } from '@/services/mutasi';

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function MutasiBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const daftar = useDaftarRuang();

  const [tanggal, setTanggal] = useState(todayISO);
  const [asal, setAsal] = useState<number | null>(null);
  const [tujuan, setTujuan] = useState<number | null>(null);
  const [keterangan, setKeterangan] = useState('');
  const [lines, setLines] = useState<BarisDraft[]>([]);
  const [sheet, setSheet] = useState<'asal' | 'tujuan' | null>(null);

  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const namaRuang = (id: number | null) =>
    id === null ? '' : (daftar.ruang.find((r) => r.id === id)?.nama ?? '');

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/mutasi');
  }, [router]);

  const updateLines = useCallback(
    (updater: (prev: BarisDraft[]) => BarisDraft[]) => setLines(updater),
    []
  );

  async function pilihAsal(id: number) {
    setAsal(id);
    setSheet(null);
    setErr('');
    // A balance quoted for the old room is a wrong number, not an approximate one.
    if (lines.some((l) => l.idProduct !== null)) {
      const lengkap = await lengkapiBaris(lines, id);
      setLines((prev) => terapkanLengkap(prev, lengkap));
    }
  }

  async function simpan() {
    if (saving) return;
    if (!TANGGAL_RE.test(tanggal)) return setErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
    if (asal === null) return setErr('Pilih gudang asal.');
    if (tujuan === null) return setErr('Pilih gudang tujuan.');
    const detail = barisToInput(lines, { minimalSatu: false, pakaiKeterangan: false });
    if (!detail.ok) return setErr(detail.error);

    setSaving(true);
    setErr('');
    try {
      const created = await createMutasi({
        tanggal,
        id_ruang_asal: asal,
        id_ruang_tujuan: tujuan,
        keterangan: keterangan.trim() || undefined,
        detail: detail.detail,
      });
      mutasiBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/mutasi/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 403 is a source room outside the active unit kerja; the server names it.
      setErr(messageOf(e, 'Gagal menyimpan mutasi.'));
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Mutasi baru" onBack={goBack} />

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

          <RamahPickerField
            label="Gudang asal"
            required
            value={namaRuang(asal)}
            placeholder={daftar.loading ? 'Memuat gudang…' : 'Pilih gudang'}
            locked={daftar.loading || daftar.ruang.length === 0}
            onPress={() => setSheet('asal')}
          />
          <RamahPickerField
            label="Gudang tujuan"
            required
            value={namaRuang(tujuan)}
            placeholder={daftar.loading ? 'Memuat gudang…' : 'Pilih gudang'}
            locked={daftar.loading || daftar.ruang.length === 0}
            onPress={() => setSheet('tujuan')}
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
          <RamahField
            label="Keterangan"
            value={keterangan}
            onChangeText={setKeterangan}
            placeholder="Opsional"
            multiline
            maxLength={1000}
          />
        </View>

        <BarisBarangEditor
          judul="Barang dipindah"
          drafts={lines}
          onChange={updateLines}
          idRuang={asal}
          pakaiKeterangan={false}
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

      <RamahSheet
        visible={sheet !== null}
        title={sheet === 'tujuan' ? 'Gudang tujuan' : 'Gudang asal'}
        onClose={() => setSheet(null)}>
        {sheet === 'asal' ? (
          <DaftarRuangPilihan
            ruang={daftar.ruang}
            selectedId={asal}
            lain={{ id: tujuan, label: 'Sudah jadi gudang tujuan' }}
            onPick={(r) => void pilihAsal(r.id)}
          />
        ) : sheet === 'tujuan' ? (
          <DaftarRuangPilihan
            ruang={daftar.ruang}
            selectedId={tujuan}
            lain={{ id: asal, label: 'Sudah jadi gudang asal' }}
            onPick={(r) => {
              setTujuan(r.id);
              setSheet(null);
              setErr('');
            }}
          />
        ) : null}
      </RamahSheet>
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
