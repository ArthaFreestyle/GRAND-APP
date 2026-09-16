/**
 * H1 of the real OCR branch — pick which ticking convention the paper follows,
 * then take exactly one picture of it.
 *
 * ## Why one photo, not the multi-page tray `FotoNotaStep` collects
 *
 * Both `POST /pembelian/ocr/*` take **one file per call** and never store it.
 * Ten sequential Gemini calls for one faktur is not a real v1 either in time
 * or in billing (isu #36, "Berapa foto per nota"), so this step reads the one
 * page staff mark as the faktur's summary. Any other page is still attached to
 * the draft afterward through the ordinary `POST /dokumen` → `tempel` path —
 * just not read.
 *
 * ## Why the document type is asked here rather than guessed from the photo
 *
 * The two endpoints disagree about what a checkmark means: on a faktur
 * kedatangan it decides `qty_diterima`, and on a vendor nota it is ignored
 * outright. Guessing wrong from the photo would silently read every line's
 * received quantity backwards; one question up front is cheaper than that.
 */
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
} from '@/constants/theme-ramah';
import type { JenisDokumenOcr } from '@/services/ocr-pembelian';

/** Quality only, matching `FotoNotaStep` — see that file for why not size. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
};

export interface FotoOcr {
  uri: string;
  nama: string;
  mime: string;
}

export function OcrFotoStep({
  jenis,
  onJenis,
  foto,
  onFoto,
  onBack,
  onBaca,
  dockPad,
}: {
  jenis: JenisDokumenOcr;
  onJenis: (j: JenisDokumenOcr) => void;
  foto: FotoOcr | null;
  onFoto: (f: FotoOcr | null) => void;
  onBack: () => void;
  onBaca: () => void;
  dockPad: number;
}) {
  const [err, setErr] = useState('');

  const ambilFoto = useCallback(async () => {
    const izin = await ImagePicker.requestCameraPermissionsAsync();
    if (!izin.granted) {
      setErr(
        izin.canAskAgain
          ? 'Izin kamera belum diberikan, jadi foto tidak bisa diambil.'
          : 'Izin kamera ditolak permanen. Aktifkan lewat Pengaturan aplikasi.'
      );
      return;
    }
    const hasil = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (hasil.canceled) return;
    const asset = hasil.assets[0];
    setErr('');
    onFoto({
      uri: asset.uri,
      nama: asset.fileName ?? `nota-${Date.now()}.jpg`,
      mime: asset.mimeType ?? 'image/jpeg',
    });
  }, [onFoto]);

  const pilihGaleri = useCallback(async () => {
    const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) {
      setErr(
        izin.canAskAgain
          ? 'Izin galeri belum diberikan, jadi foto tidak bisa dipilih.'
          : 'Izin galeri ditolak permanen. Aktifkan lewat Pengaturan aplikasi.'
      );
      return;
    }
    // Single selection only — the OCR endpoints read one file per call.
    const hasil = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (hasil.canceled) return;
    const asset = hasil.assets[0];
    setErr('');
    onFoto({
      uri: asset.uri,
      nama: asset.fileName ?? `nota-${Date.now()}.jpg`,
      mime: asset.mimeType ?? 'image/jpeg',
    });
  }, [onFoto]);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Baca isi nota" onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.group}>
          <RamahSectionHeader>Jenis dokumen</RamahSectionHeader>
          <View style={styles.chipRow}>
            <RamahChip
              label="Faktur kedatangan"
              selected={jenis === 'faktur-kedatangan'}
              onPress={() => onJenis('faktur-kedatangan')}
            />
            <RamahChip
              label="Nota pemasok"
              selected={jenis === 'nota'}
              onPress={() => onJenis('nota')}
            />
          </View>
          <RamahNote icon="info">
            {jenis === 'faktur-kedatangan'
              ? 'Baris tercentang dibaca diterima lengkap; tanpa centang dibaca dari angka tulisan tangan.'
              : 'Tidak ada konvensi centang — setiap baris yang terbaca dianggap diterima lengkap.'}
          </RamahNote>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Foto</RamahSectionHeader>
          {foto ? (
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: foto.uri }}
                style={styles.preview}
                contentFit="cover"
                accessible={false}
              />
              <RamahSecondaryButton
                label="Ganti foto"
                icon="refresh-cw"
                onPress={() => onFoto(null)}
                fullWidth
                height={44}
              />
            </View>
          ) : (
            <View style={styles.pickRow}>
              <RamahSecondaryButton
                label="Ambil foto"
                icon="camera"
                onPress={ambilFoto}
                fullWidth
                height={52}
              />
              <RamahSecondaryButton
                label="Pilih dari galeri"
                icon="image"
                onPress={pilihGaleri}
                fullWidth
                height={44}
              />
            </View>
          )}
        </View>

        {err ? <RamahInlineError message={err} /> : null}
        <RamahNote icon="camera">
          Satu foto per pembacaan — halaman lain tetap bisa dilampirkan lewat langkah foto biasa.
        </RamahNote>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton label="Baca isi nota" icon="zap" onPress={onBaca} disabled={!foto} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  scroll: { flex: 1 },
  body: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8, gap: L.group },

  group: { gap: L.related },
  chipRow: { flexDirection: 'row', gap: L.related, flexWrap: 'wrap' },

  pickRow: { gap: L.related },
  previewWrap: { gap: L.related },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.borderHairline,
    backgroundColor: C.blue50,
  },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
