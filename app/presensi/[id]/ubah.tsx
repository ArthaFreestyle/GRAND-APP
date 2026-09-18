/**
 * Koreksi presensi — **SUPERADMIN**. A **route**, nested under the detail, on
 * the same lesson `app/produk/[id]/ubah.tsx` (G4) already paid for: a `Modal`
 * presents from the bottom edge, while every other push in this section slides
 * in from the right, so the one form that changes a record would announce
 * itself as a different kind of thing from the two screens beside it. As a
 * route, back returns to the detail underneath it on the stack, the animation
 * and the insets are the section's own (`app/presensi/_layout.tsx`), and the
 * answer travels back over `presensiBus` rather than a callback prop.
 *
 * ## What this form refuses to let happen
 *
 * - **No tanggal field.** The contract stamps `jam_masuk`/`jam_pulang` onto this
 *   row's own `tanggal` — a correction cannot cross a day, so there is nothing
 *   here to pick a date for.
 * - **No "kosongkan" control on jam pulang.** Reopening a `SELESAI` shift would
 *   reactivate `presensi_terbuka_uidx` for a day that has already passed, and
 *   the person could not clock in again tomorrow. So an empty field is read as
 *   "leave it alone" rather than "clear it" — `jam_pulang` is only ever sent
 *   when the field actually holds something.
 * - **No status field.** The server recomputes it from the columns; filling
 *   `jam_pulang` on a `LUPA_PULANG` row turns it `SELESAI` by itself.
 * - **Shift is corrected, never re-derived.** Fixing a typo in the time must
 *   not silently move somebody to the other shift, so `shift` travels as its
 *   own field and defaults to whatever the row already has.
 * - **A 409 is shown as the server wrote it**, not folded into a field error —
 *   it names a shift the person already has on this date, which is the
 *   server's fact to state, not this form's to reinterpret.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import {
  RamahChip,
  RamahField,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import { RamahColors as C, RamahElevation as E, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  formatJam,
  getPresensi,
  koreksiPresensi,
  presensiBus,
  type KoreksiPresensiBody,
  type PresensiRow,
  type Shift,
} from '@/services/presensi';

/** 24-hour wall clock, `HH:MM` — exactly the shape `PATCH /presensi/{id}` wants. */
const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function KoreksiPresensiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const idValid = Number.isFinite(id) && id > 0;
  const canOpen = useCanWrite('presensi');

  const [row, setRow] = useState<PresensiRow | null>(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!idValid || !canOpen) return;
    let alive = true;
    getPresensi(id)
      .then((r) => {
        if (alive) setRow(r);
      })
      .catch((e) => {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat presensi.'));
      });
    return () => {
      alive = false;
    };
  }, [id, idValid, canOpen]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/presensi');
  }, [router]);

  const onSaved = useCallback(
    (saved: PresensiRow) => {
      presensiBus.publish({ kind: 'saved', row: saved });
      goBack();
    },
    [goBack]
  );

  if (!canOpen) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Koreksi presensi" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Tidak berwenang</Text>
          <Text style={styles.centerSub}>Halaman ini hanya untuk superadmin.</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!idValid || loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Koreksi presensi" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Presensi tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat presensi tidak dikenali.'}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Koreksi presensi" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return <KoreksiForm row={row} onSaved={onSaved} onDone={goBack} />;
}

/**
 * Split off so every field seeds once from `useState`'s initialiser, the same
 * reason `app/produk/[id]/ubah.tsx`'s form is its own component: mounted only
 * once the record is in hand, so "seed once" is what `useState` already means.
 */
function KoreksiForm({
  row,
  onSaved,
  onDone,
}: {
  row: PresensiRow;
  onSaved: (saved: PresensiRow) => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [jamMasuk, setJamMasuk] = useState(formatJam(row.jamMasuk));
  const [jamPulang, setJamPulang] = useState(row.jamPulang ? formatJam(row.jamPulang) : '');
  const [shift, setShift] = useState<Shift>(row.shift);
  const [alasan, setAlasan] = useState('');

  const [jamMasukErr, setJamMasukErr] = useState('');
  const [jamPulangErr, setJamPulangErr] = useState('');
  const [alasanErr, setAlasanErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const jm = jamMasuk.trim();
    const jp = jamPulang.trim();
    const al = alasan.trim();

    let ok = true;
    if (!JAM_RE.test(jm)) {
      setJamMasukErr('Format 24 jam, HH:MM.');
      ok = false;
    } else {
      setJamMasukErr('');
    }
    if (jp !== '' && !JAM_RE.test(jp)) {
      setJamPulangErr('Format 24 jam, HH:MM.');
      ok = false;
    } else {
      setJamPulangErr('');
    }
    if (al.length < 3) {
      setAlasanErr('Tulis alasan koreksi ini.');
      ok = false;
    } else {
      setAlasanErr('');
    }
    if (!ok) return;

    setSaveErr('');
    setSaving(true);
    try {
      const body: KoreksiPresensiBody = { jam_masuk: jm, shift, alasan_koreksi: al };
      // Blank means "leave it alone", not "clear it" — see the file header.
      if (jp !== '') body.jam_pulang = jp;
      const saved = await koreksiPresensi(row.id, body);
      onSaved(saved);
    } catch (e) {
      // Covers the 409 the contract documents for a shift already taken on the
      // target date — the server's own sentence, shown as it came rather than
      // pinned to one field.
      setSaveErr(messageOf(e, 'Gagal menyimpan koreksi.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Koreksi presensi" onBack={onDone} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.context} numberOfLines={1}>
          {row.namaUser || '—'} · {formatTanggal(row.tanggal)}
        </Text>

        <RamahField
          label="Jam masuk"
          required
          value={jamMasuk}
          onChangeText={(v) => {
            setJamMasuk(v);
            setJamMasukErr('');
          }}
          placeholder="08:00"
          error={jamMasukErr}
          helper="Jam dinding WIB, 24 jam."
        />

        <RamahField
          label="Jam pulang"
          value={jamPulang}
          onChangeText={(v) => {
            setJamPulang(v);
            setJamPulangErr('');
          }}
          placeholder="17:00"
          error={jamPulangErr}
          helper={
            row.jamPulang
              ? 'Sudah tercatat — mengosongkan berarti tidak diubah, bukan dihapus.'
              : 'Isi kalau memang sudah pulang; kosongkan kalau belum.'
          }
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Shift<Text style={styles.fieldStar}> *</Text>
          </Text>
          <View style={styles.shiftRow}>
            <RamahChip label="Pagi" selected={shift === 'PAGI'} onPress={() => setShift('PAGI')} />
            <RamahChip label="Malam" selected={shift === 'MALAM'} onPress={() => setShift('MALAM')} />
          </View>
        </View>

        <RamahField
          label="Alasan koreksi"
          required
          multiline
          value={alasan}
          onChangeText={(v) => {
            setAlasan(v);
            setAlasanErr('');
          }}
          placeholder="Kenapa jam ini diubah"
          error={alasanErr}
        />

        {saveErr ? <RamahInlineError message={saveErr} /> : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton label="Simpan koreksi" onPress={save} busy={saving} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space6, gap: L.space5 },

  context: { ...T.bodySmall, color: C.textMuted },

  field: { gap: L.inline },
  fieldLabel: { ...T.caption, color: C.textBody },
  fieldStar: { color: C.textDanger },
  shiftRow: { flexDirection: 'row', gap: L.related, paddingTop: L.inline },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
