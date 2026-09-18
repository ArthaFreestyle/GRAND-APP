/**
 * Detail pengguna — identity, the grants held, and the two actions that make
 * this the busiest detail screen in the app: editing, archiving, and resetting
 * a password all live here rather than being spread across the list.
 *
 * ## Reset password is a text button in the body, not a header icon
 *
 * Every other detail in this app puts its standing actions in `headerRight` as
 * icons (`edit-2`, the archive toggle) because they mean the same thing on
 * every record of a section — chrome, not content. "Reset password" fails that
 * test on purpose: its label *is* the point, the one-time consequence a reader
 * has to actually see written out before tapping it, so it stays a text button
 * in the body next to the group it is about.
 *
 * ## Two traps this screen exists to avoid
 *
 * Opening your own account hides the archive icon outright rather than
 * disabling it — the last superadmin who deactivates themselves here has no
 * way back into this app. Editing your own grants is `app/pengguna/[id]/ubah.tsx`'s
 * problem, not this screen's: see that file for why a self-edit does not
 * refresh the token.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahBadge,
  RamahField,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahStackCard,
  RamahStackRow,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import { RamahColors as C, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import {
  getPengguna,
  penggunaBus,
  penggunaDetailBus,
  resetPasswordPengguna,
  setPenggunaAktif,
  type PenggunaRow,
} from '@/services/pengguna';
import { penggunaFieldErrors, penggunaPasswordError } from '@/components/pengguna/pengguna-form';
import { roleLabel } from '@/services/permissions';
import { useSession } from '@/services/session';

export default function PenggunaDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const session = useSession();

  const [pengguna, setPengguna] = useState<PenggunaRow | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [kabar, setKabar] = useState('');
  const [busyToggle, setBusyToggle] = useState(false);

  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const loadErr = idValid ? loadErrState : 'Alamat pengguna tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const u = await getPengguna(id);
        if (!alive) return;
        setPengguna(u);
        setLoadErr('');
      } catch (e) {
        if (!alive) return;
        setPengguna(null);
        setLoadErr(messageOf(e, 'Gagal memuat pengguna.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken, requestKey]);

  useRecordBus(penggunaDetailBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    setPengguna(change.row);
    setKabar('Perubahan tersimpan.');
  });

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengguna');
  }, [router]);

  const isSelf = session?.user.id === pengguna?.id;

  const [resetOpen, setResetOpen] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const closeReset = useCallback(() => {
    setResetOpen(false);
    setPw1('');
    setPw2('');
    setPwErr('');
  }, []);

  const saveReset = useCallback(async () => {
    if (pwBusy || !pengguna) return;
    const salah = penggunaPasswordError(pw1);
    if (salah) {
      setPwErr(salah);
      return;
    }
    if (pw1 !== pw2) {
      setPwErr('Konfirmasi tidak sama dengan password baru.');
      return;
    }
    setPwBusy(true);
    setPwErr('');
    try {
      await resetPasswordPengguna(pengguna.id, pw1);
      closeReset();
      setKabar('Password diperbarui.');
    } catch (e) {
      const fielded = penggunaFieldErrors(e);
      setPwErr(fielded.password ?? messageOf(e, 'Gagal mengganti password.'));
    } finally {
      setPwBusy(false);
    }
  }, [pwBusy, pengguna, pw1, pw2, closeReset]);

  const toggleAktif = useCallback(async () => {
    if (!pengguna || busyToggle || isSelf) return;
    setBusyToggle(true);
    try {
      const saved = await setPenggunaAktif(pengguna.id, !pengguna.aktif);
      setPengguna(saved);
      penggunaBus.publish({ kind: 'saved', row: saved });
      setKabar(saved.aktif ? 'Pengguna aktif lagi.' : 'Pengguna dinonaktifkan.');
      setLoadErr('');
    } catch (e) {
      setLoadErr(messageOf(e, 'Gagal mengubah status pengguna.'));
    } finally {
      setBusyToggle(false);
    }
  }, [pengguna, busyToggle, isSelf]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail pengguna" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Pengguna tidak ditemukan</Text>
          <Text style={styles.centerSub}>{loadErr}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke daftar" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!pengguna) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail pengguna" onBack={goBack} />
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={C.brand} /> : <RamahInlineError message="Pengguna tidak terbaca." onRetry={reload} />}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail pengguna"
        onBack={goBack}
        right={
          <View style={styles.headerActions}>
            <RamahIconButton
              icon="edit-2"
              label="Ubah pengguna"
              onPress={() => router.push({ pathname: '/pengguna/[id]/ubah', params: { id } })}
            />
            {/* Hidden outright rather than disabled: the last superadmin who
                deactivates their own account here has no way back in. */}
            {isSelf ? null : (
              <RamahIconButton
                icon={pengguna.aktif ? 'trash-2' : 'rotate-ccw'}
                label={pengguna.aktif ? 'Nonaktifkan pengguna' : 'Aktifkan kembali'}
                color={pengguna.aktif ? C.danger : C.brandInk}
                onPress={() => void toggleAktif()}
                disabled={busyToggle}
              />
            )}
          </View>
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <Text style={styles.identityName}>{pengguna.namaLengkap || pengguna.username}</Text>
          <Text style={styles.identitySub}>{`@${pengguna.username}`}</Text>
          {pengguna.email ? <Text style={styles.identitySub}>{pengguna.email}</Text> : null}
          {pengguna.aktif ? null : (
            <View style={styles.badgeRow}>
              <RamahBadge label="Nonaktif" tone="neutral" />
            </View>
          )}
        </View>

        {isSelf ? <RamahNote>Ini akun Anda sendiri — tidak bisa dinonaktifkan dari sini.</RamahNote> : null}

        <View style={styles.groupStart}>
          <RamahSectionHeader>Wewenang</RamahSectionHeader>
        </View>

        {pengguna.grants.length === 0 ? (
          <Text style={styles.kosong}>Belum ada wewenang.</Text>
        ) : (
          <RamahStackCard>
            {pengguna.grants.map((g) => (
              <RamahStackRow
                key={g.idUserRole}
                icon="shield"
                tone="akun"
                title={roleLabel(g.namaRole)}
                subtitle={g.namaUnitKerja ?? 'Seluruh unit'}
                meta={!g.aktifRole ? 'Role nonaktif' : g.aktifUnitKerja === false ? 'Unit nonaktif' : undefined}
              />
            ))}
          </RamahStackCard>
        )}

        <View style={styles.resetWrap}>
          <RamahSecondaryButton label="Reset password" icon="key" onPress={() => setResetOpen(true)} />
        </View>

        <Text style={styles.jejak}>{`Dibuat ${formatTanggal(pengguna.createdAt)}`}</Text>
      </ScrollView>

      <RamahSheet visible={resetOpen} title="Reset password" onClose={closeReset}>
        <View style={styles.sheetBody}>
          <RamahField
            label="Password baru"
            required
            value={pw1}
            onChangeText={setPw1}
            secureTextEntry
            autoCapitalize="none"
            helper="Minimal 8 karakter."
          />
          <RamahField
            label="Ulangi password baru"
            required
            value={pw2}
            onChangeText={setPw2}
            secureTextEntry
            autoCapitalize="none"
          />
          {pwErr ? <RamahInlineError message={pwErr} /> : null}
          <RamahNote icon="info">Tidak perlu password lama — ini untuk memulihkan akun orang lain.</RamahNote>
          <RamahPrimaryButton
            label={pwBusy ? 'Menyimpan…' : 'Simpan password baru'}
            onPress={() => void saveReset()}
            busy={pwBusy}
            disabled={pwBusy}
          />
        </View>
      </RamahSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space10,
    gap: L.stack,
  },
  groupStart: { paddingTop: L.group - L.stack },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.inline, paddingVertical: L.space2 },
  identityName: { ...T.titleModerate, color: C.textTitle },
  identitySub: { ...T.bodySmall, color: C.textBody },
  badgeRow: { flexDirection: 'row', paddingTop: L.space2 },

  kosong: { ...T.bodySmall, color: C.textBody, paddingVertical: L.space2 },
  resetWrap: { flexDirection: 'row' },
  jejak: { ...T.bodySmall, color: C.textMuted, paddingTop: L.space2 },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space3, paddingBottom: L.space4 },
});
