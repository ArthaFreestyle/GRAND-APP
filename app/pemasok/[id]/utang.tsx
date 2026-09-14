/**
 * Utang pemasok — the invoices this supplier is still owed money on.
 *
 * `GET /supplier/{id}/utang` is the contract's own words a "daftar kerja untuk
 * menyusun pembayaran", and it breaks one of this API's habits on purpose:
 * **it is sorted oldest first**, the only list in the whole contract that is.
 * The screen must not re-sort it. The invoice that has waited longest is the one
 * paid next, and a list that helpfully put the biggest debt on top would be
 * answering a question nobody asked while burying the one it was built for.
 *
 * ## Three numbers per row, and none of them is decoration
 *
 * `total` is what the supplier billed. `jumlah_dialokasikan` is what has been
 * paid against it **effectively** — from `POSTED` payments only, and for a giro
 * only once it has cleared, so a cheque still in the drawer does not count.
 * `nilai_kredit_retur` is what returns have credited back. `sisa_utang` is the
 * three of them subtracted, and it is the only one a row leads with; the rest
 * are the working, shown underneath because a figure somebody is about to pay
 * against should be able to be checked.
 *
 * ## What this screen deliberately cannot do
 *
 * It cannot take a payment. `POST /pembayaran-utang` exists and is a document
 * module of its own — four transitions, allocation across invoices, giro
 * clearing — and a "Bayar" button here would be a button that opens nothing.
 * This is the queue; paying it is a section that has not been built.
 *
 * `termasuk_lunas` is offered as a chip because the endpoint offers it, and
 * because "did we already pay this one" is the question somebody asks next when
 * an invoice is *not* in the default list.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import { BAYAR_META } from '@/components/shell/status-dokumen';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { getSupplier, listUtang, type UtangFaktur } from '@/services/supplier';

const PAGE_SIZE = 20;

export default function UtangPemasokScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [nama, setNama] = useState('');
  const [rows, setRows] = useState<UtangFaktur[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErrState, setListErr] = useState('');
  const [termasukLunas, setTermasukLunas] = useState(false);

  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${termasukLunas}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const listErr = idValid ? listErrState : 'Alamat pemasok tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      /**
       * The name and the queue together, settled rather than raced: a name that
       * will not load leaves a perfectly readable list of invoices, while a list
       * that will not load is the page. An unknown supplier answers 404 on both,
       * and a supplier with no debt answers an empty page on the second — two
       * different facts the placeholder keeps apart.
       */
      const [record, bills] = await Promise.allSettled([
        getSupplier(id),
        listUtang(id, { page: 1, size: PAGE_SIZE, termasukLunas }),
      ]);
      if (!alive) return;

      if (record.status === 'fulfilled') setNama(record.value.nama);

      if (bills.status === 'fulfilled') {
        setRows(bills.value.data);
        setPage(1);
        setHasMore(Math.max(1, bills.value.paging.total_page ?? 1) > 1);
        setListErr('');
      } else {
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(bills.reason, 'Gagal memuat utang pemasok.'));
      }

      setMoreErr('');
      setLoadedKey(requestKey);
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, termasukLunas, reloadToken, requestKey]);

  const loadMore = useCallback(
    async (force = false) => {
      if (!idValid || loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listUtang(id, { page: next, size: PAGE_SIZE, termasukLunas });
        // Offset paging with no cursor, so a posting that lands mid-scroll can
        // shift the window and repeat a row. Merged by the invoice id.
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id_pembelian));
          return [...list, ...answer.data.filter((x) => !seen.has(x.id_pembelian))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, answer.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [id, idValid, loadingMore, loading, hasMore, moreErr, page, termasukLunas]
  );

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemasok');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: UtangFaktur; index: number }) => (
      <FakturRow
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        // Every one of these is a real pembelian, and the document is where the
        // lines, the freight and the four transitions live — so the row opens
        // it rather than restating any of that here.
        onPress={() =>
          router.push({ pathname: '/pembelian/[id]', params: { id: item.id_pembelian ?? 0 } })
        }
      />
    ),
    [rows.length, router]
  );

  /**
   * The total of what is *loaded*, and the caption says so.
   *
   * No endpoint reports the supplier's whole outstanding balance, and adding up
   * the pages in hand and calling it "total utang" would be a number somebody
   * would act on that is only true on the last page.
   */
  const sisaDimuat = rows.reduce((t, f) => t + decimalToNumber(f.sisa_utang), 0);

  return (
    <View style={styles.screen}>
      <RamahHeader title={nama || 'Utang pemasok'} onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id_pembelian)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.chipRow}>
              <RamahChip
                label="Termasuk lunas"
                selected={termasukLunas}
                onPress={() => setTermasukLunas((v) => !v)}
                accessibilityLabel={
                  termasukLunas ? 'Sembunyikan faktur lunas' : 'Tampilkan juga faktur lunas'
                }
              />
            </View>
            {/* Guide §3: the label sits *above* the value, never beside it. */}
            {rows.length ? (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>
                  {hasMore ? 'Sisa faktur yang sudah dimuat' : 'Sisa seluruh faktur terbuka'}
                </Text>
                <Text style={styles.totalValue}>{formatRupiah(sisaDimuat)}</Text>
              </View>
            ) : null}
            {/* Said once, at the top, because the ordering is the whole point of
                this list and it is the opposite of every other list in the app. */}
            {rows.length ? (
              <RamahNote icon="clock">
                Urut dari faktur paling lama. Yang paling atas adalah yang berikutnya dibayar.
              </RamahNote>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            loading={loading}
            error={listErr}
            termasukLunas={termasukLunas}
            onRetry={reload}
            onBack={goBack}
          />
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />
    </View>
  );
}

function FakturRow({
  row,
  first,
  last,
  onPress,
}: {
  row: UtangFaktur;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const sisa = decimalToNumber(row.sisa_utang);
  const total = decimalToNumber(row.total);
  const dibayar = decimalToNumber(row.jumlah_dialokasikan);
  const kredit = decimalToNumber(row.nilai_kredit_retur);
  const meta = row.status_pembayaran ? BAYAR_META[row.status_pembayaran] : null;

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.nomor}, sisa ${formatRupiah(sisa)}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.rowHead}>
          <View style={styles.grow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {row.nomor}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {/* The supplier's own invoice number when there is one: that is
                  what is written on the paper being paid against, and it is how
                  a shop matches a payment to a bill. */}
              {[formatTanggal(row.tanggal), row.no_faktur_supplier || null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text style={styles.rowValue} numberOfLines={1}>
            {formatRupiah(sisa)}
          </Text>
        </View>
        <View style={styles.rowFoot}>
          {meta ? <RamahBadge label={meta.label} tone={bayarTone(row.status_pembayaran)} /> : null}
          {/* The working behind the figure above. Printed only where it says
              something: an invoice with nothing paid and nothing credited is
              already fully described by its total. */}
          <Text style={styles.rowWorking} numberOfLines={1}>
            {dibayar === 0 && kredit === 0
              ? `Tagihan ${formatRupiah(total)}`
              : `${formatRupiah(total)} − dibayar ${formatRupiah(dibayar)}${
                  kredit > 0 ? ` − retur ${formatRupiah(kredit)}` : ''
                }`}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The badge maps in `status-dokumen.ts` are toned for the old palette; this maps
 * the three payment states onto Ramah's five tones instead of inventing new
 * words for them. The **label** still comes from `BAYAR_META`, because a status
 * has to be the same word on a ported screen and an unported one for as long as
 * both exist.
 */
function bayarTone(status: UtangFaktur['status_pembayaran']) {
  if (status === 'LUNAS') return 'success' as const;
  if (status === 'SEBAGIAN') return 'warn' as const;
  return 'neutral' as const;
}

function Placeholder({
  loading,
  error,
  termasukLunas,
  onRetry,
  onBack,
}: {
  loading: boolean;
  error: string;
  termasukLunas: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (error)
    return (
      <View style={styles.placeholder}>
        <RamahInlineError message={error} onRetry={onRetry} />
        <View style={styles.placeholderAction}>
          <RamahSecondaryButton label="Kembali ke daftar" onPress={onBack} />
        </View>
      </View>
    );
  if (loading)
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {termasukLunas
          ? 'Belum ada faktur pembelian yang diposting atas pemasok ini.'
          : 'Tidak ada faktur yang masih punya sisa. Semuanya sudah lunas.'}
      </Text>
    </View>
  );
}

function Footer({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.cardGap, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  totalCard: { gap: 2 },
  totalLabel: { ...T.caption, color: C.textBody },
  /* Guide §3: the figure is never toned. What is owed is a fact, not an alarm. */
  totalValue: { ...T.metric, color: C.textTitle },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: { padding: L.cardPad, gap: L.space2 },
  rowDown: { backgroundColor: C.grey50 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  rowTitle: { ...T.rowTitle, color: C.textTitle },
  rowSub: { ...T.caption, color: C.textBody },
  rowValue: { ...T.fieldValue, color: C.textTitle, textAlign: 'right' },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  // 13/18: this is the arithmetic behind a figure somebody is about to pay
  // against, so it has to be checkable. Guide §7 reserves 11px for tile
  // labels and counters.
  rowWorking: { ...T.caption, color: C.textMuted, flex: 1, minWidth: 0, textAlign: 'right' },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.caption, color: C.textBody, textAlign: 'center' },
  placeholderAction: { paddingTop: L.space4 },
  footer: { paddingVertical: L.space5, alignItems: 'center' },
});
