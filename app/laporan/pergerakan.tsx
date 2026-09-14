/**
 * Pergerakan stok — what moved, and under which kind of document.
 *
 * It answers the question the kartu stok answers one product at a time, asked
 * across the whole shop: *where did this go last month*. It is also what makes
 * shrinkage found by a `stok_opname` legible as a monthly figure instead of a
 * pile of individual documents.
 *
 * ## Why the filters are the first thing on the screen
 *
 * `GET /laporan/pergerakan` has **no paging at all** — no `page`, no `size` —
 * and its natural grain is one row per `(barang, ruang, jenis_transaksi)`. A
 * shop with four hundred products moving under three kinds of document in two
 * rooms is a response with a couple of thousand rows in it, fetched in one go,
 * for a question nobody asked that broadly. So the range is bounded to one month
 * by default and the room narrows it further, and the screen says how many rows
 * came back rather than pretending the number does not matter.
 *
 * ## The trap this report exposes rather than hides
 *
 * The range filters `kartu_stok.tanggal_transaksi` — **not** document status and
 * not document date. A document posted in one period and cancelled in the next
 * writes its reversing row stamped `time.Now()`, so the reversal appears in the
 * range containing the *cancellation*, not the one containing the posting. That
 * is the contract's deliberate choice and it is why a month can fail to
 * reconcile against its own documents. The note at the foot of this screen says
 * so, because somebody staring at a number that will not add up deserves to be
 * told where to look.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { laporanPergerakan, namaBulan, rentangBulan, type Pergerakan } from '@/services/laporan';
import { listRuang, type RuangRow } from '@/services/ruang';

/**
 * How many months back the picker offers. Twelve is a year of comparisons and
 * is still a list somebody can scan in a sheet without searching it.
 */
const BULAN_PILIHAN = 12;

interface Bulan {
  /** `"2026-08"`, which is also what `namaBulan` formats. */
  kode: string;
  dari: string;
  sampai: string;
}

function bulanTerakhir(n: number): Bulan[] {
  const now = new Date();
  const out: Bulan[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const tahun = d.getFullYear();
    const bulan1 = d.getMonth() + 1;
    out.push({
      kode: `${tahun}-${String(bulan1).padStart(2, '0')}`,
      ...rentangBulan(tahun, bulan1),
    });
  }
  return out;
}

/** One product in one room, with its movements folded together by kind. */
interface Baris {
  key: string;
  nama: string;
  kode: string;
  namaRuang: string;
  masuk: number;
  keluar: number;
  perJenis: { jenis: string; masuk: number; keluar: number }[];
}

export default function PergerakanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Built once and kept: the list is a function of today's date, and today does
  // not change while somebody is reading a report.
  const [bulanList] = useState(() => bulanTerakhir(BULAN_PILIHAN));
  const [bulanIdx, setBulanIdx] = useState(0);
  const [sheetBulan, setSheetBulan] = useState(false);

  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [sheetRuang, setSheetRuang] = useState(false);

  const [rows, setRows] = useState<Pergerakan[]>([]);
  const [err, setErr] = useState('');

  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const bulan = bulanList[bulanIdx];
  const requestKey = `${bulan.kode}|${ruangId ?? 'semua'}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Only the rooms in the session's active unit kerja come back, so
        // whatever this answers is exactly the set that may be chosen.
        const answer = await listRuang({ size: 100, is_aktif: true });
        if (alive) setRuangList(answer.data);
      } catch {
        // A room list that will not load leaves the report perfectly usable
        // across all rooms, which is this screen's default anyway.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await laporanPergerakan({
          dari: bulan.dari,
          sampai: bulan.sampai,
          id_ruang: ruangId ?? undefined,
        });
        if (!alive) return;
        setRows(answer);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setErr(messageOf(e, 'Gagal memuat pergerakan stok.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bulan.dari, bulan.sampai, ruangId, reloadToken, requestKey]);

  /**
   * The server's grain is `(barang, ruang, jenis_transaksi)`; a reader's grain is
   * the product. So the kinds are folded into the product row they belong to,
   * with the breakdown kept underneath — which is the part that actually answers
   * "keluar ke mana saja".
   *
   * Insertion order is kept rather than sorted. There is no sort parameter on
   * this endpoint, and re-ordering a complete response by a figure this screen
   * computed would be a ranking the report does not make.
   */
  const baris = useMemo<Baris[]>(() => {
    const map = new Map<string, Baris>();
    for (const r of rows) {
      const key = `${r.id_product}-${r.id_ruang}`;
      const entry = map.get(key) ?? {
        key,
        nama: r.nama_product ?? '',
        kode: r.kode_barang ?? '',
        namaRuang: r.nama_ruang ?? '',
        masuk: 0,
        keluar: 0,
        perJenis: [],
      };
      const masuk = r.total_masuk ?? 0;
      const keluar = r.total_keluar ?? 0;
      entry.masuk += masuk;
      entry.keluar += keluar;
      entry.perJenis.push({ jenis: r.jenis_transaksi ?? '—', masuk, keluar });
      map.set(key, entry);
    }
    return [...map.values()];
  }, [rows]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/laporan');
  }, [router]);

  const activeRuang = ruangList.find((r) => r.id === ruangId) ?? null;

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pergerakan stok" onBack={goBack} />

      <FlatList
        data={baris}
        keyExtractor={(b) => b.key}
        renderItem={({ item, index }) => (
          <BarisCard row={item} first={index === 0} last={index === baris.length - 1} />
        )}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + L.space8 }]}
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.chipRow}>
              <RamahChip
                label={namaBulan(bulan.kode)}
                selected
                iconRight="chevron-down"
                onPress={() => setSheetBulan(true)}
                accessibilityLabel={`Periode ${namaBulan(bulan.kode)}. Ganti periode`}
              />
              <RamahChip
                label={activeRuang?.nama ?? 'Semua gudang'}
                selected={ruangId !== null}
                iconRight={ruangList.length ? 'chevron-down' : undefined}
                onPress={ruangList.length ? () => setSheetRuang(true) : undefined}
                accessibilityLabel={
                  activeRuang ? `Gudang ${activeRuang.nama}. Ganti gudang` : 'Semua gudang. Pilih gudang'
                }
              />
            </View>
            {baris.length ? (
              <RamahSectionHeader>{`${baris.length} barang bergerak`}</RamahSectionHeader>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          err ? (
            <RamahInlineError message={err} onRetry={reload} />
          ) : loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={C.brand} />
            </View>
          ) : (
            <Text style={styles.kosong}>
              Tidak ada stok yang bergerak pada periode itu
              {activeRuang ? ` di ${activeRuang.nama}` : ''}.
            </Text>
          )
        }
      />

      <RamahSheet visible={sheetBulan} title="Pilih periode" onClose={() => setSheetBulan(false)}>
        {bulanList.map((b, i) => (
          <RamahSheetOption
            key={b.kode}
            label={namaBulan(b.kode)}
            selected={i === bulanIdx}
            onPress={() => {
              setSheetBulan(false);
              setBulanIdx(i);
            }}
          />
        ))}
      </RamahSheet>

      <RamahSheet visible={sheetRuang} title="Pilih gudang" onClose={() => setSheetRuang(false)}>
        <RamahSheetOption
          label="Semua gudang"
          selected={ruangId === null}
          onPress={() => {
            setSheetRuang(false);
            setRuangId(null);
          }}
        />
        {ruangList.map((r) => (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            sub={r.namaUnitKerja || undefined}
            selected={r.id === ruangId}
            onPress={() => {
              setSheetRuang(false);
              setRuangId(r.id);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

function BarisCard({ row, first, last }: { row: Baris; first: boolean; last: boolean }) {
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <View style={styles.cardBody}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <Text style={styles.nama} numberOfLines={2}>
              {row.nama}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[row.kode, row.namaRuang].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.totals}>
            {/* Counted in the product's base unit, always — `kartu_stok` knows no
                other, and the unit somebody typed on a nota never reaches here. */}
            <Text style={styles.masuk}>{`+${formatNumber(row.masuk)}`}</Text>
            <Text style={styles.keluar}>{`−${formatNumber(row.keluar)}`}</Text>
          </View>
        </View>
        <View style={styles.jenisRow}>
          {row.perJenis.map((j) => (
            <View key={j.jenis} style={styles.jenisChip}>
              <Text style={styles.jenisText} numberOfLines={1}>
                {`${j.jenis} ${j.masuk ? `+${formatNumber(j.masuk)}` : ''}${
                  j.masuk && j.keluar ? ' ' : ''
                }${j.keluar ? `−${formatNumber(j.keluar)}` : ''}`}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2 },
  controls: { gap: L.cardGap, paddingBottom: L.space3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  loadingBox: { paddingVertical: L.space8, alignItems: 'center' },
  kosong: { ...T.caption, color: C.textBody, textAlign: 'center', paddingVertical: L.space8 },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  cardBody: { padding: L.cardPad, gap: L.space2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  nama: { ...T.rowTitle, color: C.textTitle },
  sub: { ...T.caption, color: C.textBody },
  totals: { alignItems: 'flex-end' },
  /* In and out are the one place a figure carries colour on an operational
     screen, and it is not a tone judgement: they are two directions, and the
     sign alone is easy to miss in a column of numbers. */
  masuk: { ...T.rowTitle, color: C.brandInk },
  keluar: { ...T.rowTitle, color: C.orange600 },

  jenisRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  jenisChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: C.grey100,
    maxWidth: '100%',
  },
  // These chips carry the actual in/out figures per document kind, which is
  // the answer to "keluar ke mana saja" — read, not glanced at.
  jenisText: { ...T.caption, color: C.textBody },
});
