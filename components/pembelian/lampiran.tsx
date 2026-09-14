/**
 * The faktur photographs attached to one document, and the viewer that makes
 * them worth having.
 *
 * This is the other end of H1 in `Papan Layar OCR.dc.html`. The photo step
 * uploads the pages and the create flow sticks them to the nota with
 * `POST /dokumen/{id}/tempel`; this is where they come back — while the draft is
 * being typed from the paper, and again when a supervisor decides on it. The
 * board's own note calls that second case out: *"Foto bisa dibuka lagi dari nota
 * kalau supervisor mau cocokkan sendiri."*
 *
 * ## Why the thumbnails carry a bearer token
 *
 * `GET /api/v1/dokumen/{id}` is authenticated like every other route, because a
 * faktur photo carries purchase prices and names the supplier. `expo-image`
 * takes request headers on its source, so the picture is drawn straight from the
 * endpoint rather than downloaded to a file first — no `expo-file-system`, no
 * temporary copies of somebody's prices sitting in a cache directory. The token
 * is read through `useSession()` on every render so a renewal reaches the images
 * too; one captured once would go stale behind a long-open screen.
 *
 * ## Why the viewer is a plain full-screen picture
 *
 * A faktur at 92pt is a grey rectangle. It has to open to something readable,
 * and on a phone that is the whole screen with `contentFit="contain"`. There is
 * no pinch-zoom: it would mean a gesture-handler tree inside a `Modal` for a
 * picture that is already legible at full width, and the honest way to read the
 * small print on a faktur is to look at the paper, which is by definition in the
 * room.
 *
 * This component is drawn with `components/shell/ui.tsx` and `theme-erp`, not
 * with Ramah, because the screen it sits inside still is. The two never meet in
 * one screen; when pembelian is ported, this card ports with it.
 */
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardHead, EmptyState, GhostButton } from '@/components/shell/ui';
import { Colors as C } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import {
  dokumenSource,
  isGambar,
  listDokumenOf,
  type DokumenRow,
  type RefTable,
} from '@/services/dokumen';
import { useSession } from '@/services/session';

/** The server's own ceiling, so the whole set always fits in one read. */
const PAGE_SIZE = 10;

export function LampiranCard({
  refTable,
  refId,
  /**
   * How many pages the create flow failed to attach, if it just came from
   * there. It is reported here rather than as a failure of the create, because
   * the nota is real by the time `tempel` runs and a photograph that would not
   * stick is not a reason to throw a document away.
   */
  gagalSaatDibuat = 0,
}: {
  refTable: RefTable;
  refId: number;
  gagalSaatDibuat?: number;
}) {
  const session = useSession();
  const token = session?.token ?? '';

  const [rows, setRows] = useState<DokumenRow[]>([]);
  const [err, setErr] = useState('');
  const [dibuka, setDibuka] = useState<DokumenRow | null>(null);
  /**
   * Loading is the key wanted against the key loaded, the shape every other read
   * in this app uses — a boolean written at the head of the fetch effect is the
   * cascading render `react-hooks/set-state-in-effect` refuses.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${refTable}|${refId}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listDokumenOf(refTable, refId, { size: PAGE_SIZE });
        if (!alive) return;
        setRows(answer.data);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setErr(messageOf(e, 'Gagal memuat lampiran nota.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refTable, refId, reloadToken, requestKey]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // A document with no attachments and nothing to report is not a card. Most
  // notas are typed without a photograph, and an empty "Foto nota" block on
  // every one of them is a heading nobody acts on.
  if (loading && rows.length === 0 && !gagalSaatDibuat) return null;
  if (!loading && rows.length === 0 && err === '' && !gagalSaatDibuat) return null;

  return (
    <Card>
      <CardHead
        title="Foto nota"
        right={<Text style={styles.right}>{rows.length ? `${rows.length} halaman` : '—'}</Text>}
      />
      <View style={styles.body}>
        {gagalSaatDibuat ? (
          <Text style={styles.warn}>
            {`${gagalSaatDibuat} foto gagal ditempel ke nota ini saat dibuat. Fotonya masih tersimpan di server dan bisa ditempel lagi dari alur foto nota.`}
          </Text>
        ) : null}

        {err !== '' ? (
          <View style={styles.centerBox}>
            <Text style={styles.errText}>{err}</Text>
            <GhostButton label="Coba lagi" onPress={reload} />
          </View>
        ) : loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada foto"
            sub="Nota ini diketik tanpa lampiran foto faktur."
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}>
            {rows.map((row, i) => (
              <Thumb
                key={row.id}
                row={row}
                index={i}
                token={token}
                onPress={() => setDibuka(row)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <Viewer row={dibuka} token={token} onClose={() => setDibuka(null)} />
    </Card>
  );
}

function Thumb({
  row,
  index,
  token,
  onPress,
}: {
  row: DokumenRow;
  index: number;
  token: string;
  onPress: () => void;
}) {
  const gambar = isGambar(row);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Buka halaman ${index + 1}, ${row.namaAsli}`}
      style={styles.thumb}>
      {gambar && token ? (
        <Image
          source={dokumenSource(row.id, token)}
          style={styles.thumbImage}
          contentFit="cover"
          // Kept in memory only. These are pictures of somebody's purchase
          // prices; leaving copies in a disk cache outlives the session that
          // was allowed to see them.
          cachePolicy="memory"
          accessible={false}
        />
      ) : (
        <View style={styles.thumbGlyph}>
          <Feather name={gambar ? 'image' : 'file-text'} size={24} color={C.muted2} />
        </View>
      )}
      <Text style={styles.thumbLabel} numberOfLines={1}>{`Halaman ${index + 1}`}</Text>
    </Pressable>
  );
}

/**
 * One page, full screen.
 *
 * Its own window, so it pays its own insets — it is outside every padded box in
 * the app — and it opts back into drawing under the system bars, or the black
 * ground stops short at each end and reads as a rendering fault.
 */
function Viewer({
  row,
  token,
  onClose,
}: {
  row: DokumenRow | null;
  token: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={row !== null}
      // The entire Android back-button story for a dialog that is not a place
      // in the app and therefore has no route to pop.
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent>
      <View style={styles.viewer}>
        {row && token ? (
          <Image
            source={dokumenSource(row.id, token)}
            style={styles.viewerImage}
            contentFit="contain"
            cachePolicy="memory"
            accessibilityLabel={row.namaAsli}
          />
        ) : null}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Tutup foto"
          hitSlop={10}
          style={[styles.viewerClose, { top: insets.top + 12 }]}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        {row ? (
          <Text style={[styles.viewerCaption, { bottom: insets.bottom + 16 }]} numberOfLines={2}>
            {row.namaAsli}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  right: { fontSize: 13, color: C.muted2 },
  body: { padding: 16, gap: 12 },
  warn: { fontSize: 13, lineHeight: 18, color: C.amber },
  centerBox: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  errText: { fontSize: 13, color: C.red, textAlign: 'center' },

  strip: { gap: 10 },
  thumb: { width: 92, gap: 6 },
  thumbImage: {
    width: 92,
    height: 122,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderCard,
    backgroundColor: C.borderLighter,
  },
  thumbGlyph: {
    width: 92,
    height: 122,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderCard,
    backgroundColor: C.borderLighter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLabel: { fontSize: 11.5, color: C.muted3, textAlign: 'center' },

  viewer: { flex: 1, backgroundColor: '#000' },
  viewerImage: { flex: 1, width: '100%' },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.18)',
  },
  viewerCaption: {
    position: 'absolute',
    left: 16,
    right: 16,
    color: '#fff',
    fontSize: 12.5,
    textAlign: 'center',
    opacity: 0.85,
  },
});
