/**
 * Pendapatan — tab 2 of the five-tab bar (issue #25), between Beranda and
 * Kasir.
 *
 * **One question: how much did today actually bring in.** `GET
 * /laporan/laba-kotor` groups by calendar *month*, not by day — but `dari`/
 * `sampai` are inclusive per date, so `dari = sampai = <hari ini>` answers one
 * row holding only today's POSTED nota. That is enough for a daily figure
 * without a new endpoint, which is the whole reason this tab is buildable at
 * all: nothing in the contract computes "pendapatan harian" directly.
 *
 * ## Which number is "pendapatan"
 *
 * `total_penjualan` is already **net of PPN** — output VAT collected at the
 * till is the state's money passing through a receipt, not the shop's own
 * revenue, and the contract's own words are that counting it as turnover would
 * overstate the margin by exactly the tax every period. So the headline figure
 * is `total_penjualan`, and the PPN collected is its own line underneath,
 * exactly as `app/laporan/index.tsx` already draws its monthly cards — the two
 * screens read the same field the same way on purpose, so a shop owner moving
 * between them never has to re-learn what a number means.
 *
 * ## Laba kotor and harga pokok, for every role
 *
 * The contract carries **no `Role:` line on any `laporan/*` endpoint** — unlike
 * every write endpoint in this app, which states one explicitly (`Role:
 * CASHIER.`, `Role: SUPERADMIN.`, …). That silence is read here as "open to
 * any authenticated grant", the same reading `app/laporan/index.tsx` already
 * gives it with no role branch anywhere in that screen. So this tab shows the
 * same harga pokok and laba kotor to CASHIER as to SUPERADMIN — consistent with
 * this app's standing rule that Beranda is identical for every role rather than
 * hidden per grant, and with the plain fact that the person who typed the notas
 * a margin is computed from has as much reason to see the result as anyone. If
 * a live server disagrees and answers 403 for CASHIER, this card fails exactly
 * like any other failed read — an inline error with a retry — because a screen
 * that already treats "the read failed" as a state to draw does not need a
 * special case for one more reason it could fail.
 *
 * ## The seven-day list
 *
 * The endpoint takes no "group by day" parameter, so a trend costs one request
 * per day — seven small calls rather than one, run together with
 * `Promise.allSettled` so a single bad day does not blank the rest. Beyond
 * seven the honest move is a real `laporan/penjualan-harian` endpoint, not more
 * client-side fan-out.
 *
 * ## Not a copy of `app/laporan/index.tsx`
 *
 * That screen's "Laba kotor per bulan" card is the last twelve *months*, opened
 * occasionally to check how a period closed. This tab is the last seven *days*,
 * mounted eagerly with the rest of the bar and meant to be glanced at several
 * times a shift — the same overlap issue #24 already worked through for
 * Katalog and Pembelian's tiles: two real questions, at two real timescales,
 * both worth a door. Neither screen is the other one done again.
 *
 * ## What is not drawn, and why
 *
 * No delta chip beside the headline: guide §3 requires a delta to be relative
 * to the *same period*, and nothing here reads yesterday's figure as a
 * comparison — a grey "0%" would be a claim, not a placeholder. The metric
 * value itself stays `--text-title`, never toned, the same rule Beranda's own
 * two-metric card follows: tone belongs to a note or a chip, never to the bare
 * number.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RamahInlineError, RamahSectionHeader, RamahStatCard } from '@/components/shell/ramah';
import { formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
  stempelPembaruan,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { decimalToNumber } from '@/services/decimal';
import { laporanLabaKotor, type LabaKotor } from '@/services/laporan';
import { penjualanBus } from '@/services/penjualan';

/** A week, not a business decision — see the file header on why more wants a real endpoint. */
const HARI_TREN = 7;

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** `YYYY-MM-DD` off local date parts — never `toISOString()`, which is UTC and can name the wrong day east of Greenwich. */
function tanggalLokal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function labelHari(tanggal: string, hariIni: string): string {
  if (tanggal === hariIni) return 'Hari ini';
  const [y, m, d] = tanggal.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]}`;
}

interface HariBaris {
  tanggal: string;
  data: LabaKotor | null;
  gagal: boolean;
}

export default function PendapatanScreen() {
  // Read once per render rather than memoized: this is a tab root that stays
  // mounted for the app's whole life, and a session left open across midnight
  // must not keep quoting yesterday's date until the next reload.
  const hariIni = tanggalLokal(new Date());

  const [hari, setHari] = useState<HariBaris[]>([]);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * Loading is derived, the shape `app/produk/index.tsx` established: the token
   * this screen wants read against the token it has read, never a
   * `setLoading(true)` written at the top of the fetch effect.
   */
  const [loadedToken, setLoadedToken] = useState(-1);
  const loading = loadedToken !== reloadToken;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // A nota posted or cancelled anywhere — the till included — changes today's
  // figure. This tab has no row to patch in place, only a sum to re-read.
  useRecordBus(penjualanBus, (change) => {
    if (change.kind === 'reload') reload();
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = new Date();
      const days = Array.from({ length: HARI_TREN }, (_, i) =>
        tanggalLokal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))
      );
      const results = await Promise.allSettled(
        days.map((tgl) => laporanLabaKotor({ dari: tgl, sampai: tgl }))
      );
      if (!alive) return;
      setHari(
        days.map((tanggal, i) => {
          const r = results[i];
          return r.status === 'fulfilled'
            ? { tanggal, data: r.value[0] ?? null, gagal: false }
            : { tanggal, data: null, gagal: true };
        })
      );
      setReadAt(new Date());
      setLoadedToken(reloadToken);
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  const ini = hari[0] ?? null;
  const omzet = ini?.data ? decimalToNumber(ini.data.total_penjualan) : 0;
  const ppn = ini?.data ? decimalToNumber(ini.data.total_ppn) : 0;
  const hpp = ini?.data ? decimalToNumber(ini.data.total_hpp) : 0;
  const laba = ini?.data ? decimalToNumber(ini.data.laba_kotor) : 0;
  const margin = omzet > 0 ? Math.round((laba / omzet) * 100) : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={readAt !== null && loading}
            onRefresh={reload}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }>
        <Text style={styles.title}>Pendapatan</Text>

        <View style={styles.card}>
          <Text style={styles.metricLabel}>Pendapatan hari ini</Text>
          {/* Guide §3: a metric's value is always `--text-title`, never toned —
              tone belongs to a chip or a note, never the bare figure. */}
          <Text style={styles.metricValue}>
            {loading && !ini ? '—' : formatRupiah(omzet)}
          </Text>
          {ppn > 0 ? (
            <Text style={styles.metricSub}>
              {`+ ${formatRupiah(ppn)} PPN dipungut, di luar pendapatan`}
            </Text>
          ) : null}
          {/* No visible refresh chrome (issue #37) — the `ScrollView`'s pull
              gesture reloads this card. The `Pressable` stays, unstyled as a
              control, for TalkBack/VoiceOver. */}
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Muat ulang pendapatan"
            style={styles.cardFoot}
            hitSlop={6}>
            <Text style={styles.cardFootText}>
              {readAt ? stempelPembaruan(readAt) : 'Membaca…'}
            </Text>
          </Pressable>
        </View>

        {ini?.gagal ? (
          <RamahInlineError message="Pendapatan hari ini tidak terbaca." onRetry={reload} />
        ) : null}

        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <RamahStatCard label="Harga pokok" value={formatRupiah(hpp)} note="Dari kartu stok saat posting" />
          </View>
          <View style={styles.statCell}>
            <RamahStatCard
              label="Laba kotor"
              value={formatRupiah(laba)}
              tone={laba < 0 ? 'warn' : 'plain'}
              note={margin === null ? 'Belum ada penjualan' : `${margin}% dari pendapatan`}
            />
          </View>
        </View>

        <View style={styles.groupStart}>
          <RamahSectionHeader>7 hari terakhir</RamahSectionHeader>
        </View>
        <View style={styles.list}>
          {hari.map((h, i) => (
            <View key={h.tanggal}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {labelHari(h.tanggal, hariIni)}
                </Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {h.gagal ? '—' : formatRupiah(decimalToNumber(h.data?.total_penjualan ?? '0'))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * No safe-area padding here, the same reasoning `app/(admin)/beranda.tsx`
 * states in full: `app/(admin)/_layout.tsx` pads top and sides outside the
 * navigator, and the native tab bar owns the bottom edge itself.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  // Today's three figures are one group a `stack` apart; the seven-day list is
  // a different question and opens a group of its own.
  content: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space6, gap: L.stack },
  groupStart: { paddingTop: L.group - L.stack },

  title: { ...T.titleModerate, color: C.textTitle },

  card: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  metricLabel: { ...T.caption, color: C.textBody, paddingHorizontal: L.cardPad, paddingTop: L.cardPad },
  metricValue: { ...T.titleLarge, color: C.textTitle, paddingHorizontal: L.cardPad, paddingTop: L.inline },
  metricSub: { ...T.bodySmall, color: C.textBody, paddingHorizontal: L.cardPad, paddingTop: L.inline, paddingBottom: L.cardPad },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: L.space2,
    paddingVertical: L.space3,
    paddingHorizontal: L.cardPad,
    backgroundColor: C.grey50,
    borderTopWidth: 1,
    borderTopColor: C.borderHairline,
  },
  cardFootText: { ...T.bodySmall, color: C.textMuted },

  statGrid: { flexDirection: 'row', gap: L.stack },
  statCell: { flex: 1 },

  list: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: L.space3,
    paddingHorizontal: L.cardPad,
    minHeight: L.rowH,
  },
  rowLabel: { ...T.bodyModerate, color: C.textTitle },
  rowValue: { ...T.titleTiny, color: C.textTitle },
});
