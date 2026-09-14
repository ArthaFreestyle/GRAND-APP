/**
 * Ubah pemasok — the same five fields as `baru`, over a record that exists.
 *
 * **A route, not a dialog**, and that is the second half of the rule `produk`
 * worked out rather than the first. By the first half alone — only reached from
 * the detail, returns to the detail, about the record the detail is already
 * showing — this looks like a dialog. But a `Modal` presents from the **bottom
 * edge** while every other push in a section comes in from the right, so the one
 * form that changes a record would announce itself as a different kind of thing
 * from the one that creates one. How a thing arrives is part of what it says it
 * is.
 *
 * Being a route also hands back three things a dialog hand-rolls: the animation
 * and the insets are the section's, declared once in `_layout.tsx`, and back
 * returns to the detail because the detail is literally underneath it.
 *
 * It costs one `GET /supplier/{id}`, which is what buys a URL that works opened
 * cold — the detail's copy of the record is not reachable from here, and reading
 * it through a parameter would be a form seeded from a serialized record rather
 * than from the server.
 *
 * ## Why the whole body is sent even though `PATCH` is partial
 *
 * The contract's `PATCH` treats an absent key as "leave it alone" and an
 * explicit `null` as "clear it". This screen shows all five fields at once, so
 * every one of them is something the reader has just looked at and decided
 * about — including the ones they emptied. Sending only the changed keys would
 * mean tracking which fields were touched, and getting that wrong in the
 * direction of omission silently refuses a deletion somebody asked for.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PemasokFields,
  pemasokBody,
  pemasokError,
  type PemasokValues,
} from '@/components/pemasok/form';
import {
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import {
  getSupplier,
  supplierBus,
  supplierDetailBus,
  updateSupplier,
} from '@/services/supplier';

export default function PemasokUbahScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.cardGap);

  const [values, setValues] = useState<PemasokValues | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Derived during render, not written from an effect: a malformed `:id` is a
  // fact the params already carry.
  const idValid = Number.isFinite(id) && id > 0;
  const loadErr = idValid ? loadErrState : 'Alamat pemasok tidak dikenali.';

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const s = await getSupplier(id);
        if (!alive) return;
        setValues({
          kode: s.kode,
          nama: s.nama,
          telepon: s.telepon,
          alamat: s.alamat,
          npwp: s.npwp,
        });
        setLoadErr('');
      } catch (e) {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat pemasok.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  /**
   * `dismiss()` targets this section's own Stack, which pops straight onto the
   * detail — there is no `[id]/_layout.tsx`, so the folder flattens into the
   * section's stack and the detail is literally the screen below.
   */
  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemasok');
  }, [router]);

  const save = useCallback(async () => {
    if (saving || !values) return;
    const salah = pemasokError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await updateSupplier(id, pemasokBody(values));
      // Both buses: the detail underneath redraws the record, and the list under
      // *that* patches its row. Neither hears its own echo, which is why the two
      // buses exist — see `services/supplier.ts`.
      supplierDetailBus.publish({ kind: 'saved', row: saved });
      supplierBus.publish({ kind: 'saved', row: saved });
      goBack();
    } catch (e) {
      setErr(messageOf(e, 'Gagal menyimpan perubahan.'));
      setSaving(false);
    }
  }, [saving, values, id, goBack]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah pemasok" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Pemasok tidak ditemukan</Text>
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
        <RamahHeader title="Ubah pemasok" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ubah pemasok" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <PemasokFields
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
