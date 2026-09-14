/**
 * Ruang baru — opened from one unit kerja's detail, never on its own.
 *
 * `id_unit_kerja` is required by `POST /ruang` and cannot be changed
 * afterwards (`PATCH /ruang/{id}` never touches it), so it is chosen once, by
 * whichever unit kerja screen this was pushed from, and arrives as a param
 * rather than a field on this form — the same shape
 * `penerimaan-susulan/baru` takes `idPembelian` in.
 *
 * Read once on arrival: this is a pushed route, mounted fresh every time, so
 * there is no stale-ref hazard the way there would be reading a param on a
 * section root kept alive by its navigator.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EMPTY_RUANG, RuangFields, ruangBody, ruangError, type RuangValues } from '@/components/pengaturan/ruang-form';
import { RamahHeader, RamahInlineError, RamahNote, RamahPrimaryButton } from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createRuang, ruangBus } from '@/services/ruang';

export default function RuangBaruScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ idUnitKerja: string; namaUnitKerja?: string }>();
  const idUnitKerja = Number(params.idUnitKerja);
  const namaUnitKerja = params.namaUnitKerja ?? '';
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [values, setValues] = useState<RuangValues>(EMPTY_RUANG);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const idValid = Number.isFinite(idUnitKerja) && idUnitKerja > 0;

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengaturan');
  }, [router]);

  const lengkap = idValid && ruangError(values) === '';

  const save = useCallback(async () => {
    if (saving || !idValid) return;
    const salah = ruangError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const created = await createRuang({ ...ruangBody(values), id_unit_kerja: idUnitKerja });
      // A new row has no place to be patched into the unit kerja detail's own
      // list, and lands wherever the server's ordering puts it — same reason
      // every other "baru" screen in this app reloads rather than patches.
      ruangBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pengaturan/ruang/[id]', params: { id: created.id } });
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan ruang.'));
      setSaving(false);
    }
  }, [saving, idValid, values, idUnitKerja, router]);

  if (!idValid) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ruang baru" onBack={goBack} />
        <View style={styles.center}>
          <RamahInlineError message="Unit kerja tujuan tidak dikenali. Buka dari detail unit kerjanya." />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ruang baru" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <RamahNote icon="map-pin">
          {namaUnitKerja
            ? `Akan dibuat di ${namaUnitKerja}. Unitnya tidak bisa diganti setelah disimpan.`
            : 'Unitnya tidak bisa diganti setelah disimpan.'}
        </RamahNote>
        <RuangFields
          values={values}
          onChange={(patch) => {
            setValues((v) => ({ ...v, ...patch }));
            setErr('');
          }}
          autoFocus
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {err ? <RamahInlineError message={err} /> : null}
        <RamahPrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan ruang'}
          icon="check"
          onPress={save}
          disabled={saving || !lengkap}
          busy={saving}
        />
      </View>
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
    gap: L.space4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6 },
  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
