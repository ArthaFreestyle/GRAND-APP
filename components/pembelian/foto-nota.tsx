/**
 * H1 of `Papan Layar OCR.dc.html` — "Foto nota — kumpulkan halaman".
 *
 * A shop gets a paper faktur. This is where it gets photographed, one tile per
 * page, until the whole sheet is covered. Every page is uploaded the moment it
 * is taken, so the tiles on screen are rows that already exist on the server
 * rather than a queue waiting for a save that might never happen.
 *
 * ## What the board draws that this cannot do, and why it is said here
 *
 * The board's primary button is **"Baca isi nota"**, and it leads to H2 (OCR
 * running) and H3 (check the reading, fix the quantities, file each line against
 * the catalogue). Neither is buildable: `POST /ocr/faktur` and
 * `GET /ocr/faktur/{id}` are not in `contracts/openapi.yaml`, and the board's
 * own "Yang butuh dukungan dari server" section says as much — nothing on this
 * server reads a photograph, and nothing scores a faktur line against a product.
 *
 * Faking it client-side is not on the table: the whole value of H3 is a
 * *confidence* ("Cocok" / "Mirip · konfirmasi dulu") that only a matcher with
 * the catalogue in front of it can produce, and an invented score on a screen
 * whose entire job is to be checked is worse than no screen at all.
 *
 * So this step keeps the half that is real, and that half is worth having on its
 * own: the photos become `dokumen` rows attached to the nota, so the faktur can
 * be read on the phone while the lines are typed from it, and a supervisor
 * deciding on that nota later can open the paper it came from. **When
 * `/ocr/faktur` lands, this screen does not move** — its exit becomes H2 instead
 * of the supplier step, and the page ids it is already holding are exactly what
 * that endpoint takes.
 *
 * ## Why a page is uploaded immediately rather than at the end
 *
 * `POST /dokumen` returns a row born *yatim* — no parent, because the nota does
 * not exist yet — and the contract says in as many words that this is the
 * intended order for exactly this flow. Three things follow, all of them good: a
 * page survives the app being killed mid-flow (it is on the server, and
 * `GET /dokumen` with no reference hands the caller their own orphans back); a
 * ten-megabyte photo is never held in JS memory waiting for a submit; and one
 * page failing is one page, reported beside its tile, rather than a whole
 * session lost at the end.
 */
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  RamahWeight as W,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { deleteDokumen, uploadDokumen } from '@/services/dokumen';

/**
 * One page of the faktur, as this flow carries it.
 *
 * `uriLokal` is the picker's own `file://` path, and it exists only for a page
 * this session took. A page recovered from the server's orphan tray has none —
 * the bytes sit behind an authenticated download, and drawing a real thumbnail
 * for it would mean threading a bearer token into an `<Image>` for a picture
 * nobody needs to look at twice. Those tiles draw the board's own file glyph
 * instead, which is what the board draws for *every* tile.
 */
export interface HalamanNota {
  /** The `dokumen` row id. This is what `tempel` — and one day `/ocr/faktur` — takes. */
  id: number;
  nama: string;
  uriLokal: string | null;
  asal: 'kamera' | 'galeri' | 'tersimpan';
}

/**
 * Ten, and it is the server's number: `POST /dokumen/{id}/tempel` answers 409
 * once the parent already holds ten. Enforcing it here means finding out while
 * there is still a photo on screen to drop, rather than at the end of the flow
 * when the nota exists and nine pages are already stuck to it.
 */
const MAX_LAMPIRAN = 10;

/** Three tiles to a row, and the 10pt gaps between and around them. */
const TILE_COLUMNS = 3;
const TILE_GAP = 10;

/**
 * Quality, not size.
 *
 * `quality` is the only lever worth pulling. Resizing would make the print on a
 * faktur harder to read, which is the one thing these photos exist for, while
 * 0.7 JPEG keeps a phone photo comfortably under the server's 10 MB cap without
 * touching legibility. `exif: false` keeps the shop's GPS coordinates off a file
 * that gets handed to whoever approves the nota.
 */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
};

export function FotoNotaStep({
  pages,
  onChange,
  onBack,
  onLanjut,
  dockPad,
}: {
  pages: readonly HalamanNota[];
  onChange: (next: HalamanNota[]) => void;
  onBack: () => void;
  onLanjut: () => void;
  dockPad: number;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /**
   * The tile width, counted rather than guessed.
   *
   * A wrapping row of percentage-width children is the shape that silently
   * turned the till's keypad into two columns when the arithmetic came up one
   * and a half points short, and a three-column grid inside a gutter has the
   * same exposure. Subtracting the gutters and the gaps from the real window
   * width cannot drift, and it re-measures on rotation for free.
   *
   * `useWindowDimensions` is the full window; the group layout outside this
   * screen spends `insets.left`/`right`, so the tile is rounded *down* and the
   * row keeps a little slack rather than overflowing to the right, where there
   * is nothing.
   */
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor(
    (width - L.gutter * 2 - TILE_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS
  );

  /**
   * Uploads every asset the picker handed back, in order, and appends the pages
   * that landed.
   *
   * Sequential rather than parallel on purpose: these are large files over what
   * is usually a shop's phone data, and three at once is three that are each
   * slower and likelier to time out. The first failure stops the run and keeps
   * whatever already uploaded — a partial batch is still pages on the server,
   * and re-picking the rest is cheaper than re-picking all of them.
   */
  const terima = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], asal: HalamanNota['asal']) => {
      if (assets.length === 0) return;
      setBusy(true);
      setErr('');
      const added: HalamanNota[] = [];
      try {
        for (const asset of assets) {
          if (pages.length + added.length >= MAX_LAMPIRAN) break;
          const row = await uploadDokumen({
            uri: asset.uri,
            // The name is shown back to a reader and never used as a path, so
            // the picker's own is fine. The fallback matters because Android
            // returns null for a file browsed straight off the filesystem.
            name: asset.fileName ?? `nota-${Date.now()}.jpg`,
            type: asset.mimeType ?? 'image/jpeg',
          });
          added.push({ id: row.id, nama: row.namaAsli, uriLokal: asset.uri, asal });
        }
      } catch (e) {
        setErr(messageOf(e, 'Foto gagal diunggah. Coba lagi.'));
      } finally {
        if (added.length) onChange([...pages, ...added]);
        setBusy(false);
      }
    },
    [pages, onChange]
  );

  const ambilFoto = useCallback(async () => {
    const izin = await ImagePicker.requestCameraPermissionsAsync();
    if (!izin.granted) {
      // `canAskAgain: false` means the person chose "don't ask again", and the
      // only way back is Settings — so the sentence has to say that, rather
      // than inviting another tap that will never raise a dialog.
      setErr(
        izin.canAskAgain
          ? 'Izin kamera belum diberikan, jadi foto tidak bisa diambil.'
          : 'Izin kamera ditolak permanen. Aktifkan lewat Pengaturan aplikasi.'
      );
      return;
    }
    const hasil = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (hasil.canceled) return;
    await terima(hasil.assets, 'kamera');
  }, [terima]);

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
    const hasil = await ImagePicker.launchImageLibraryAsync({
      ...PICKER_OPTIONS,
      // A faktur is usually photographed page by page in one sitting, so taking
      // the whole set at once is the ordinary case rather than the clever one.
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, MAX_LAMPIRAN - pages.length),
    });
    if (hasil.canceled) return;
    await terima(hasil.assets, 'galeri');
  }, [terima, pages.length]);

  /**
   * Removing a page really deletes it, and this is the only place that is
   * allowed: the contract permits `DELETE /dokumen/{id}` while the row is still
   * yatim or its parent is `DRAFT`, and every page on this screen is yatim by
   * construction.
   *
   * The tile goes even when the delete fails. The row is then an orphan the
   * server's own sweep collects, and leaving a tile somebody has already
   * dismissed on screen is a worse answer than a file that tidies itself up.
   */
  const hapus = useCallback(
    async (id: number) => {
      onChange(pages.filter((p) => p.id !== id));
      try {
        await deleteDokumen(id);
      } catch {
        // Deliberately silent — see above.
      }
    },
    [pages, onChange]
  );

  const count = pages.length;
  const penuh = count >= MAX_LAMPIRAN;

  return (
    <View style={styles.screen}>
      <RamahHeader title="Foto nota faktur" onBack={onBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.countRow}>
          <RamahSectionHeader>{`Halaman (${count})`}</RamahSectionHeader>
          <Text style={styles.countLabel}>
            {count ? `${count} halaman ditambahkan` : 'Belum ada halaman ditambahkan'}
          </Text>
        </View>

        <View style={styles.grid}>
          {pages.map((page, i) => (
            <PageTile
              key={page.id}
              page={page}
              index={i}
              width={tileWidth}
              onRemove={() => hapus(page.id)}
            />
          ))}
          {penuh ? null : (
            <Pressable
              onPress={ambilFoto}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Ambil foto halaman nota"
              style={[styles.tile, { width: tileWidth }, styles.tileAdd, busy && styles.tileBusy]}>
              {busy ? (
                <ActivityIndicator color={C.brand} />
              ) : (
                <>
                  {/* Off the §7 icon scale (14/16/20/24) on purpose, and the
                      board draws it this way too (`icon28` on its `ocrFoto`
                      screen): that scale governs *chrome* — headers, list rows,
                      chevrons, metadata — while this glyph is standing in for a
                      photograph inside a 3:4 thumbnail. */}
                  <Feather name="camera" size={28} color={C.textBody} />
                  <Text style={styles.tileAddLabel}>Ambil foto</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {penuh ? (
          <RamahNote icon="alert-circle">
            {`Satu nota boleh membawa ${MAX_LAMPIRAN} lampiran. Hapus satu halaman dulu kalau masih ada yang perlu difoto.`}
          </RamahNote>
        ) : (
          <RamahSecondaryButton
            label="Pilih dari galeri"
            icon="image"
            onPress={pilihGaleri}
            disabled={busy}
            fullWidth
            height={44}
          />
        )}

        {err ? <RamahInlineError message={err} /> : null}

        {/* The one place the missing endpoint is said out loud, and it is said
            where somebody is looking at the photos and expecting them to be
            read. The file header carries the long version. */}
        <RamahNote icon="info">
          Server ini belum bisa membaca isi foto, jadi barang dan harganya tetap diisi sendiri.
          Fotonya ikut menempel di nota — bisa dibuka lagi sambil mengetik, dan ikut terbaca oleh
          yang menyetujui.
        </RamahNote>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton
          label="Lanjut isi nota"
          icon="arrow-right"
          onPress={onLanjut}
          disabled={busy}
        />
      </View>
    </View>
  );
}

function PageTile({
  page,
  index,
  width,
  onRemove,
}: {
  page: HalamanNota;
  index: number;
  width: number;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.tile, { width }]}>
      {page.uriLokal ? (
        <Image
          source={{ uri: page.uriLokal }}
          style={styles.thumb}
          contentFit="cover"
          // The picture is decoration for a tile whose own label already says
          // which page it is; a screen reader gets that label, not a
          // description of a photograph nobody wrote.
          accessible={false}
        />
      ) : (
        <View style={styles.thumbGlyph}>
          <Feather name="file-text" size={28} color={C.accentBlueInk} />
        </View>
      )}
      <View style={styles.tileCaption}>
        <Text style={styles.tileLabel} numberOfLines={1}>{`Halaman ${index + 1}`}</Text>
        <Text style={styles.tileKind} numberOfLines={1}>
          {ASAL_LABEL[page.asal]}
        </Text>
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Hapus halaman ${index + 1}`}
        hitSlop={8}
        style={styles.tileRemove}>
        <Feather name="x" size={RamahIcon.counter} color={C.white} />
      </Pressable>
    </View>
  );
}

const ASAL_LABEL: Record<HalamanNota['asal'], string> = {
  kamera: 'foto kamera',
  galeri: 'dari galeri',
  tersimpan: 'sudah diunggah',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space8,
    gap: L.space4,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 13/18, not micro. Guide §7 puts the 11px floor under *tile labels and
  // character counters only* — "teks yang harus dibaca tidak pernah di bawah
  // 13px" — and how many pages are in hand is read, not glanced at.
  countLabel: { ...T.caption, color: C.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: {
    aspectRatio: 3 / 4,
    borderRadius: R.cardSm,
    borderWidth: 1,
    borderColor: C.borderHairline,
    backgroundColor: C.blue50,
    overflow: 'hidden',
  },
  thumb: { flex: 1, width: '100%' },
  thumbGlyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileCaption: {
    paddingHorizontal: L.space2,
    paddingVertical: 6,
    gap: 1,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  // These two *are* a tile label, which is the one place 11/14 is allowed.
  // The second line drops to regular weight so the block still has one
  // emphasis rather than two.
  tileLabel: { ...T.micro, color: C.textTitle },
  tileKind: { fontSize: 11, lineHeight: 14, ...W.regular, color: C.textMuted },
  tileRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24,24,24,.72)',
  },
  tileAdd: {
    backgroundColor: C.surfacePage,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileBusy: { opacity: 0.6 },
  // A tile's own label, so it matches the tiles beside it rather than
  // sitting on a size the scale does not define.
  tileAddLabel: { ...T.micro, color: C.textTitle },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.cardGap,
    backgroundColor: C.surfacePage,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
});
