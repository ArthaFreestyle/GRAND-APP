/**
 * Saldo awal baru — a cutover date, a gudang, and why.
 *
 * Only the header is typed here. The lines are a separate, larger job (up to 500
 * of them) and live on the document itself, which this screen replaces itself
 * with the moment the draft exists — so back from the document returns to the
 * list, not to a form that has already been submitted.
 *
 * **`alasan` is required and is never allowed to be empty**, here or later
 * through `PATCH`: it is the only record of why inventory value was created with
 * no document behind it. The fence — one `(barang, ruang)` for life — is the first
 * thing the screen says, above the fields, because it is the one consequence
 * nobody can undo afterwards.
 *
 * The gudang comes from `components/shell/pilih-ruang.tsx`, which already draws a
 * room frozen by an open stok opname as disabled and names the opname.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DaftarRuangPilihan, useDaftarRuang } from '@/components/shell/pilih-ruang';
import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPickerField,
  RamahPrimaryButton,
  RamahSheet,
} from '@/components/shell/ramah';
import { todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createSaldoAwal, saldoAwalBus } from '@/services/saldo-awal';

export default function SaldoAwalBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const daftar = useDaftarRuang();

  const [tanggal, setTanggal] = useState(todayISO());
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState('');
  const [sheet, setSheet] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/saldo-awal');
  }, [router]);

  const dipilih = daftar.ruang.find((r) => r.id === ruangId) ?? null;
  const tanggalOk = /^\d{4}-\d{2}-\d{2}$/.test(tanggal);
  const siap = tanggalOk && ruangId !== null && alasan.trim() !== '';

  const simpan = useCallback(async () => {
    if (saving || ruangId === null) return;
    setSaving(true);
    setErr('');
    try {
      const created = await createSaldoAwal({
        tanggal,
        id_ruang: ruangId,
        alasan: alasan.trim(),
      });
      saldoAwalBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/saldo-awal/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      setErr(messageOf(e, 'Gagal membuat draf saldo awal.'));
      setSaving(false);
    }
  }, [saving, ruangId, tanggal, alasan, router]);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Saldo awal baru" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <RamahNote icon="alert-triangle">
          Satu barang hanya bisa diberi saldo awal sekali di satu gudang, seumur hidup.
        </RamahNote>

        <RamahField
          label="Tanggal cutover"
          required
          value={tanggal}
          onChangeText={(v) => {
            setTanggal(v);
            setErr('');
          }}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          maxLength={10}
          error={tanggal !== '' && !tanggalOk ? 'Tulis tanggalnya sebagai YYYY-MM-DD.' : undefined}
        />

        <View>
          {daftar.err ? (
            <RamahInlineError message={daftar.err} onRetry={daftar.reload} />
          ) : (
            <RamahPickerField
              label="Gudang"
              required
              value={dipilih?.nama ?? ''}
              placeholder={daftar.loading ? 'Memuat gudang…' : 'Pilih gudang'}
              onPress={() => setSheet(true)}
            />
          )}
        </View>

        <RamahField
          label="Alasan"
          required
          value={alasan}
          onChangeText={(v) => {
            setAlasan(v);
            setErr('');
          }}
          placeholder="Migrasi dari pembukuan lama, hitungan 1 September"
          multiline
          maxLength={1000}
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {err ? <RamahInlineError message={err} /> : null}
        <RamahPrimaryButton
          label={saving ? 'Membuat…' : 'Buat draf'}
          onPress={simpan}
          disabled={!siap || saving}
          busy={saving}
        />
      </View>

      <RamahSheet visible={sheet} title="Pilih gudang" onClose={() => setSheet(false)}>
        <DaftarRuangPilihan
          ruang={daftar.ruang}
          selectedId={ruangId}
          onPick={(r) => {
            setRuangId(r.id);
            setErr('');
            setSheet(false);
          }}
        />
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
  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
