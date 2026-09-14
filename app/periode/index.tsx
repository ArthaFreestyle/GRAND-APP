/**
 * Tutup buku — which months still accept postings, and closing or reopening one.
 *
 * ## Twelve months, not the list the server returned
 *
 * `GET /periode` holds a row only for a month that was ever closed, so drawing
 * its answer as the screen would show a shop that never closed anything an
 * empty page — and a page that cannot say "July is open" is the exact gap issue
 * #12 exists to close. So a year is drawn as its months (up to this one, for the
 * current year) and each row takes the server's row when there is one, and
 * `BUKA` when there is not, which is what the contract says a missing row means.
 *
 * Newest first, matching the list endpoint and every other list in the app: the
 * month somebody is about to close is the one at the top.
 *
 * ## Only "Tutup" is marked
 *
 * An open month is the ordinary state, so a badge reading "Buka" on eleven rows
 * would bury the one that says "Tutup" — the same rule that prints "Kurang" on a
 * purchase row only when it is true.
 *
 * ## Who can press
 *
 * Both transitions are `SUPERADMIN` in the contract. For every other grant the
 * rows are plain text: they still answer "why was my posting rejected", which
 * is most of what a cashier or an inventaris needs from this screen.
 *
 * ## Arriving from a rejected posting
 *
 * `AksiDialog` links here as `?tahun=&bulan=` when a posting fails on a closed
 * period. Read once into state — the section is pushed fresh each time, so
 * there is no second visit for a stale parameter to haunt — and the month is
 * tinted so the reader lands looking at the reason.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSheet,
  RamahStackCard,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { namaBulan } from '@/services/laporan';
import {
  bukaPeriode,
  listPeriode,
  tutupPeriode,
  type Periode,
} from '@/services/periode';
import { useCanWrite } from '@/services/permissions';

const TAHUN_MIN = 2000;

const pad = (n: number) => String(n).padStart(2, '0');

function labelBulan(tahun: number, bulan: number): string {
  return namaBulan(`${tahun}-${pad(bulan)}`);
}

/**
 * A timestamp as the local calendar day it fell on. `formatTanggal` alone slices
 * the first ten characters, which for a UTC stamp near midnight is the wrong day
 * in WIB — and "ditutup 31 Jul" against "1 Agu" is the kind of detail somebody
 * reconciling a month actually reads.
 */
function tanggalLokal(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return formatTanggal(ts);
  return formatTanggal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

export default function PeriodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bisaUbah = useCanWrite('periode');
  const params = useLocalSearchParams<{ tahun?: string; bulan?: string }>();

  const kini = new Date();
  const tahunIni = kini.getFullYear();
  const bulanIni = kini.getMonth() + 1;

  const [sorot] = useState(() => {
    const t = Number(params.tahun);
    const b = Number(params.bulan);
    return Number.isInteger(t) && t >= TAHUN_MIN && t <= tahunIni && b >= 1 && b <= 12
      ? { tahun: t, bulan: b }
      : null;
  });
  const [tahun, setTahun] = useState(() => sorot?.tahun ?? tahunIni);

  const [rows, setRows] = useState<Periode[]>([]);
  const [err, setErr] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${tahun}|${reloadToken}`;
  const loading = loadedKey !== requestKey;
  // A pull on a year already on screen, as opposed to a year still arriving.
  const refreshing = loading && loadedKey.startsWith(`${tahun}|`);

  const [pilih, setPilih] = useState<{ tahun: number; bulan: number; tutup: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aksiErr, setAksiErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Twelve is every row a year can have, so one page is the whole year.
        const answer = await listPeriode({ tahun, size: 12 });
        if (!alive) return;
        setRows(answer.data);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setErr(messageOf(e, 'Gagal memuat status tutup buku.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tahun, reloadToken, requestKey]);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/laporan');
  }, [router]);

  const jalankan = useCallback(async () => {
    if (!pilih || busy) return;
    setBusy(true);
    setAksiErr('');
    try {
      const saved = await (pilih.tutup ? tutupPeriode : bukaPeriode)(pilih.tahun, pilih.bulan);
      setRows((list) => [
        ...list.filter((r) => !(r.tahun === pilih.tahun && r.bulan === pilih.bulan)),
        // The response is the row as it now stands, including who did it; a
        // re-read would only say the same thing one round trip later.
        { ...saved, tahun: pilih.tahun, bulan: pilih.bulan },
      ]);
      setPilih(null);
    } catch (e) {
      setAksiErr(messageOf(e, 'Server menolak perubahan periode.'));
    } finally {
      setBusy(false);
    }
  }, [pilih, busy]);

  const jumlahBulan = tahun === tahunIni ? bulanIni : 12;
  const bulanList = Array.from({ length: jumlahBulan }, (_, i) => jumlahBulan - i);

  return (
    <View style={styles.screen}>
      <RamahHeader title="Tutup buku" onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + L.space10 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setReloadToken((n) => n + 1)}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }>
        <View style={styles.tahunRow}>
          <RamahIconButton
            icon="chevron-left"
            label="Tahun sebelumnya"
            disabled={tahun <= TAHUN_MIN}
            onPress={() => setTahun((t) => t - 1)}
          />
          <Text style={styles.tahun}>{tahun}</Text>
          <RamahIconButton
            icon="chevron-right"
            label="Tahun berikutnya"
            // A future month has nothing posted into it to protect.
            disabled={tahun >= tahunIni}
            onPress={() => setTahun((t) => t + 1)}
          />
        </View>

        {err ? (
          <RamahInlineError message={err} onRetry={() => setReloadToken((n) => n + 1)} />
        ) : loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.brand} />
          </View>
        ) : (
          <RamahStackCard>
            {bulanList.map((bulan) => {
              const row = rows.find((r) => r.tahun === tahun && r.bulan === bulan);
              return (
                <BulanRow
                  key={bulan}
                  tahun={tahun}
                  bulan={bulan}
                  row={row}
                  sorot={sorot?.tahun === tahun && sorot.bulan === bulan}
                  onPress={
                    bisaUbah
                      ? () => {
                          setAksiErr('');
                          setPilih({ tahun, bulan, tutup: row?.status !== 'TUTUP' });
                        }
                      : undefined
                  }
                />
              );
            })}
          </RamahStackCard>
        )}
      </ScrollView>

      <RamahSheet
        visible={pilih !== null}
        title={
          pilih
            ? `${pilih.tutup ? 'Tutup' : 'Buka kembali'} ${labelBulan(pilih.tahun, pilih.bulan)}`
            : ''
        }
        onClose={() => setPilih(null)}>
        {pilih ? (
          <View style={styles.sheetBody}>
            {/* The consequence, stated before the press — the one sentence
                issue #12 asks this screen to say. */}
            <Text style={styles.penjelasan}>
              {pilih.tutup
                ? `Setiap posting bertanggal ${labelBulan(pilih.tahun, pilih.bulan)} akan ditolak, dari modul mana pun. Pembatalan dokumen tetap bisa; pembaliknya masuk bulan berjalan.`
                : `Posting bertanggal ${labelBulan(pilih.tahun, pilih.bulan)} bisa masuk lagi. Riwayat penutupannya tetap tercatat.`}
            </Text>
            {aksiErr ? <RamahInlineError message={aksiErr} /> : null}
            <View style={styles.sheetActions}>
              <RamahPrimaryButton
                label={pilih.tutup ? 'Tutup bulan' : 'Buka kembali'}
                onPress={jalankan}
                busy={busy}
                disabled={busy}
              />
              <RamahTertiaryButton
                label="Batal"
                onPress={() => setPilih(null)}
                height={L.controlHSm + 4}
              />
            </View>
          </View>
        ) : null}
      </RamahSheet>
    </View>
  );
}

function BulanRow({
  tahun,
  bulan,
  row,
  sorot,
  onPress,
}: {
  tahun: number;
  bulan: number;
  row: Periode | undefined;
  sorot: boolean;
  onPress?: () => void;
}) {
  const [down, setDown] = useState(false);
  const tutup = row?.status === 'TUTUP';
  const label = labelBulan(tahun, bulan);

  // Who and when, only when there is a who and a when. A month that was never
  // touched gets no second line at all.
  const jejak = tutup
    ? `Ditutup ${row?.nama_penutup || '—'} · ${tanggalLokal(row?.ts_tutup)}`
    : row?.ts_buka
      ? `Dibuka kembali ${row.nama_pembuka || '—'} · ${tanggalLokal(row.ts_buka)}`
      : '';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${tutup ? 'tutup' : 'buka'}${jejak ? `. ${jejak}` : ''}${
        onPress ? `. ${tutup ? 'Buka kembali' : 'Tutup bulan'}` : ''
      }`}
      style={[styles.row, sorot && styles.rowSorot, down && styles.rowDown]}>
      <View style={styles.grow}>
        <Text style={styles.rowTitle}>{label}</Text>
        {jejak ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {jejak}
          </Text>
        ) : null}
      </View>
      {tutup ? <RamahBadge label="Tutup" tone="neutral" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, gap: L.stack },

  tahunRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tahun: { ...T.titleSmall, color: C.textTitle },

  loadingBox: { paddingVertical: L.space6, alignItems: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowSorot: { backgroundColor: C.brandTintSoft },
  rowDown: { backgroundColor: C.surfaceStack },
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowSub: { ...T.bodySmall, color: C.textMuted },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space4, paddingBottom: L.space2 },
  penjelasan: { ...T.bodyModerate, color: C.textBody },
  sheetActions: { gap: L.related, paddingTop: L.space1 },
});
