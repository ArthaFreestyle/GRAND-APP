/**
 * Ubah ruang — the same two fields as `baru`, over a record that exists.
 *
 * A route rather than a dialog, for the reason every other edit form in this
 * app is: a `Modal` presents from the bottom edge while every other push in
 * this section comes in from the right.
 *
 * `id_unit_kerja` is not on this form and cannot be — `PATCH /ruang/{id}`
 * never accepts it, so there is no unit picker to draw here at all.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RuangFields, ruangBody, ruangError, type RuangValues } from '@/components/pengaturan/ruang-form';
import {
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { getRuang, ruangBus, updateRuang } from '@/services/ruang';

export default function RuangUbahScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.cardGap);

  const [values, setValues] = useState<RuangValues | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const idValid = Number.isFinite(id) && id > 0;
  const loadErr = idValid ? loadErrState : 'Alamat ruang tidak dikenali.';

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const r = await getRuang(id);
        if (!alive) return;
        setValues({ nama: r.nama });
        setLoadErr('');
      } catch (e) {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat ruang.'));
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
    const salah = ruangError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await updateRuang(id, ruangBody(values));
      ruangBus.publish({ kind: 'saved', row: saved });
      goBack();
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan perubahan.'));
      setSaving(false);
    }
  }, [saving, values, id, goBack]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah ruang" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Ruang tidak ditemukan</Text>
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
        <RamahHeader title="Ubah ruang" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ubah ruang" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <RuangFields
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
  centerTitle: { ...T.groupTitle, color: C.textTitle },
  centerSub: { ...T.caption, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },
  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.cardGap,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
