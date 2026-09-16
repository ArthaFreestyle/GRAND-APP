/**
 * Nota penjualan — one sale, read back. Issue #25, Riwayat's detail.
 *
 * A cash note at the counter runs the shortest flow in this app —
 * `DRAFT → POSTED → BATAL`, no `DIAJUKAN` — and by the time somebody opens it
 * from Riwayat it is almost always already `POSTED`: the till posts in the
 * same two calls that create it (`app/(admin)/kasir.tsx`), so a DRAFT sitting
 * here is an abandoned one, from a connection that dropped between the two.
 * This screen still shows whatever the active grant's own `AKSI` table allows
 * for that status — including posting a stranded draft — because the table is
 * the single source of what may happen next and a detail reached by a
 * different door does not get a different answer.
 *
 * **No editing here.** `PATCH /penjualan/{id}` and `PUT .../detail` exist in
 * the contract, but Riwayat's job is reading back what the till already rang
 * up, not correcting it — a nota is typed and posted in one sitting at the
 * counter, and the one thing this screen adds on top of that is the two things
 * a shift actually needs afterwards: reprinting the paper, and — for
 * `SUPERADMIN` alone — undoing a posted sale.
 *
 * ## Reprinting is an approximation, and it says so
 *
 * The server does not store what was actually tendered — no `uang_diterima`
 * column — so a reprint cannot know the real change given at the counter. It
 * prints `paid = total`, `change = 0`: honest about the one thing that is
 * certain (a TUNAI POSTED note is `LUNAS`, so nothing is owed) without
 * inventing a number nobody can verify afterwards. The `jenis` line has the
 * same limit for a different reason: `app/(admin)/kasir.tsx` posts a QRIS sale
 * as `TUNAI` on purpose (the contract's field answers "is anything still
 * owed", not "which instrument"), and that choice is not reversible from the
 * document afterwards — this screen prints `TUNAI`, and cannot tell a cash sale
 * from a QRIS one after the fact.
 *
 * ## Beside the tabs, not inside them — see `_layout.tsx`
 *
 * Riwayat is a tab; this is not. Pushed from wherever a nota is tapped —
 * Riwayat's own rows today — onto the stack that *contains* the tabs, so back
 * returns to the tab the reader was actually on rather than wherever this
 * route happens to sit. `goBack` below is the same shape `pembelian`'s and
 * `produk`'s details use, for the same reason.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AksiDialog } from '@/components/shell/aksi-dialog';
import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahStackCard,
  RamahSummaryCard,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import * as printer from '@/services/bluetooth-printer';
import { decimalToNumber, formatDesimal } from '@/services/decimal';
import {
  aksiTersedia,
  getPenjualan,
  jalankanAksi,
  penjualanBus,
  rowOf,
  type AksiDokumen,
  type PenjualanDoc,
} from '@/services/penjualan';
import { useActiveRole } from '@/services/permissions';
import { PAPER_LABEL, PAPER_OPTIONS, encodeReceipt, receiptDateTime, type PaperColumns, type ReceiptData } from '@/services/receipt';

export default function PenjualanDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [doc, setDoc] = useState<PenjualanDoc | null>(null);
  /** A malformed `:id` is a fact about the route, known when the params arrive — derived, not written from an effect. */
  const idValid = Number.isFinite(id);
  const [loadErrState, setLoadErr] = useState('');
  /** Loading is derived — "the id wanted" against "the id loaded" — the shape `app/produk/index.tsx` established. */
  const [loadedId, setLoadedId] = useState(0);
  const loading = idValid && loadedId !== id;
  const loadErr = idValid ? loadErrState : 'Alamat dokumen tidak dikenali.';

  /**
   * Bumped by pull-to-refresh. `refreshing` tracks it against `loadedToken`
   * rather than `loading`, which is keyed on `id` alone and would never
   * disagree while pulling on the same document.
   */
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedToken, setLoadedToken] = useState(-1);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  const [printerOpen, setPrinterOpen] = useState(false);
  const [dev, setDev] = useState<printer.PrinterDevice | null>(null);
  const [paired, setPaired] = useState<printer.PrinterDevice[]>([]);
  const [paper, setPaper] = useState<PaperColumns>(32);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerErr, setPrinterErr] = useState('');

  const role = useActiveRole();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.space3);

  const generation = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const mine = ++generation.current;
    let cancelled = false;
    const alive = () => !cancelled && generation.current === mine;

    getPenjualan(id)
      .then((current) => {
        if (!alive()) return;
        setDoc(current);
        setLoadErr('');
      })
      .catch((e) => {
        if (!alive()) return;
        setDoc(null);
        // Arrived cold — a deep link, a reload — there may be no list behind
        // this screen to toast over, so the failure is the page.
        setLoadErr(messageOf(e, 'Gagal memuat nota penjualan.'));
      })
      .finally(() => {
        if (alive()) {
          setLoadedId(id);
          setLoadedToken(reloadToken);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  useEffect(() => {
    let alive = true;
    printer.loadSavedPrinter().then((saved) => {
      if (alive && saved) setDev((cur) => cur ?? saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/riwayat');
  }, [router]);

  async function confirmAksi() {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim() === '') return setAksiErr('Alasan wajib diisi.');
    setBusy(true);
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      setDoc(saved);
      setKabar(pesanAksi(aksi.key));
      penjualanBus.publish({ kind: 'saved', row: rowOf(saved) });
      setAksi(null);
      setAlasan('');
      setAksiErr('');
    } catch (e) {
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  async function loadPaired() {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureReady();
      setPaired(await printer.listBonded());
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Daftar printer tidak terbaca.');
    } finally {
      setPrinterBusy(false);
    }
  }

  async function pilihPrinter(d: printer.PrinterDevice) {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureConnected(d.address);
      await printer.saveSelectedPrinter(d);
      setDev(d);
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Printer tidak bisa disambungkan.');
    } finally {
      setPrinterBusy(false);
    }
  }

  async function cetakUlang(target: printer.PrinterDevice | null) {
    if (!doc) return;
    if (!target) {
      setPrinterOpen(true);
      if (printer.isPrinterSupported() && !paired.length) void loadPaired();
      return;
    }
    const data = strukDari(doc);
    setPrinterErr('');
    try {
      await printer.ensureConnected(target.address);
      await printer.write(target.address, encodeReceipt(data, paper));
      setPrinterOpen(false);
      setKabar(`Struk ${doc.nomor} dikirim ulang ke ${target.name}.`);
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Struk gagal dicetak.');
      setPrinterOpen(true);
    }
  }

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail nota" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Nota tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat dokumen tidak dikenali.'}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke riwayat" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail nota" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  // ---- derived ----

  const meta = DOKUMEN_RAMAH[doc.status];
  const bisaCetak = doc.status === 'POSTED';
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);
  const margin = doc.totalHpp !== null ? decimalToNumber(doc.total) - decimalToNumber(doc.totalHpp) : null;

  return (
    <View style={styles.screen}>
      <RamahHeader title={doc.nomor || 'Detail nota'} onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={loadedToken !== reloadToken}
            onRefresh={reload}
            tintColor={C.brand}
            colors={[C.brand]}
          />
        }>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <View style={styles.identityTop}>
            <Text style={styles.identityName} numberOfLines={2}>
              {doc.namaPelanggan || 'Pelanggan umum'}
            </Text>
            <RamahBadge label={meta.label} tone={meta.tone} />
          </View>
          <Text style={styles.identitySub}>
            {`${doc.nomor} · ${formatTanggal(doc.tanggal)} · ruang ${doc.namaRuang || '—'}`}
          </Text>
        </View>

        {doc.status === 'BATAL' && doc.alasanBatal ? (
          <View style={styles.alasanBox}>
            <Text style={styles.alasanLabel}>Nota dibatalkan</Text>
            <Text style={styles.alasanText}>{doc.alasanBatal}</Text>
            <Text style={styles.alasanNote}>
              Baris pembaliknya bertanggal hari pembatalan, dinilai pada rata-rata bergerak yang
              berlaku sekarang — bukan tanggal atau harga pokok nota ini.
            </Text>
          </View>
        ) : null}

        <View style={styles.group}>
          <RamahSectionHeader>Ringkasan</RamahSectionHeader>
          <RamahSummaryCard
            rows={[
              { label: 'Pembayaran', value: doc.jenis === 'KREDIT' ? 'Kredit' : 'Tunai' },
              { label: 'Total nota', value: formatRupiah(doc.total) },
              {
                label: 'Harga pokok',
                value: doc.totalHpp === null ? 'Belum diposting' : formatRupiah(doc.totalHpp),
              },
              {
                label: 'Laba kotor',
                value: margin === null ? '—' : formatRupiah(margin),
              },
            ]}
          />
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>{`Baris · ${doc.lines.length} produk`}</RamahSectionHeader>
          {doc.lines.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nota belum punya baris</Text>
            </View>
          ) : (
            <RamahStackCard>
              {doc.lines.map((line) => (
                <View key={line.id} style={styles.lineRow}>
                  <View style={styles.grow}>
                    <Text style={styles.lineNama} numberOfLines={2}>
                      {line.nama || line.kode}
                    </Text>
                    <Text style={styles.lineSub} numberOfLines={1}>
                      {`${formatDesimal(line.qtyInput)} ${line.namaSatuan} × ${formatRupiah(line.hargaSatuanInput)}`}
                    </Text>
                  </View>
                  <Text style={styles.lineValue} numberOfLines={1}>
                    {formatRupiah(line.subtotal)}
                  </Text>
                </View>
              ))}
            </RamahStackCard>
          )}
          <RamahSummaryCard
            rows={[
              { label: 'Subtotal', value: formatRupiah(doc.subtotal) },
              { label: 'Diskon nota', value: `− ${formatRupiah(doc.diskonNota)}` },
              { label: 'PPN', value: formatRupiah(doc.ppn) },
              { label: 'Pembulatan', value: formatRupiah(doc.pembulatan) },
              { label: 'Total nota', value: formatRupiah(doc.total) },
            ]}
          />
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Jejak dokumen</RamahSectionHeader>
          <RamahSummaryCard rows={jejakRows(doc)} />
        </View>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {bisaCetak ? (
          <RamahSecondaryButton
            label="Cetak ulang struk"
            icon="printer"
            fullWidth
            height={L.controlH}
            onPress={() => void cetakUlang(dev)}
          />
        ) : null}
        {aksiList.length > 0
          ? aksiList.map((a, i) =>
              i === 0 && !a.danger ? (
                <RamahPrimaryButton
                  key={a.key}
                  label={a.label}
                  onPress={() => {
                    setAksi(a);
                    setAlasan('');
                    setAksiErr('');
                  }}
                />
              ) : (
                <RamahSecondaryButton
                  key={a.key}
                  label={a.label}
                  fullWidth
                  height={L.controlH}
                  onPress={() => {
                    setAksi(a);
                    setAlasan('');
                    setAksiErr('');
                  }}
                />
              )
            )
          : !bisaCetak && (
              <Text style={styles.noAksi}>{pesanTanpaAksi(doc.status)}</Text>
            )}
      </View>

      <AksiDialog
        aksi={aksi}
        alasan={alasan}
        onChangeAlasan={(v) => {
          setAlasan(v);
          setAksiErr('');
        }}
        error={aksiErr}
        busy={busy}
        onCancel={() => {
          setAksi(null);
          setAlasan('');
          setAksiErr('');
        }}
        onConfirm={confirmAksi}
      />

      <RamahSheet visible={printerOpen} title="Printer struk" onClose={() => setPrinterOpen(false)}>
        <View style={styles.sheetBody}>
          {!printer.isPrinterSupported() ? (
            <Text style={styles.lineSub}>
              Printer bluetooth hanya jalan di dev build — modul nativenya tidak ada di Expo Go.
            </Text>
          ) : (
            <>
              {printerErr ? (
                <RamahInlineError message={printerErr} onRetry={() => void loadPaired()} />
              ) : null}
              <Text style={styles.lineSub}>
                Perangkat yang sudah di-pair lewat Pengaturan Android.
              </Text>
              {printerBusy ? <ActivityIndicator color={C.brand} /> : null}
              {paired.map((d) => (
                <RamahSheetOption
                  key={d.address}
                  label={d.name}
                  sub={d.address}
                  selected={dev?.address === d.address}
                  onPress={() => void pilihPrinter(d)}
                />
              ))}
              <View style={styles.chipRow}>
                {PAPER_OPTIONS.map((cols) => (
                  <RamahChip
                    key={cols}
                    label={PAPER_LABEL[cols]}
                    selected={paper === cols}
                    onPress={() => setPaper(cols)}
                  />
                ))}
              </View>
              {dev ? (
                <RamahPrimaryButton label={`Cetak ke ${dev.name}`} onPress={() => void cetakUlang(dev)} />
              ) : null}
            </>
          )}
        </View>
      </RamahSheet>
    </View>
  );
}

/**
 * A reprint reconstructed from the stored document, not from anything ephemeral
 * the original till session held — see the file header for the two things this
 * cannot know for certain (what was actually tendered, and cash vs QRIS).
 */
function strukDari(doc: PenjualanDoc): ReceiptData {
  return {
    nota: doc.nomor,
    datetime: receiptDateTime(new Date(doc.postedAt ?? doc.createdAt)),
    // The contract's `created_by` is an id, not a name, and no join brings one
    // back on this endpoint — there is no cashier name to print.
    kasir: '',
    ruang: doc.namaRuang,
    jenis: doc.jenis === 'KREDIT' ? 'KREDIT' : 'TUNAI',
    pelanggan: doc.namaPelanggan || null,
    items: doc.lines.map((l) => ({
      name: l.nama,
      qty: decimalToNumber(l.qtyInput),
      unit: l.namaSatuan,
      price: decimalToNumber(l.hargaSatuanInput),
      disc: decimalToNumber(l.diskonBaris),
    })),
    sub: decimalToNumber(doc.subtotal),
    notaDisc: decimalToNumber(doc.diskonNota),
    ppn: decimalToNumber(doc.ppn),
    bulat: decimalToNumber(doc.pembulatan),
    total: decimalToNumber(doc.total),
    paid: decimalToNumber(doc.total),
    change: 0,
  };
}

function pesanAksi(key: AksiDokumen['key']): string {
  switch (key) {
    case 'posting':
      return 'Diposting · barang keluar dan harga pokoknya terisi dari kartu stok.';
    case 'batal':
      return 'Dibatalkan · baris pembalik bertanggal hari ini, dinilai pada rata-rata bergerak yang berlaku sekarang.';
    default:
      return 'Nota diperbarui.';
  }
}

function pesanTanpaAksi(status: PenjualanDoc['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Draf ini belum diposting — kemungkinan tertinggal dari koneksi yang putus di kasir.';
    case 'POSTED':
      return 'Sudah diposting. Hanya supervisor yang bisa membatalkannya.';
    case 'BATAL':
      return 'Nota batal. Tidak ada lagi yang bisa dilakukan di sini.';
    default:
      return '';
  }
}

function jejakRows(doc: PenjualanDoc): { label: string; value: string }[] {
  const rows = [{ label: 'Dibuat', value: formatTanggal(doc.createdAt) }];
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  return rows;
}

/**
 * No top, left or right inset here: `_layout.tsx` pays all three for the
 * section, outside the navigator. The dock reads the bottom inset itself.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space6, gap: L.group },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.space1 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  identityName: { ...T.titleModerate, color: C.textTitle, flexShrink: 1 },
  identitySub: { ...T.bodySmall, color: C.textBody },

  alasanBox: { backgroundColor: C.red50, borderRadius: 16, padding: L.cardPad, gap: L.space1 },
  alasanLabel: { ...T.titleTiny, color: C.textDanger },
  alasanText: { ...T.bodySmall, color: C.textTitle },
  alasanNote: { ...T.caption, color: C.textBody, marginTop: L.space2 },

  group: { gap: L.related },
  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: 16,
    padding: L.cardPad,
  },
  emptyTitle: { ...T.titleTiny, color: C.textTitle },

  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3, padding: L.cardPad, minHeight: L.rowH },
  lineNama: { ...T.titleTiny, color: C.textTitle },
  lineSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  lineValue: { ...T.titleTiny, color: C.textTitle },

  noAksi: { ...T.bodySmall, color: C.textMuted, textAlign: 'center', paddingVertical: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.related,
    backgroundColor: C.surfacePage,
    ...E.low,
  },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space3, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', gap: L.related },
});
