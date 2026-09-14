/**
 * Buka sesi hitung — pick a room, and stop it accepting stock.
 *
 * **This screen's whole job is to make one consequence unmissable.** The moment
 * `POST /stok-opname` returns, the `kartu_stok` trigger refuses every posting
 * into that room from every module: a purchase cannot be posted, a sale cannot
 * be rung up against it, a follow-up delivery cannot be received. That lasts
 * until the document is posted or cancelled, which may be days. Nothing else in
 * this app has a side effect that wide, and it is not something to discover
 * afterwards from a 409 on a different screen.
 *
 * So the warning is not a footnote under the button: it is the body of the
 * screen, above the choice, and the pill says "Bekukan dan mulai hitung" rather
 * than "Simpan". A room that already has an unfinished session is shown as such
 * and cannot be picked — the server answers 409 for it anyway
 * (`stok_opname_ruang_terbuka_uidx`), and finding that out after a tap teaches
 * nothing.
 *
 * `uraian_so` is offered because it is the only header field that can be edited
 * afterwards, and because a session someone else has to verify is easier to
 * decide on when it says what was counted and why.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahStackCard,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { createStokOpname, opnameBus } from '@/services/stok-opname';
import { listRuang, type RuangRow } from '@/services/ruang';

export default function StokOpnameBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangErr, setRuangErr] = useState('');
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [uraian, setUraian] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = String(reloadToken);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // `GET /ruang` answers only the rooms inside the session's active unit
        // kerja, which is also what `POST /stok-opname` validates `id_ruang`
        // against — so whatever comes back is exactly the set that may be
        // chosen, and `nomor_opname_beku` says which of them already cannot be.
        const answer = await listRuang({ size: 100, is_aktif: true });
        if (!alive) return;
        setRuangList(answer.data);
        setRuangErr('');
      } catch (e) {
        if (!alive) return;
        setRuangList([]);
        setRuangErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken, requestKey]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/stok-opname');
  }, [router]);

  const buka = useCallback(async () => {
    if (saving || ruangId === null) return;
    setSaving(true);
    setErr('');
    try {
      const created = await createStokOpname({
        id_ruang: ruangId,
        uraian_so: uraian.trim() === '' ? null : uraian.trim(),
      });
      // A new document changes which rooms are frozen, which is the first thing
      // the list draws — so it re-reads rather than patching a row in.
      opnameBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/stok-opname/[id]', params: { id: created.id } });
    } catch (e) {
      // 409 is a room that already has an unfinished session, 403 a room
      // outside the active unit kerja. The server names both.
      setErr(messageOf(e, 'Gagal membuka sesi hitung.'));
      setSaving(false);
    }
  }, [saving, ruangId, uraian, router]);

  const dipilih = ruangList.find((r) => r.id === ruangId) ?? null;

  return (
    <View style={styles.screen}>
      <RamahHeader title="Buka sesi hitung" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {/* The consequence, above the choice rather than under the button. */}
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={20} color={C.amber600} />
          <View style={styles.grow}>
            <Text style={styles.warnTitle}>Gudangnya langsung beku</Text>
            <Text style={styles.warnText}>
              Sejak sesi ini dibuka, tidak ada pembelian, penjualan atau kiriman susulan yang bisa
              diposting ke gudang itu — sampai hitungannya diposting atau dibatalkan. Bukanya
              memang begitu: rak yang masih bergerak tidak bisa dihitung.
            </Text>
          </View>
        </View>

        <View style={styles.groupStart}>
          <RamahSectionHeader>Gudang yang dihitung</RamahSectionHeader>
        </View>
        {ruangErr ? (
          <RamahInlineError message={ruangErr} onRetry={() => setReloadToken((n) => n + 1)} />
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : ruangList.length === 0 ? (
          <View style={styles.kosongBox}>
            <Text style={styles.kosong}>Tidak ada gudang aktif di unit kerja ini.</Text>
            {/* Issue #23: this used to be the whole screen, with no way out. */}
            <RamahSecondaryButton
              label="Atur gudang"
              icon="settings"
              onPress={() => router.push('/pengaturan')}
            />
          </View>
        ) : (
          <RamahStackCard>
            {ruangList.map((r) => (
              <RuangOption
                key={r.id}
                ruang={r}
                selected={r.id === ruangId}
                onPress={() => {
                  setRuangId(r.id);
                  setErr('');
                }}
              />
            ))}
          </RamahStackCard>
        )}

        <RamahField
          label="Catatan sesi"
          value={uraian}
          onChangeText={setUraian}
          placeholder="Hitung rak A sampai C, akhir bulan"
          autoCapitalize="sentences"
          multiline
          maxLength={1000}
        />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {err ? <RamahInlineError message={err} /> : null}
        {dipilih ? (
          <RamahNote icon="lock">
            {`${dipilih.nama} akan berhenti menerima posting sampai hitungan ini selesai.`}
          </RamahNote>
        ) : null}
        {/* The verb says what actually happens, not "Simpan". */}
        <RamahPrimaryButton
          label={saving ? 'Membuka…' : 'Bekukan dan mulai hitung'}
          icon="lock"
          onPress={buka}
          disabled={saving || ruangId === null}
          busy={saving}
        />
      </View>
    </View>
  );
}

/**
 * One room.
 *
 * A room already frozen by another session is drawn muted and is not selectable:
 * `stok_opname_ruang_terbuka_uidx` refuses a second open session with a 409, and
 * `GET /ruang` already hands over the number of the document responsible — so
 * the row can say which one rather than just refusing.
 */
function RuangOption({
  ruang,
  selected,
  onPress,
}: {
  ruang: RuangRow;
  selected: boolean;
  onPress: () => void;
}) {
  const beku = ruang.nomorOpnameBeku !== null;
  return (
    <Pressable
      onPress={beku ? undefined : onPress}
      disabled={beku}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: beku }}
      accessibilityLabel={
        beku
          ? `${ruang.nama}, sudah dibekukan oleh opname ${ruang.nomorOpnameBeku}`
          : ruang.nama
      }
      style={[styles.option, beku && styles.optionBeku]}>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <Feather name="check" size={14} color={C.white} /> : null}
      </View>
      <View style={styles.grow}>
        <Text style={styles.optionTitle} numberOfLines={1}>
          {ruang.nama}
        </Text>
        <Text style={styles.optionSub} numberOfLines={1}>
          {beku
            ? `Sudah dihitung lewat ${ruang.nomorOpnameBeku}`
            : ruang.namaUnitKerja || 'Siap dihitung'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space4,
    paddingBottom: L.space10,
    gap: L.stack,
  },
  // A heading in this `stack` column opens a new group: `group` above it.
  groupStart: { paddingTop: L.group - L.stack },

  warn: {
    flexDirection: 'row',
    gap: L.space3,
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.amber50,
    borderWidth: 1,
    borderColor: C.amber100,
  },
  warnTitle: { ...T.titleTiny, color: C.textTitle },
  warnText: { ...T.bodySmall, color: C.textBody },

  loadingBox: { paddingVertical: L.space6, alignItems: 'center' },
  kosong: { ...T.bodySmall, color: C.textBody, paddingVertical: L.space4 },
  kosongBox: { gap: L.space3, alignItems: 'flex-start' },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    paddingHorizontal: L.cardPad,
    paddingVertical: L.cardPadDense,
    // Guide §7: a list row is 56, and 44 is only the bare tap minimum.
    minHeight: L.rowH,
  },
  optionBeku: { opacity: 0.55 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: C.brand, borderColor: C.brand },
  optionTitle: { ...T.titleTiny, color: C.textTitle },
  optionSub: { ...T.bodySmall, color: C.textBody },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
