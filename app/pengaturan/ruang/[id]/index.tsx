/**
 * Detail ruang — who it is, which unit it belongs to, and whether it is
 * currently frozen.
 *
 * ## The frozen-room link is resolved, not stored
 *
 * `Ruang.nomor_opname_beku` is a **document number**, not an id — it exists so
 * every other ruang picker in the app can print "Beku oleh opname SO/…"
 * without a second request. A number is not enough to link anywhere, so this
 * screen is the one place that spends a `GET /stok-opname?search=<nomor>` to
 * find the id behind it. If that lookup does not land on an exact match — a
 * search matching more than the one document, or none at all — the number is
 * still printed, just without a link, rather than guessing which row it meant.
 *
 * ## Retiring is a plain icon, not a confirm sheet
 *
 * Unlike deactivating a **unit kerja**, nothing here has an invisible side
 * effect the server's own answer does not already explain: `PATCH /ruang/{id}`
 * with `is_aktif: false` answers 409 by name — still holding stock, or frozen
 * by an open opname — and that sentence is exactly what somebody needs to read.
 * Same shape as `pemasok`'s archive icon.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahStackCard,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahIcon, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { getRuang, ruangBus, updateRuang, type RuangRow } from '@/services/ruang';
import { listStokOpname } from '@/services/stok-opname';

export default function RuangDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const canWrite = useCanWrite('ruang');

  const [ruang, setRuang] = useState<RuangRow | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  /**
   * The resolved id, and which `nomor` it was resolved for — the same "key
   * wanted" vs "key had" shape every other read in this app uses, so that a
   * ruang with no `nomorOpnameBeku` at all needs no effect run for it: the
   * link is simply not shown until `opnameFor` matches the current number.
   */
  const [opnameId, setOpnameId] = useState<number | null>(null);
  const [opnameFor, setOpnameFor] = useState<string | null>(null);

  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const loadErr = idValid ? loadErrState : 'Alamat ruang tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const r = await getRuang(id);
        if (!alive) return;
        setRuang(r);
        setLoadErr('');
      } catch (e) {
        if (!alive) return;
        setRuang(null);
        setLoadErr(messageOf(e, 'Gagal memuat ruang.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken, requestKey]);

  /**
   * Resolves the freezing document's id off its number, once the ruang itself
   * is in hand. A ruang that is not frozen needs no lookup at all — the
   * `if (!nomor) return` below leaves the effect with nothing to synchronize,
   * which is the shape `react-hooks/set-state-in-effect` asks for: no
   * setState on the path that runs synchronously, only inside the async
   * callback below the `await`.
   */
  useEffect(() => {
    const nomor = ruang?.nomorOpnameBeku;
    if (!nomor) return;
    let alive = true;
    (async () => {
      try {
        const answer = await listStokOpname({ search: nomor, size: 5 });
        if (!alive) return;
        const exact = answer.data.find((d) => d.nomor === nomor);
        setOpnameId(exact ? exact.id : null);
        setOpnameFor(nomor);
      } catch {
        if (!alive) return;
        setOpnameId(null);
        setOpnameFor(nomor);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ruang?.nomorOpnameBeku]);

  useRecordBus(ruangBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    if (change.row.id === id) setRuang(change.row);
  });

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pengaturan');
  }, [router]);

  const toggleAktif = useCallback(async () => {
    if (!ruang || busy) return;
    setBusy(true);
    try {
      const saved = await updateRuang(ruang.id, { is_aktif: !ruang.aktif });
      setRuang(saved);
      ruangBus.publish({ kind: 'saved', row: saved });
      setKabar(saved.aktif ? 'Ruang aktif lagi.' : 'Ruang dinonaktifkan.');
      setLoadErr('');
    } catch (e) {
      setLoadErr(messageOf(e, 'Gagal mengubah status ruang.'));
    } finally {
      setBusy(false);
    }
  }, [ruang, busy]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail ruang" onBack={goBack} />
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

  if (!ruang) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail ruang" onBack={goBack} />
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={C.brand} /> : (
            <RamahInlineError message="Ruang tidak terbaca." onRetry={reload} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail ruang"
        onBack={goBack}
        right={
          canWrite ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah ruang"
                onPress={() => router.push({ pathname: '/pengaturan/ruang/[id]/ubah', params: { id } })}
              />
              <RamahIconButton
                icon={ruang.aktif ? 'trash-2' : 'rotate-ccw'}
                label={ruang.aktif ? 'Nonaktifkan ruang' : 'Aktifkan kembali'}
                color={ruang.aktif ? C.danger : C.brandInk}
                onPress={toggleAktif}
                disabled={busy}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={ruang !== null && loading}
            onRefresh={reload}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <Text style={styles.identityName}>{ruang.nama}</Text>
          <Text style={styles.identitySub}>{ruang.kode || 'Tanpa kode'}</Text>
          {ruang.aktif ? null : (
            <View style={styles.badgeRow}>
              <RamahBadge label="Nonaktif" tone="neutral" />
            </View>
          )}
        </View>

        <View style={styles.groupStart}>
          <RamahSectionHeader>Unit kerja</RamahSectionHeader>
        </View>
        <RamahStackCard>
          <Baris label="Unit kerja" value={ruang.namaUnitKerja || '—'} />
        </RamahStackCard>

        {/* Only drawn when it says something — an unfrozen ruang needs no line
            telling it so, the same economy `nomor_opname_beku` follows on
            every other picker in the app. */}
        {ruang.nomorOpnameBeku ? (
          <Pressable
            onPress={
              opnameFor === ruang.nomorOpnameBeku && opnameId
                ? () => router.push({ pathname: '/stok-opname/[id]', params: { id: opnameId } })
                : undefined
            }
            disabled={!(opnameFor === ruang.nomorOpnameBeku && opnameId)}
            accessibilityRole={opnameFor === ruang.nomorOpnameBeku && opnameId ? 'button' : undefined}
            accessibilityLabel={`Dibekukan oleh sesi hitung ${ruang.nomorOpnameBeku}`}
            style={styles.bekuCard}>
            <View style={styles.grow}>
              <Text style={styles.bekuLabel}>Sedang dibekukan</Text>
              <Text style={styles.bekuValue}>{ruang.nomorOpnameBeku}</Text>
              <Text style={styles.bekuSub}>
                Tidak ada pembelian, penjualan atau kiriman susulan yang bisa diposting ke ruang
                ini sampai sesi hitung ini diposting atau dibatalkan.
              </Text>
            </View>
            {opnameFor === ruang.nomorOpnameBeku && opnameId ? (
              <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
            ) : null}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.baris}>
      <Text style={styles.barisLabel}>{label}</Text>
      <Text style={styles.barisValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space10,
    gap: L.stack,
  },
  // A heading in this `stack` column opens a new group: `group` above it.
  groupStart: { paddingTop: L.group - L.stack },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.inline, paddingVertical: L.space2 },
  identityName: { ...T.titleModerate, color: C.textTitle },
  identitySub: { ...T.bodySmall, color: C.textBody },
  badgeRow: { flexDirection: 'row', paddingTop: L.space2 },

  baris: {
    paddingHorizontal: L.cardPad,
    paddingVertical: L.cardPadDense,
    gap: L.inline,
    minHeight: L.rowH,
    justifyContent: 'center',
  },
  barisLabel: { ...T.caption, color: C.textBody },
  barisValue: { ...T.bodyModerate, color: C.textTitle },

  bekuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    borderRadius: 16,
    backgroundColor: C.orange50,
  },
  bekuLabel: { ...T.caption, color: C.textWarning },
  bekuValue: { ...T.titleTiny, color: C.textTitle, marginTop: L.inline },
  bekuSub: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },
});
