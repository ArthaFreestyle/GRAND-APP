/**
 * Detail pemasok — one supplier, and the two things anybody opens one for.
 *
 * **Who they are and how to reach them**, which is the reference data a list row
 * deliberately does not print, and **what is still owed them**, which is a link
 * rather than a section: `GET /supplier/{id}/utang` is a paged work queue with
 * its own ordering and its own totals, and squeezing three of its rows onto this
 * card would answer neither question properly.
 *
 * ## The two standing actions are icons, and the second one is not a delete
 *
 * Edit and retire are the same two on every supplier, which makes them chrome
 * rather than content, so they sit in `headerRight`. There is **no
 * `DELETE /supplier`** in the contract — `PATCH { is_aktif: false }` is the only
 * removal there is — so the bin means "take this out of the way" and the way
 * back is the same button pointing the other way. A retired supplier is still on
 * every invoice that was ever typed against them, which is exactly why the
 * contract has no way to erase one.
 *
 * ## Why the debt is a count and not a figure
 *
 * The card says how many invoices are still open and what they add up to, and
 * both come from the first page of the utang read. That is honest only because
 * the *card* says so: with more than one page it prints "20+ faktur" rather than
 * a total that would be the sum of a page instead of the sum of the debt. The
 * screen behind the link is where the whole queue lives, and it pages properly.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahStackCard,
} from '@/components/shell/ramah';
import { formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { decimalToNumber } from '@/services/decimal';
import { useCanWrite } from '@/services/permissions';
import {
  getSupplier,
  listUtang,
  supplierBus,
  supplierDetailBus,
  updateSupplier,
  type Supplier,
  type UtangFaktur,
} from '@/services/supplier';

/** Enough to say "several" without pretending to be the whole queue. See the header. */
const UTANG_PEEK = 20;

export default function PemasokDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const canWrite = useCanWrite('supplier');

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  const [utang, setUtang] = useState<UtangFaktur[] | null>(null);
  const [utangLebih, setUtangLebih] = useState(false);
  const [utangErr, setUtangErr] = useState('');

  /**
   * A malformed `:id` is known the moment the params arrive, so the failure page
   * is derived during render rather than written from an effect — which is what
   * `react-hooks/set-state-in-effect` refuses, and which would also paint one
   * frame of a loading screen for a URL that was never going to load.
   */
  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const loadErr = idValid ? loadErrState : 'Alamat pemasok tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      /**
       * The record and its open invoices side by side, and settled rather than
       * raced because they fail differently: a supplier that will not load is
       * the whole page, while a debt read that will not load leaves a perfectly
       * correct record that simply cannot say what is owed.
       */
      const [record, bills] = await Promise.allSettled([
        getSupplier(id),
        listUtang(id, { size: UTANG_PEEK }),
      ]);
      if (!alive) return;

      if (record.status === 'fulfilled') {
        setSupplier(record.value);
        setLoadErr('');
      } else {
        setSupplier(null);
        // Arrived at cold — a deep link, a reload — so there may be no list
        // behind this screen to toast over. The failure is the page.
        setLoadErr(messageOf(record.reason, 'Gagal memuat pemasok.'));
      }

      if (bills.status === 'fulfilled') {
        setUtang(bills.value.data);
        setUtangLebih(Math.max(1, bills.value.paging.total_page ?? 1) > 1);
        setUtangErr('');
      } else {
        setUtang(null);
        setUtangErr('Sisa utang tidak terbaca.');
      }

      setLoadedKey(requestKey);
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken, requestKey]);

  /** What the edit route hands back to this screen while it sits underneath. */
  useRecordBus(supplierDetailBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    setSupplier(change.row);
    setKabar('Perubahan tersimpan.');
  });

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemasok');
  }, [router]);

  /**
   * Retire or bring back. One `PATCH`, and the answer is the whole record, so
   * there is nothing to merge — and both buses are told, because the list
   * underneath draws a row while this screen draws the record.
   */
  const toggleAktif = useCallback(async () => {
    if (!supplier || busy) return;
    setBusy(true);
    try {
      const saved = await updateSupplier(supplier.id, { is_aktif: !supplier.aktif });
      setSupplier(saved);
      supplierBus.publish({ kind: 'saved', row: saved });
      setKabar(
        saved.aktif
          ? 'Pemasok aktif lagi.'
          : 'Pemasok dinonaktifkan · tidak lagi muncul saat membuat nota'
      );
      setLoadErr('');
    } catch (e) {
      setLoadErr(messageOf(e, 'Gagal mengubah status pemasok.'));
    } finally {
      setBusy(false);
    }
  }, [supplier, busy]);

  // Covers both an unparseable `:id` and a read that failed, because `loadErr`
  // already carries the first as a sentence.
  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail pemasok" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Pemasok tidak ditemukan</Text>
          <Text style={styles.centerSub}>{loadErr}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke daftar" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!supplier) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail pemasok" onBack={goBack} />
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={C.brand} />
          ) : (
            <RamahInlineError message="Pemasok tidak terbaca." onRetry={reload} />
          )}
        </View>
      </View>
    );
  }

  const sisaHalamanIni = (utang ?? []).reduce((t, f) => t + decimalToNumber(f.sisa_utang), 0);
  const jumlahFaktur = utang?.length ?? 0;

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail pemasok"
        onBack={goBack}
        right={
          canWrite ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah pemasok"
                onPress={() => router.push({ pathname: '/pemasok/[id]/ubah', params: { id } })}
              />
              {/* Retiring, not deleting — the contract has no `DELETE /supplier`
                  and `is_aktif: false` is the only removal there is. The bin is
                  what everyone reads as "take this out of the way", and the way
                  back is the same button pointing the other way. */}
              <RamahIconButton
                icon={supplier.aktif ? 'trash-2' : 'rotate-ccw'}
                label={supplier.aktif ? 'Nonaktifkan pemasok' : 'Aktifkan kembali'}
                color={supplier.aktif ? C.danger : C.brandInk}
                onPress={toggleAktif}
                disabled={busy}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

        <View style={styles.identity}>
          <Text style={styles.identityName}>{supplier.nama}</Text>
          <Text style={styles.identitySub}>{supplier.kode || 'Tanpa kode'}</Text>
          {supplier.aktif ? null : (
            <View style={styles.badgeRow}>
              <RamahBadge label="Nonaktif" tone="neutral" />
            </View>
          )}
        </View>

        {/* The debt, as a link rather than a section — see the file header for
            why the figure on this card is a page and not a total. */}
        <Pressable
          onPress={() => router.push({ pathname: '/pemasok/[id]/utang', params: { id } })}
          accessibilityRole="button"
          accessibilityLabel={
            utangErr
              ? 'Buka utang pemasok. Sisa utang belum terbaca.'
              : jumlahFaktur === 0
                ? 'Buka utang pemasok. Tidak ada faktur terbuka.'
                : `Buka utang pemasok. ${utangLebih ? 'Lebih dari' : ''} ${jumlahFaktur} faktur terbuka`
          }
          style={styles.utangCard}>
          <View style={styles.grow}>
            <Text style={styles.utangLabel}>Faktur yang masih terbuka</Text>
            {utangErr ? (
              <Text style={styles.utangSub}>{utangErr}</Text>
            ) : loading ? (
              <Text style={styles.utangSub}>Membaca…</Text>
            ) : jumlahFaktur === 0 ? (
              <Text style={styles.utangValue}>Tidak ada</Text>
            ) : (
              <>
                <Text style={styles.utangValue}>
                  {utangLebih ? `${UTANG_PEEK}+ faktur` : `${jumlahFaktur} faktur`}
                </Text>
                <Text style={styles.utangSub}>
                  {utangLebih
                    ? `Halaman pertama berjumlah ${formatRupiah(sisaHalamanIni)}`
                    : `Sisa ${formatRupiah(sisaHalamanIni)}`}
                </Text>
              </>
            )}
          </View>
          <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
        </Pressable>

        <View style={styles.groupStart}>
          <RamahSectionHeader>Kontak</RamahSectionHeader>
        </View>
        <RamahStackCard>
          <Baris label="Telepon" value={supplier.telepon} />
          <Baris label="Alamat" value={supplier.alamat} />
          <Baris label="NPWP" value={supplier.npwp} />
        </RamahStackCard>

        <Text style={styles.jejak}>
          {`Dibuat ${formatTanggal(supplier.createdAt)}${
            supplier.namaPembuat ? ` oleh ${supplier.namaPembuat}` : ''
          }`}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * One reference field. An empty one is drawn as a dash rather than dropped:
 * "NPWP —" answers the question, while a missing row leaves somebody wondering
 * whether the app forgot to show it.
 */
function Baris({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.baris}>
      <Text style={styles.barisLabel}>{label}</Text>
      <Text style={styles.barisValue} numberOfLines={4}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space2,
    paddingBottom: L.space10,
    gap: L.stack,
  },
  // A heading in this `stack` column opens a new group: `group` above it.
  groupStart: { paddingTop: L.group - L.stack },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.inline, paddingVertical: L.space2 },
  identityName: { ...T.titleModerate, color: C.textTitle },
  identitySub: { ...T.bodySmall, color: C.textBody },
  badgeRow: { flexDirection: 'row', paddingTop: L.space2 },

  utangCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
  },
  utangLabel: { ...T.caption, color: C.textBody },
  /* Guide §3: a figure is always `--text-title`, never toned. Tone belongs to a
     chip beside it, and "three unpaid invoices" is not an alarm on its own. */
  utangValue: { ...T.titleLarge, color: C.textTitle },
  utangSub: { ...T.bodySmall, color: C.textBody },

  baris: {
    paddingHorizontal: L.cardPad,
    paddingVertical: L.cardPadDense,
    gap: L.inline,
    // Guide §7: a list row is 56.
    minHeight: L.rowH,
    justifyContent: 'center',
  },
  barisLabel: { ...T.caption, color: C.textBody },
  barisValue: { ...T.bodyModerate, color: C.textTitle },

  // `T.bodySmall`, the merchant scale's metadata size — not `T.caption`.
  jejak: { ...T.bodySmall, color: C.textMuted, paddingTop: L.space2 },
});
