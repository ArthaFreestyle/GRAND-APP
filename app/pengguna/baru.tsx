/**
 * Pengguna baru — one screen, not a wizard. `produk/baru.tsx` needs three
 * steps because deriving satuan and prices from a barang is genuinely three
 * separate questions; a user account is short enough — identity, a password,
 * which grants — that splitting it into steps would be inventing structure the
 * form does not need. `POST /user` takes all three in one transaction anyway
 * (`grants` included), so there is no partial state to protect against either.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GrantEditor, grantsBody, type GrantValue } from '@/components/pengguna/grant-editor';
import {
  EMPTY_PENGGUNA_IDENTITY,
  PenggunaIdentityFields,
  PenggunaPasswordField,
  penggunaFieldErrors,
  penggunaIdentityBody,
  penggunaIdentityError,
  penggunaPasswordError,
  type PenggunaIdentityValues,
} from '@/components/pengguna/pengguna-form';
import { RamahHeader, RamahInlineError, RamahPrimaryButton } from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L } from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createPengguna, penggunaBus } from '@/services/pengguna';

export default function PenggunaBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [identity, setIdentity] = useState<PenggunaIdentityValues>(EMPTY_PENGGUNA_IDENTITY);
  const [password, setPassword] = useState('');
  const [grants, setGrants] = useState<GrantValue[]>([]);
  const [errUsername, setErrUsername] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [errPassword, setErrPassword] = useState('');
  const [errGeneral, setErrGeneral] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengguna');
  }, [router]);

  const save = useCallback(async () => {
    if (saving) return;
    const identitySalah = penggunaIdentityError(identity);
    const passwordSalah = penggunaPasswordError(password);
    if (identitySalah || passwordSalah) {
      setErrUsername(identitySalah);
      setErrPassword(passwordSalah);
      return;
    }
    setSaving(true);
    setErrUsername('');
    setErrEmail('');
    setErrPassword('');
    setErrGeneral('');
    try {
      const created = await createPengguna({
        ...penggunaIdentityBody(identity),
        password,
        grants: grantsBody(grants),
      });
      penggunaBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pengguna/[id]', params: { id: created.id } });
    } catch (e) {
      const fielded = penggunaFieldErrors(e);
      setErrUsername(fielded.username ?? '');
      setErrEmail(fielded.email ?? '');
      setErrPassword(fielded.password ?? '');
      setErrGeneral(fielded.general ?? (fielded.username || fielded.email || fielded.password ? '' : messageOf(e, 'Gagal menyimpan pengguna.')));
      setSaving(false);
    }
  }, [saving, identity, password, grants, router]);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pengguna baru" onBack={goBack} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <PenggunaIdentityFields
          values={identity}
          onChange={(patch) => {
            setIdentity((v) => ({ ...v, ...patch }));
            setErrUsername('');
            setErrEmail('');
          }}
          errors={{ username: errUsername || undefined, email: errEmail || undefined }}
          autoFocus
        />
        <PenggunaPasswordField
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setErrPassword('');
          }}
          error={errPassword || undefined}
        />
        <GrantEditor values={grants} onChange={setGrants} />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {errGeneral ? <RamahInlineError message={errGeneral} /> : null}
        <RamahPrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan pengguna'}
          icon="check"
          onPress={() => void save()}
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
