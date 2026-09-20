/**
 * Katalog unit kerja — the editor behind the "Ubah" word on the detail's
 * "Katalog unit kerja" group.
 *
 * A route rather than a `RamahSheet`, for the reason `ubah.tsx` is one: this
 * saves a change to the record, and the section pushes from the right — a form
 * that rose from the bottom edge would announce itself as a sheet somebody is
 * about to flick away. There is no `[id]/_layout.tsx`, so `router.dismiss()`
 * lands on the detail.
 *
 * ## Whole set, not a delta
 *
 * `PUT /product/{id}/unit-kerja` replaces the entire set. That is why a retired
 * unit which already holds the product is drawn **and ticked**: sending it back
 * is how the membership is kept, and a screen that quietly dropped the row on
 * save would revoke something nobody asked to revoke. A retired unit that does
 * *not* hold the product cannot be ticked — the contract only lets a new
 * membership name an active unit.
 *
 * ## A refusal changes nothing
 *
 * A 409 means some ruang of a revoked unit still holds stock. The server left
 * the catalogue as it was, so the ticks are left as they were too, rather than
 * reset: the reader can untick the one that was refused and press again.
 */
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { ApiError, messageOf } from '@/services/api';
import {
  getProduct,
  produkBus,
  produkDetailBus,
  productRowOf,
  setProductUnitKerja,
  type ProductDetail,
} from '@/services/produk';
import { listUnitKerja } from '@/services/unit-kerja';

interface Pilihan {
  id: number;
  nama: string;
  aktif: boolean;
}

export default function KatalogProdukScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const idValid = Number.isFinite(id) && id > 0;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [units, setUnits] = useState<Pilihan[] | null>(null);
  const [loadErr, setLoadErr] = useState('');

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace({ pathname: '/produk/[id]', params: { id: String(id) } });
  }, [router, id]);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const [detail, all] = await Promise.all([getProduct(id), listUnitKerja({ size: 100 })]);
        if (!alive) return;
        // A member the list somehow lacks is still drawn: it is a real
        // membership and has to stay revocable.
        const byId = new Map<number, Pilihan>(
          all.data.map((u) => [u.id, { id: u.id, nama: u.nama, aktif: u.aktif }])
        );
        for (const u of detail.unitKerja) {
          if (!byId.has(u.id)) byId.set(u.id, { id: u.id, nama: u.nama, aktif: u.aktif });
        }
        setUnits([...byId.values()]);
        setProduct(detail);
      } catch (e) {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat katalog unit kerja.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid]);

  if (!idValid || loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Katalog unit kerja" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Barang tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat produk tidak dikenali.'}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!product || !units) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Katalog unit kerja" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  return <KatalogForm product={product} units={units} onDone={goBack} />;
}

function KatalogForm({
  product,
  units,
  onDone,
}: {
  product: ProductDetail;
  units: Pilihan[];
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [members] = useState(() => new Set(product.unitKerja.map((u) => u.id)));
  const [picked, setPicked] = useState(() => new Set(members));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function toggle(u: Pilihan) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.add(u.id);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      const detail = await setProductUnitKerja(product.id, [...picked]);
      // The catalogue draws no membership, so only the detail's own bus carries it.
      produkDetailBus.publish({ kind: 'saved', row: { detail, kabar: 'Katalog unit kerja disimpan.' } });
      produkBus.publish({ kind: 'saved', row: productRowOf(detail) });
      onDone();
    } catch (e) {
      const refused = e instanceof ApiError && e.status === 409;
      const said = messageOf(e, 'Gagal menyimpan katalog unit kerja.');
      // The selection is deliberately left alone: a refusal changed nothing.
      setErr(refused ? `${said} Kosongkan dulu lewat mutasi atau pemakaian.` : said);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <RamahHeader title="Katalog unit kerja" onBack={onDone} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.card}>
          {units.map((u, i) => {
            const on = picked.has(u.id);
            const locked = !u.aktif && !members.has(u.id);
            return (
              <View key={u.id}>
                {i === 0 ? null : <View style={styles.divider} />}
                <Pressable
                  onPress={() => toggle(u)}
                  disabled={locked || saving}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: locked }}
                  accessibilityLabel={u.aktif ? u.nama : `${u.nama}, nonaktif`}
                  style={[styles.row, locked && styles.rowOff]}>
                  <View style={[styles.box, on && styles.boxOn]}>
                    {on ? <Feather name="check" size={14} color={C.white} /> : null}
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {u.nama}
                  </Text>
                  {u.aktif ? null : <Text style={styles.rowTag}>Nonaktif</Text>}
                </Pressable>
              </View>
            );
          })}
        </View>

        {err ? <RamahInlineError message={err} /> : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton label="Simpan" onPress={save} busy={saving} disabled={saving} />
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
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space6, gap: L.stack },

  card: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowOff: { opacity: 0.55 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
  rowTitle: { ...T.titleTiny, color: C.textTitle, flex: 1 },
  rowTag: { ...T.bodySmall, color: C.textMuted },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
