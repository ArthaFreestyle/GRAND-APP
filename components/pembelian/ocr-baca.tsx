/**
 * H2 — the wait for Gemini.
 *
 * The board draws this as a queue somebody can walk away from ("staf boleh
 * keluar layar tanpa membatalkan — antrean OCR jalan di server"). What
 * actually shipped is **synchronous**: one HTTP call that blocks until Gemini
 * answers, with no job id and no queue behind it. Leaving this screen kills
 * the request, and the photo has to be read again — billing Gemini a second
 * time for the same page. So the copy here says the opposite of the board:
 * stay on this screen.
 *
 * "Batalkan" is a real cancel (`AbortController.abort()`, wired all the way
 * through `apiUpload`), not a navigation trick — and it is the outlined pill,
 * never the solid one, matching guide §6's rule that a destructive or
 * abandoning action never gets the screen's one solid green pill.
 */
import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RamahInlineError, RamahTertiaryButton } from '@/components/shell/ramah';
import { RamahColors as C, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';

export function OcrBacaStep({
  err,
  onBatal,
  onCobaLagi,
  onIsiManual,
}: {
  /** Empty while the call is in flight; the server's own message once it fails. */
  err: string;
  onBatal: () => void;
  onCobaLagi: () => void;
  /** The escape hatch isu #36 asks for on a 404 — "belum aktif di server ini". */
  onIsiManual: () => void;
}) {
  if (err) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color={C.textDanger} />
          <Text style={styles.title}>Pembacaan gagal</Text>
          <RamahInlineError message={err} />
          <View style={styles.actions}>
            <RamahTertiaryButton label="Coba lagi" onPress={onCobaLagi} />
            <RamahTertiaryButton label="Isi manual" onPress={onIsiManual} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.title}>Membaca isi nota…</Text>
        <Text style={styles.sub}>
          Biasanya beberapa puluh detik. Jangan tinggalkan layar ini — keluar menghentikan
          pembacaan dan foto harus dibaca ulang.
        </Text>
        <RamahTertiaryButton label="Batalkan" onPress={onBatal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: L.gutter,
  },
  center: { alignItems: 'center', gap: L.stack, maxWidth: 320 },
  title: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  sub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: L.related },
});
