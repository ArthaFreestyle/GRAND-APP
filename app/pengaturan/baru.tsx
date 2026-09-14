/**
 * Unit kerja baru — two fields and one save, the same shape `pemasok/baru.tsx`
 * is and for the same reason: a route rather than a dialog, because it is a
 * place in the app somebody could be linked into with nothing underneath it
 * that it is a question *about*.
 *
 * `nama` is the only required field. A new unit kerja is created with no ruang
 * at all — that is exactly the state issue #23 exists to give a way out of, so
 * the detail this screen lands on is where "Tambah ruang" lives next.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EMPTY_UNIT_KERJA,
  UnitKerjaFields,
  unitKerjaBody,
  unitKerjaError,
  type UnitKerjaValues,
} from '@/components/pengaturan/unit-kerja-form';
import { RamahHeader, RamahInlineError, RamahPrimaryButton } from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createUnitKerja, unitKerjaBus } from '@/services/unit-kerja';

export default function PengaturanBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [values, setValues] = useState<UnitKerjaValues>(EMPTY_UNIT_KERJA);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengaturan');
  }, [router]);

  const lengkap = unitKerjaError(values) === '';

  const save = useCallback(async () => {
    if (saving) return;
    const salah = unitKerjaError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const created = await createUnitKerja(unitKerjaBody(values));
      unitKerjaBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pengaturan/[id]', params: { id: created.id } });
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan unit kerja.'));
      setSaving(false);
    }
  }, [saving, values, router]);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Unit kerja baru" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <UnitKerjaFields
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
          label={saving ? 'Menyimpan…' : 'Simpan unit kerja'}
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
  },
  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
