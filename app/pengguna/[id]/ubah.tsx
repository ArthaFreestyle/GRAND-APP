/**
 * Ubah pengguna — identity and the whole wewenang set, over a record that
 * exists. A route rather than a dialog, the same G4 reasoning `produk` worked
 * out: a `Modal` presents from the bottom edge while every other push in this
 * section comes in from the right.
 *
 * No password field here — see `components/pengguna/pengguna-form.tsx`'s
 * header for why resetting somebody else's password stays its own action on
 * the detail screen instead.
 *
 * ## Why saving your own grants here does not just "work" like every other save
 *
 * The active context lives **inside the JWT**, not in a database row this
 * `PATCH` touches, and only `POST /auth/switch-context` can issue a token that
 * reflects a different one (CLAUDE.md's own rule: "no `X-Active-Role` header
 * exists anywhere — the active context is inside the credential"). So editing
 * your own grants here changes what the *server* will authorize on your next
 * request, while the token already in this session's pocket keeps claiming the
 * grant it was issued for — until it expires or is refreshed.
 *
 * `services/auth.ts`'s `getMe()` is how this screen tells the two apart
 * without waiting for that expiry: it re-reads what the current token
 * authorizes, and if the grant this session is running as is no longer in that
 * list, the edit just revoked the very thing that got the editor into this
 * screen. `reloadAllRecords()` covers the ordinary case — every list in the app
 * may now be answering a different unit kerja's rows — and `/pilih-peran` is
 * the honest next step for the case that grant is simply gone.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GrantEditor, grantsBody, type GrantValue } from '@/components/pengguna/grant-editor';
import {
  PenggunaIdentityFields,
  penggunaFieldErrors,
  penggunaIdentityBody,
  penggunaIdentityError,
  type PenggunaIdentityValues,
} from '@/components/pengguna/pengguna-form';
import { RamahHeader, RamahInlineError, RamahPrimaryButton, RamahSecondaryButton } from '@/components/shell/ramah';
import { RamahColors as C, RamahElevation as E, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { reloadAllRecords } from '@/hooks/use-record-bus';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { getMe } from '@/services/auth';
import { getPengguna, penggunaBus, penggunaDetailBus, updatePengguna } from '@/services/pengguna';
import { getSession, setSession, useSession } from '@/services/session';

interface FormValues {
  identity: PenggunaIdentityValues;
  grants: GrantValue[];
}

export default function PenggunaUbahScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const session = useSession();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [values, setValues] = useState<FormValues | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [errUsername, setErrUsername] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [errGeneral, setErrGeneral] = useState('');
  const [saving, setSaving] = useState(false);

  const idValid = Number.isFinite(id) && id > 0;
  const loadErr = idValid ? loadErrState : 'Alamat pengguna tidak dikenali.';

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const u = await getPengguna(id);
        if (!alive) return;
        setValues({
          identity: { username: u.username, namaLengkap: u.namaLengkap, email: u.email },
          grants: u.grants.map((g) => ({
            idRole: g.idRole,
            namaRole: g.namaRole,
            idUnitKerja: g.idUnitKerja,
            namaUnitKerja: g.namaUnitKerja,
          })),
        });
        setLoadErr('');
      } catch (e) {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat pengguna.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengguna');
  }, [router]);

  const isSelf = session?.user.id === id;

  const save = useCallback(async () => {
    if (saving || !values) return;
    const salah = penggunaIdentityError(values.identity);
    if (salah) {
      setErrUsername(salah);
      return;
    }
    setSaving(true);
    setErrUsername('');
    setErrEmail('');
    setErrGeneral('');
    try {
      const saved = await updatePengguna(id, {
        ...penggunaIdentityBody(values.identity),
        grants: grantsBody(values.grants),
      });
      penggunaDetailBus.publish({ kind: 'saved', row: saved });
      penggunaBus.publish({ kind: 'saved', row: saved });

      if (isSelf) {
        // Best-effort: a failed re-read must not strand the editor on a form
        // that already saved successfully. Worst case, the next request that
        // needs the revoked grant answers with the ordinary 403 instead.
        try {
          const me = await getMe();
          const current = getSession();
          if (current) setSession({ ...current, grants: me.grants ?? current.grants });
          reloadAllRecords();
          const stillActive = current?.active
            ? (me.grants ?? []).some((g) => g.id_user_role === current.active!.id_user_role)
            : true;
          if (!stillActive) {
            router.replace('/pilih-peran');
            return;
          }
        } catch {
          // Nothing to surface here — the identity/grant save already
          // succeeded, which is the part this screen is responsible for.
        }
      }
      goBack();
    } catch (e) {
      const fielded = penggunaFieldErrors(e);
      setErrUsername(fielded.username ?? '');
      setErrEmail(fielded.email ?? '');
      setErrGeneral(fielded.general ?? '');
      setSaving(false);
    }
  }, [saving, values, id, isSelf, router, goBack]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Ubah pengguna" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Pengguna tidak ditemukan</Text>
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
        <RamahHeader title="Ubah pengguna" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Ubah pengguna" onBack={goBack} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <PenggunaIdentityFields
          values={values.identity}
          onChange={(patch) => {
            setValues((v) => (v ? { ...v, identity: { ...v.identity, ...patch } } : v));
            setErrUsername('');
            setErrEmail('');
          }}
          errors={{ username: errUsername || undefined, email: errEmail || undefined }}
        />
        <GrantEditor
          values={values.grants}
          onChange={(grants) => setValues((v) => (v ? { ...v, grants } : v))}
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {errGeneral ? <RamahInlineError message={errGeneral} /> : null}
        <RamahPrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan perubahan'}
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
