/**
 * The confirmation in front of a workflow transition.
 *
 * Every one of the four is confirmed, which is not this project's usual habit —
 * `RecordList` runs reversible actions immediately and offers an undo instead.
 * None of these are reversible in that sense. `posting` appends to `kartu_stok`,
 * which is append-only: a wrong posting can only be reversed by a second
 * document that reverses it at today's moving average, in today's period. Even
 * `ajukan`, the mildest, locks the header and the lines against further editing.
 *
 * So the dialog says what the transition actually does rather than asking
 * "yakin?", and the two that need a reason collect it here — the contract makes
 * `alasan` and `alasan_batal` required precisely because a reversal nobody
 * explained cannot be told apart from a mistake, and `kartu_stok` keeps both
 * forever.
 *
 * Every document group that writes `kartu_stok` uses this one dialog, and they
 * do not all run the same transitions: pembelian and its derived documents run
 * four, penjualan runs two — `DRAFT → POSTED → BATAL`, with no approval step at
 * all. That costs the dialog nothing, because **every word it shows** — the
 * title, the explanation, the placeholder, whether a reason is collected at all
 * — comes off the `AksiDokumen` it is handed. It knows nothing about which
 * document it is confirming, which is why it lives in `shell/` rather than under
 * any one section. See `services/alur-dokumen.ts`.
 *
 * ## Why it is a sheet now
 *
 * It was a centred `ModalShell` over `theme-erp`. It is a `RamahSheet` over
 * `theme-ramah` now that every screen that raises it — `penerimaan-susulan`,
 * `stok-opname`, and pembelian as of issue #24 — has been ported to Ramah. One
 * shared file rather than one per palette: a second copy is how the wording
 * drifts apart again.
 *

 * A sheet rather than a centred card is also the better fit for what this is. It
 * is a question about the document underneath, raised from a button at the foot
 * of the screen; it rises from the same edge the button sits on, and the scrim
 * keeps the document readable behind it — which matters here, because the thing
 * being confirmed is the document.
 *
 * **The destructive action is not red-and-solid.** Guide §6 reserves red for
 * "required and wrong" and allows exactly one solid pill per surface, so a
 * transition marked `danger` gets the red *text* on an outlined pill and the
 * explanation above it does the work. The board draws `Tolak nota` as a solid
 * red button; it is the one place its own colour rule is broken, and the
 * explanation it sits under ("Nota kembali ke staf gudang sebagai draf") already
 * says this is a round trip rather than a deletion.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RamahField,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSheet,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahMotion,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import type { AksiDokumen } from '@/services/alur-dokumen';

export function AksiDialog({
  aksi,
  alasan,
  onChangeAlasan,
  error,
  onCancel,
  onConfirm,
  busy,
}: {
  /** `null` closes the dialog; the caller keeps the chosen action. */
  aksi: AksiDokumen | null;
  alasan: string;
  onChangeAlasan: (v: string) => void;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <RamahSheet visible={aksi !== null} title={aksi?.judul ?? ''} onClose={onCancel}>
      {aksi ? (
        <View style={styles.body}>
          {/* The explanation is the point of the dialog and is set at body size,
              not caption: it is the sentence somebody is being asked to agree
              to, and it is the only place the consequence is ever written. */}
          <Text style={styles.penjelasan}>{aksi.penjelasan}</Text>

          {aksi.alasanField ? (
            <RamahField
              label="Alasan"
              required
              value={alasan}
              onChangeText={onChangeAlasan}
              placeholder={aksi.contoh}
              helper="Maksimal 500 karakter. Tersimpan di dokumen dan tidak bisa dihapus."
              maxLength={500}
              // A reason is a sentence, and the contract allows 500 characters of
              // it. On one line the beginning scrolls out of sight while it is
              // being written, which is how reasons end up as three words.
              multiline
              autoFocus
            />
          ) : (
            <Text style={styles.jejak}>
              Dijalankan atas nama wewenang yang sedang aktif, dan tercatat di dokumen.
            </Text>
          )}

          {error ? <RamahInlineError message={error} /> : null}

          <View style={styles.actions}>
            {aksi.danger ? (
              <DangerButton label={aksi.label} busy={busy} onPress={onConfirm} />
            ) : (
              <RamahPrimaryButton label={aksi.label} onPress={onConfirm} busy={busy} disabled={busy} />
            )}
            <RamahTertiaryButton label="Batal" onPress={onCancel} height={L.controlHSm + 4} />
          </View>
        </View>
      ) : null}
    </RamahSheet>
  );
}

/**
 * The outlined red pill a `danger` transition gets.
 *
 * Not `RamahPrimaryButton` with a red fill, because the system has no such
 * button and adding one would make red an action colour — guide §6 keeps it for
 * "required and wrong". Outlined in `danger` with the label in `danger` is loud
 * enough at the bottom of a sheet whose title already says what is about to
 * happen, and it cannot be mistaken for the green pill every other screen ends
 * with.
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
  body: { paddingHorizontal: L.gutter, gap: L.space4, paddingBottom: L.space2 },
  penjelasan: { ...T.body, color: C.textBody },
  jejak: { ...T.caption, color: C.textMuted },
  actions: { gap: 10, paddingTop: L.space1 },

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
