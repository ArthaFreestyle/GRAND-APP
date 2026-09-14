/**
 * Pemasok baru.
 *
 * Five fields and one save. It is a route rather than a dialog because it is a
 * place in the app — a form somebody could be linked into, with nothing
 * underneath it that it is a question *about* — which is the split Expo
 * documents and the one `produk` worked out.
 *
 * `nama` is the only required field. Everything else may be left blank and
 * filled in later from the record, which is deliberate: a supplier usually gets
 * created in the middle of typing an invoice, and a form that insists on an
 * address before it will save is a form that gets an address made up for it.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EMPTY_PEMASOK,
  PemasokFields,
  pemasokBody,
  pemasokError,
  type PemasokValues,
} from '@/components/pemasok/form';
import {
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createSupplier, supplierBus } from '@/services/supplier';

export default function PemasokBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /**
   * The docked pill's bottom padding, keyboard included. Under edge-to-edge the
   * Android window is not resized when the IME opens, so a button on the bottom
   * edge is simply covered by it; `useDockPadding` swaps the safe-area inset for
   * the keyboard's height while it is up, because the two are alternatives — the
   * gesture bar that inset pays for is itself behind the keyboard.
   */
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [values, setValues] = useState<PemasokValues>(EMPTY_PEMASOK);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemasok');
  }, [router]);

  /**
  * Guide §5: the save pill is "nonaktif sampai bidang wajib terisi". `nama` is
  * the only required field — everything else can be filled in later from the
  * record, deliberately, because a supplier usually gets created in the middle
  * of typing an invoice.
  */
  const lengkap = pemasokError(values) === '';

  const save = useCallback(async () => {
    if (saving) return;
    // Still checked here as well as on the button: the disabled state stops the
    // press, and this stops a request going out on any path that reaches `save`
    // another way.
    const salah = pemasokError(values);
    if (salah) {
      setErr(salah);
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const created = await createSupplier(pemasokBody(values));
      // A new record has no row for the list to patch and lands wherever the
      // server's ordering puts it, so the list re-reads page one while the
      // reader moves on to the record itself.
      supplierBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pemasok/[id]', params: { id: created.id } });
    } catch (e) {
      // 409 is a duplicate kode, and the server names it — its wording beats
      // anything this screen could invent.
      setErr(messageOf(e, 'Gagal menyimpan pemasok.'));
      setSaving(false);
    }
  }, [saving, values, router]);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pemasok baru" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        <PemasokFields
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
        {/* Exactly one solid green pill per screen, docked, with a verb in it —
            and dead until the one required field holds something. */}
        <RamahPrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan pemasok'}
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
