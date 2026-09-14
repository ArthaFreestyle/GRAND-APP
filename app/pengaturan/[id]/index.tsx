/**
 * Detail unit kerja — who it is, which ruang it holds, and the one toggle on
 * this screen that needs a sentence in front of it before it is pressed.
 *
 * ## Why the ruang list here is filtered client-side, and why an empty list
 * does not always mean "no rooms"
 *
 * `GET /ruang` has no `id_unit_kerja` filter at all — it answers whatever the
 * *caller's own* active context can see: every ruang inside the session's
 * active unit kerja, or every ruang in every unit for a global context (one
 * whose grant carries no `id_unit_kerja` of its own). So this screen reads
 * that set once and keeps only the rows that belong to the unit it is showing.
 *
 * That is exactly right when the unit being viewed **is** the session's own
 * active one, or the session is global. It is wrong, silently, the moment
 * somebody with a grant scoped to Unit A opens Unit B here: the read still
 * succeeds, it just cannot contain a single row that matches Unit B, and a bare
 * "belum ada ruang" would claim Unit B has none when the truth is this session
 * cannot see it from where it is standing. `ruangVisible` is what tells the two
 * apart, and the note only appears in the second case — see issue #23's own
 * wording: "itu batas yang perlu dikatakan, bukan disembunyikan."
 *
 * ## Why deactivating asks first instead of just answering
 *
 * Every other retirement in this app (`pemasok`, `ruang` itself) is a plain
 * icon tap: the contract enforces what it needs to with a 409 and the sentence
 * that follows says so. A unit kerja is different — nothing about
 * `PATCH /unit-kerja/{id}` fails when it is about to strand somebody. Every
 * grant naming this unit simply stops being usable and drops out of its
 * holder's `grants` at their next login, and there is no response body that
 * says that happened. So this is the one archive icon in the app that opens a
 * sheet first: the consequence has to be read *before* the request, because
 * nothing says it after.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahStackCard,
  RamahStackRow,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahMotion,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listRuang, ruangBus, type RuangRow } from '@/services/ruang';
import { useSession } from '@/services/session';
import {
  getUnitKerja,
  unitKerjaBus,
  unitKerjaDetailBus,
  updateUnitKerja,
  type UnitKerjaRow,
} from '@/services/unit-kerja';

export default function PengaturanDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const session = useSession();
  const canWriteUnit = useCanWrite('unit-kerja');
  const canWriteRuang = useCanWrite('ruang');

  const [unitKerja, setUnitKerja] = useState<UnitKerjaRow | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [kabar, setKabar] = useState('');
  const [confirmNonaktif, setConfirmNonaktif] = useState(false);
  const [busyToggle, setBusyToggle] = useState(false);

  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangErr, setRuangErr] = useState('');
  const [ruangLoaded, setRuangLoaded] = useState(false);
  const [ruangReloadToken, setRuangReloadToken] = useState(0);

  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const loadErr = idValid ? loadErrState : 'Alamat unit kerja tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const reloadRuang = useCallback(() => setRuangReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const u = await getUnitKerja(id);
        if (!alive) return;
        setUnitKerja(u);
        setLoadErr('');
      } catch (e) {
        if (!alive) return;
        setUnitKerja(null);
        setLoadErr(messageOf(e, 'Gagal memuat unit kerja.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken, requestKey]);

  /**
   * The ruang read is independent of the unit kerja read on purpose: a room
   * list that fails should not blank a record that loaded fine, and the two
   * fail for different reasons entirely.
   */
  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const answer = await listRuang({ size: 100 });
        if (!alive) return;
        setRuangList(answer.data.filter((r) => r.idUnitKerja === id));
        setRuangErr('');
      } catch (e) {
        if (!alive) return;
        setRuangList([]);
        setRuangErr(messageOf(e, 'Gagal memuat daftar ruang.'));
      } finally {
        if (alive) setRuangLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, ruangReloadToken]);

  useRecordBus(unitKerjaDetailBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    setUnitKerja(change.row);
    setKabar('Perubahan tersimpan.');
  });

  useRecordBus(ruangBus, (change) => {
    if (change.kind === 'reload') {
      reloadRuang();
      return;
    }
    const saved = change.row;
    setRuangList((list) =>
      list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? saved : r)) : list
    );
  });

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengaturan');
  }, [router]);

  /**
   * A global grant (no `id_unit_kerja` of its own) sees every ruang as
   * `GET /ruang` normally would; a scoped one only ever sees its own unit's
   * rooms, no matter which unit this screen is showing.
   */
  const activeUnitId = session?.active?.id_unit_kerja;
  const isGlobal = !!session?.active && !activeUnitId;
  const ruangVisible = isGlobal || activeUnitId === id;

  const doToggle = useCallback(
    async (next: boolean) => {
      if (!unitKerja || busyToggle) return;
      setBusyToggle(true);
      try {
        const saved = await updateUnitKerja(unitKerja.id, { is_aktif: next });
        setUnitKerja(saved);
        unitKerjaBus.publish({ kind: 'saved', row: saved });
        setKabar(saved.aktif ? 'Unit kerja aktif lagi.' : 'Unit kerja dinonaktifkan.');
        setLoadErr('');
        setConfirmNonaktif(false);
      } catch (e) {
        setLoadErr(messageOf(e, 'Gagal mengubah status unit kerja.'));
      } finally {
        setBusyToggle(false);
      }
    },
    [unitKerja, busyToggle]
  );

  const onPressToggle = useCallback(() => {
    if (!unitKerja) return;
    // Reactivating has no side effect worth a sheet — only the way down does.
    if (unitKerja.aktif) setConfirmNonaktif(true);
    else doToggle(true);
  }, [unitKerja, doToggle]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail unit kerja" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Unit kerja tidak ditemukan</Text>
          <Text style={styles.centerSub}>{loadErr}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke daftar" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!unitKerja) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail unit kerja" onBack={goBack} />
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={C.brand} />
          ) : (
            <RamahInlineError message="Unit kerja tidak terbaca." onRetry={reload} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail unit kerja"
        onBack={goBack}
        right={
          canWriteUnit ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah unit kerja"
                onPress={() => router.push({ pathname: '/pengaturan/[id]/ubah', params: { id } })}
              />
              <RamahIconButton
                icon={unitKerja.aktif ? 'trash-2' : 'rotate-ccw'}
                label={unitKerja.aktif ? 'Nonaktifkan unit kerja' : 'Aktifkan kembali'}
                color={unitKerja.aktif ? C.danger : C.brandInk}
                onPress={onPressToggle}
                disabled={busyToggle}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <Text style={styles.identityName}>{unitKerja.nama}</Text>
          <Text style={styles.identitySub}>{unitKerja.kode || 'Tanpa kode'}</Text>
          {unitKerja.aktif ? null : (
            <View style={styles.badgeRow}>
              <RamahBadge label="Nonaktif" tone="neutral" />
            </View>
          )}
        </View>

        <RamahSectionHeader
          action={canWriteRuang && ruangVisible ? 'Tambah' : undefined}
          onAction={
            canWriteRuang && ruangVisible
              ? () =>
                  router.push({
                    pathname: '/pengaturan/ruang/baru',
                    params: { idUnitKerja: id, namaUnitKerja: unitKerja.nama },
                  })
              : undefined
          }>
          Ruang di unit ini
        </RamahSectionHeader>

        {!ruangVisible ? (
          <RamahNote icon="eye-off">
            {`Ganti ke unit ${unitKerja.nama} untuk melihat ruang.`}
          </RamahNote>
        ) : ruangErr ? (
          <RamahInlineError message={ruangErr} onRetry={reloadRuang} />
        ) : !ruangLoaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : ruangList.length === 0 ? (
          <Text style={styles.kosong}>Belum ada ruang terdaftar di unit ini.</Text>
        ) : (
          <RamahStackCard>
            {ruangList.map((r) => (
              <RamahStackRow
                key={r.id}
                icon="archive"
                tone="stok"
                title={r.nama}
                subtitle={r.kode || 'Tanpa kode'}
                meta={!r.aktif ? 'Nonaktif' : r.nomorOpnameBeku ? 'Sedang dibekukan' : undefined}
                muted={!r.aktif}
                onPress={() => router.push({ pathname: '/pengaturan/ruang/[id]', params: { id: r.id } })}
              />
            ))}
          </RamahStackCard>
        )}

        <Text style={styles.jejak}>
          {`Dibuat ${formatTanggal(unitKerja.createdAt)}${
            unitKerja.namaPembuat ? ` oleh ${unitKerja.namaPembuat}` : ''
          }`}
        </Text>
      </ScrollView>

      <RamahSheet
        visible={confirmNonaktif}
        title="Nonaktifkan unit kerja?"
        onClose={() => setConfirmNonaktif(false)}>
        <View style={styles.confirmBody}>
          <Text style={styles.confirmText}>
            Setiap wewenang (grant) yang menyebut &quot;{unitKerja.nama}&quot; berhenti bisa
            dipakai begitu ini disimpan, dan hilang dari daftar peran pemegangnya pada saat masuk
            berikutnya. Ruang di dalamnya tetap ada dan tetap tercatat di riwayat — hanya tidak
            bisa dipilih lagi di layar mana pun sampai unit ini diaktifkan kembali.
          </Text>
          {loadErr ? <RamahInlineError message={loadErr} /> : null}
          <View style={styles.confirmActions}>
            <DangerButton label="Nonaktifkan" busy={busyToggle} onPress={() => doToggle(false)} />
            <RamahTertiaryButton
              label="Batal"
              onPress={() => setConfirmNonaktif(false)}
              height={L.controlHSm + 4}
            />
          </View>
        </View>
      </RamahSheet>
    </View>
  );
}

/**
 * The same outlined-red shape `components/shell/aksi-dialog.tsx` gives a
 * `danger` document transition — guide §6 keeps a solid fill for the one green
 * pill a screen is allowed, so a consequential-but-not-fatal toggle like this
 * one gets red text on an outline rather than a second solid colour.
 */
function DangerButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      accessibilityLabel={label}
      style={[
        styles.danger,
        busy && { opacity: 0.4 },
        down && !busy && { backgroundColor: C.red50, transform: [{ scale: RamahMotion.pressScale }] },
      ]}>
      <Text style={styles.dangerLabel}>{busy ? 'Memproses…' : label}</Text>
    </Pressable>
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
    gap: L.cardGap,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6, gap: L.space2 },
  centerTitle: { ...T.groupTitle, color: C.textTitle },
  centerSub: { ...T.caption, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: 2, paddingVertical: L.space2 },
  identityName: { ...T.identity, color: C.textTitle },
  identitySub: { ...T.caption, color: C.textBody },
  badgeRow: { flexDirection: 'row', paddingTop: L.space2 },

  kosong: { ...T.caption, color: C.textBody, paddingVertical: L.space2 },
  jejak: { ...T.caption, color: C.textMuted, paddingTop: L.space2 },

  confirmBody: { paddingHorizontal: L.gutter, gap: L.space4, paddingBottom: L.space2 },
  confirmText: { ...T.body, color: C.textBody },
  confirmActions: { gap: 10, paddingTop: L.space1 },

  danger: {
    height: L.controlH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.danger,
  },
  dangerLabel: { fontSize: 16, lineHeight: 20, ...W.semibold, color: C.danger },
});
