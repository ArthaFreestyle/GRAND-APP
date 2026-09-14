/**
 * Ubah unit kerja — the same two fields as `baru`, over a record that exists.
 *
 * A route rather than a dialog, for the second half of the rule `produk`
 * worked out: a `Modal` presents from the bottom edge while every other push
 * in this section comes in from the right, so the one form that *changes* a
 * record would announce itself as a different kind of thing from the one that
 * creates one.
 *
 * `is_aktif` is not on this form — see `components/pengaturan/unit-kerja-form.tsx`.
 * It stays the detail's own header action, next to the warning that goes with it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  UnitKerjaFields,
  unitKerjaBody,
  unitKerjaError,
  type UnitKerjaValues,
} from '@/components/pengaturan/unit-kerja-form';
import {
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import {
  getUnitKerja,
  unitKerjaBus,
  unitKerjaDetailBus,
  updateUnitKerja,
} from '@/services/unit-kerja';

export default function PengaturanUbahScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [values, setValues] = useState<UnitKerjaValues | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const idValid = Number.isFinite(id) && id > 0;
  const loadErr = idValid ? loadErrState : 'Alamat unit kerja tidak dikenali.';

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const u = await getUnitKerja(id);
        if (!alive) return;
        setValues({ nama: u.nama });
        setLoadErr('');
      } catch (e) {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat unit kerja.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengaturan');
  }, [router]);

  const save = useCallback(async () => {
    if (saving || !values) return;
    const salah = unitKerjaError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await updateUnitKerja(id, unitKerjaBody(values));
      unitKerjaDetailBus.publish({ kind: 'saved', row: saved });
      unitKerjaBus.publish({ kind: 'saved', row: saved });
      goBack();
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan perubahan.'));
      setSaving(false);
    }
  }, [saving, values, id, goBack]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah unit kerja" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Unit kerja tidak ditemukan</Text>
          <Text style={styles.centerSub}>{loadErr}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!values) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah unit kerja" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ubah unit kerja" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <UnitKerjaFields
          values={values}
          onChange={(patch) => {
            setValues((v) => (v ? { ...v, ...patch } : v));
            setErr('');
          }}
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {err ? <RamahInlineError message={err} /> : null}
        <RamahPrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan perubahan'}
          icon="check"
          onPress={save}
          disabled={saving}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: L.space6,
    gap: L.space2,
  },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },
  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
