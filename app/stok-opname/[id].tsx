/**
 * Hitung fisik — one counting session, and the only screen in this app that
 * writes a document line at a time.
 *
 * Somebody walks along a rack with a phone. They find a product on this list,
 * type what is actually there, and move on. That is the whole interaction, and
 * every decision below follows from it.
 *
 * ## `null` is "belum dihitung", and it is never zero
 *
 * A line whose `stok_so` is null is skipped entirely at posting. Reading it as
 * zero would post a `SO_DEFISIT` for the product's whole recorded balance — it
 * would wipe the stock of everything nobody got round to counting. So the field
 * starts **empty**, an empty field saves as null rather than as 0, and the
 * screen counts and reports how many lines are still uncounted rather than
 * hiding them. A genuine zero — the shelf really is empty — is typed as `0` and
 * is a different thing.
 *
 * ## Why each line saves on its own, and why that is not a rule being broken
 *
 * `PATCH /stok-opname/{id}/detail/{id_detail}` is the single exception in this
 * contract to "lines are replaced as a set". It exists because these are filled
 * in over hours by somebody on their feet, not retyped in one sitting from a
 * sheet of paper — and because losing an hour of counting to a dropped
 * connection is not a recoverable mistake.
 *
 * The save fires when the field is committed (blur or return), not on every
 * keystroke: typing "120" would otherwise post 1, then 12, then 120, and the
 * middle two are differences somebody would have to explain.
 *
 * **`PUT .../detail` is deliberately not offered here.** It replaces every line
 * *and resets every `stok_so` back to null* — it is how the set of products on
 * the count is corrected, and running it after a morning's work throws that work
 * away. There is no affordance for it on this screen.
 *
 * ## The room is frozen the whole time
 *
 * From the moment the session opened until it is posted or cancelled, the
 * `kartu_stok` trigger refuses every posting into this room from every module.
 * The header says so while the document is `DRAFT` or `DIAJUKAN`, because a
 * cashier being unable to ring up a sale is the visible symptom and this screen
 * is the cause.
 *
 * ## `batal` runs from any status, and that is why it is always reachable
 *
 * Every other document in this app can only be cancelled once posted. This one
 * can be cancelled from `DRAFT`, `DIAJUKAN` or `POSTED`, and the reason is the
 * freeze: a session abandoned in draft would lock its room out of the whole
 * business permanently. `services/stok-opname.ts` lists it three times, once per
 * origin, so `pilihAksi` stays a filter.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AksiDialog } from '@/components/shell/aksi-dialog';
import {
  RamahBadge,
  RamahEmptySearch,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSectionHeader,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatNumber, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import {
  aksiTersedia,
  getStokOpname,
  isiBarisOpname,
  jalankanAksi,
  opnameBus,
  opnameRowOf,
  tarikSaldo,
  type AksiDokumen,
  type OpnameDoc,
  type OpnameLine,
} from '@/services/stok-opname';

export default function StokOpnameDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const canWrite = useCanWrite('opname');
  const role = useActiveRole();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [doc, setDoc] = useState<OpnameDoc | null>(null);
  const [loadErrState, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [aksiErr, setAksiErr] = useState('');
  const [query, setQuery] = useState('');

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');

  const idValid = Number.isFinite(id) && id > 0;
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = idValid ? `${id}|${reloadToken}` : '';
  const loading = idValid && loadedKey !== requestKey;
  const loadErr = idValid ? loadErrState : 'Alamat dokumen tidak dikenali.';

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    (async () => {
      try {
        const answer = await getStokOpname(id);
        if (!alive) return;
        setDoc(answer);
        setLoadErr('');
      } catch (e) {
        if (!alive) return;
        setDoc(null);
        // Arrived at cold, or the room is outside this session's unit kerja —
        // which answers 404 exactly like an id that never existed. Either way
        // there may be no list behind this screen, so the failure is the page.
        setLoadErr(messageOf(e, 'Gagal memuat dokumen stok opname.'));
      } finally {
        if (alive) setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken, requestKey]);

  /**
   * Every write in this module answers with the whole document — the line
   * patches included, which is what keeps `jumlah_belum_dihitung` and both
   * difference columns in step without this screen ever computing them.
   */
  const applyDoc = useCallback((saved: OpnameDoc) => {
    setDoc(saved);
    opnameBus.publish({ kind: 'saved', row: opnameRowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/stok-opname');
  }, [router]);

  const tarik = useCallback(async () => {
    if (!doc || busy) return;
    setBusy(true);
    setAksiErr('');
    try {
      applyDoc(await tarikSaldo(doc.id));
    } catch (e) {
      setAksiErr(messageOf(e, 'Gagal menarik saldo.'));
    } finally {
      setBusy(false);
    }
  }, [doc, busy, applyDoc]);

  /**
   * Saves one line. `null` is sent explicitly — it is a real value meaning
   * "un-count this", not an omission — and the server recomputes both difference
   * columns from it, so nothing is guessed locally.
   */
  const simpanBaris = useCallback(
    async (line: OpnameLine, stokSo: number | null) => {
      if (!doc) return;
      if (stokSo === line.stokSo) return;
      try {
        applyDoc(await isiBarisOpname(doc.id, line.id, { stok_so: stokSo }));
        setAksiErr('');
      } catch (e) {
        // Reported at the top of the list rather than under the row: the row
        // re-renders from `doc`, which still holds the server's value, so the
        // field visibly snaps back to what was actually saved.
        setAksiErr(messageOf(e, `Gagal menyimpan hitungan ${line.nama}.`));
      }
    },
    [doc, applyDoc]
  );

  const konfirmasiAksi = useCallback(async () => {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim().length < 4) {
      setAksiErr('Alasannya wajib diisi.');
      return;
    }
    setBusy(true);
    setAksiErr('');
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      applyDoc(saved);
      setAksi(null);
      setAlasan('');
    } catch (e) {
      setAksiErr(messageOf(e, 'Gagal menjalankan aksi.'));
    } finally {
      setBusy(false);
    }
  }, [doc, aksi, alasan, busy, applyDoc]);

  /**
   * Search filters the loaded lines, and that is honest here in a way it would
   * not be on a paged list: `GET /stok-opname/{id}` returns **every** line in
   * one response — there is no paging on the detail at all — so what is filtered
   * is the whole document, not a page of it.
   */
  const lines = useMemo(() => {
    const all = doc?.lines ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (l) => l.nama.toLowerCase().includes(q) || l.kode.toLowerCase().includes(q)
    );
  }, [doc?.lines, query]);

  if (loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Hitung fisik" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Dokumen tidak ditemukan</Text>
          <Text style={styles.centerSub}>{loadErr}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali ke daftar" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Hitung fisik" onBack={goBack} />
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={C.brand} />
          ) : (
            <RamahInlineError message="Dokumen tidak terbaca." onRetry={reload} />
          )}
        </View>
      </View>
    );
  }

  const meta = DOKUMEN_RAMAH[doc.status];
  const isDraft = doc.status === 'DRAFT';
  const bolehIsi = canWrite && isDraft;
  const beku = doc.status === 'DRAFT' || doc.status === 'DIAJUKAN';
  const sudah = doc.jumlahBaris - doc.jumlahBelumDihitung;

  /**
   * The transitions this status and this grant can actually run, with the
   * destructive ones sorted to the end.
   *
   * The table is declared in flow order, which is not button order: on a
   * `DIAJUKAN` document a supervisor's row order is [tolak, posting, batal], so
   * the first control — and the green pill — would be *reject*. A stable sort
   * keeps the table documenting the flow rather than one screen's dock.
   */
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    // Stable: within each group the table's own order survives, so the flow
    // stays documented where it is declared rather than reordered here.
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map((x) => x.a);

  return (
    <View style={styles.screen}>
      <RamahHeader title={doc.nomor || 'Hitung fisik'} onBack={goBack} />

      <FlatList
        data={lines}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item, index }) => (
          <BarisHitung
            line={item}
            first={index === 0}
            last={index === lines.length - 1}
            editable={bolehIsi}
            onSave={(v) => simpanBaris(item, v)}
          />
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.identity}>
              <View style={styles.identityHead}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {doc.namaRuang || `Ruang #${doc.idRuang}`}
                </Text>
                <RamahBadge label={meta.label} tone={meta.tone} />
              </View>
              <Text style={styles.identitySub}>
                {`Dibuka ${formatTanggal(doc.tglBuka)}${
                  doc.tglTutup ? ` · ditutup ${formatTanggal(doc.tglTutup)}` : ''
                }`}
              </Text>
              {doc.uraian ? <Text style={styles.uraian}>{doc.uraian}</Text> : null}
            </View>

            {beku ? <RamahNote icon="lock">Gudang dikunci selama opname.</RamahNote> : null}

            {doc.status === 'BATAL' && doc.alasanBatal ? (
              <RamahNote icon="x-circle">{`Dibatalkan: ${doc.alasanBatal}`}</RamahNote>
            ) : null}

            {aksiErr ? <RamahInlineError message={aksiErr} /> : null}

            {doc.jumlahBaris === 0 ? (
              <EmptyLines editable={bolehIsi} busy={busy} onTarik={tarik} />
            ) : (
              <>
                <Progress sudah={sudah} total={doc.jumlahBaris} />
                <RamahSearchField
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Cari nama atau kode barang"
                />
                <View style={styles.groupStart}>
                  <RamahSectionHeader>
                    {query ? `${lines.length} dari ${doc.jumlahBaris} baris` : 'Baris hitung'}
                  </RamahSectionHeader>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          doc.jumlahBaris === 0 ? null : (
            <View style={styles.placeholder}>
              <RamahEmptySearch sub="Coba kata kunci lain, atau kosongkan pencariannya." />
            </View>
          )
        }
        ListFooterComponent={
          doc.jumlahBelumDihitung > 0 && doc.jumlahBaris > 0 ? (
            <View style={styles.footNote}>
              <RamahNote icon="info">
                {`${formatNumber(doc.jumlahBelumDihitung)} barang belum dihitung.`}
              </RamahNote>
            </View>
          ) : null
        }
      />

      {/* One solid pill at most, which is guide §6 — the first transition gets it
          when it is not destructive, and everything else steps down to an
          outlined one. `app/penerimaan-susulan/[id].tsx` draws its dock exactly
          this way, and a document group that looks different from its neighbour
          for no reason is how two vocabularies start. */}
      {aksiList.length ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          {aksiList.map((a, i) => {
            const open = () => {
              setAlasan('');
              setAksiErr('');
              setAksi(a);
            };
            // `key` carries `dari` as well: `batal` is declared once per origin
            // status in this module's table, which is unique to it.
            return i === 0 && !a.danger ? (
              <RamahPrimaryButton
                key={`${a.key}-${a.dari}`}
                label={a.label}
                onPress={open}
                disabled={busy}
              />
            ) : (
              <RamahSecondaryButton
                key={`${a.key}-${a.dari}`}
                label={a.label}
                fullWidth
                height={L.controlH}
                onPress={open}
                disabled={busy}
              />
            );
          })}
        </View>
      ) : null}

      <AksiDialog
        aksi={aksi}
        alasan={alasan}
        onChangeAlasan={setAlasan}
        error={aksiErr}
        onCancel={() => {
          setAksi(null);
          setAlasan('');
        }}
        onConfirm={konfirmasiAksi}
        busy={busy}
      />
    </View>
  );
}

/**
 * A document with no lines yet.
 *
 * `tarik-saldo` is the ordinary first move and it is drawn as the only thing on
 * screen, because there is nothing else to do here until it has run. It may be
 * run **once** — a document that already has lines answers 409 — which is why
 * this block disappears entirely afterwards rather than staying as a button
 * somebody could press again.
 */
function EmptyLines({
  editable,
  busy,
  onTarik,
}: {
  editable: boolean;
  busy: boolean;
  onTarik: () => void;
}) {
  if (!editable) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Sesi ini belum punya baris hitung.</Text>
      </View>
    );
  }
  return (
    <View style={styles.tarikCard}>
      <Text style={styles.tarikTitle}>Belum ada baris</Text>
      <Text style={styles.tarikText}>
        Tarik saldo mengisi satu baris untuk setiap barang yang pernah bergerak di gudang ini,
        dengan saldo sistem dibekukan sebagai pembanding. Hanya bisa sekali.
      </Text>
      <RamahSecondaryButton
        label="Tarik saldo gudang"
        icon="download"
        onPress={onTarik}
        disabled={busy}
        fullWidth
        height={44}
      />
    </View>
  );
}

function Progress({ sudah, total }: { sudah: number; total: number }) {
  const pct = total > 0 ? Math.round((sudah / total) * 100) : 0;
  return (
    <View style={styles.progress}>
      {/* Guide §3: the label sits above the value and never beside it, and the
          figure is `--text-title` — never toned. */}
      <Text style={styles.progressLabel}>Sudah dihitung</Text>
      <Text style={styles.progressValue}>{`${formatNumber(sudah)} / ${formatNumber(total)}`}</Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

/**
 * One line of the count.
 *
 * The field holds its own text while it is being typed and commits on blur or
 * return — a save per keystroke would post 1, then 12, then 120 for "120", and
 * the two intermediate differences are ones somebody would have to explain. It
 * re-seeds from the server's value whenever that changes, so a failed save
 * visibly snaps back rather than leaving a number on screen that was never
 * stored.
 */
function BarisHitung({
  line,
  first,
  last,
  editable,
  onSave,
}: {
  line: OpnameLine;
  first: boolean;
  last: boolean;
  editable: boolean;
  onSave: (stokSo: number | null) => void;
}) {
  const tersimpan = line.stokSo === null ? '' : String(line.stokSo);
  const [teks, setTeks] = useState(tersimpan);
  /**
   * Re-seeding is done by comparing against the last server value seen rather
   * than in an effect: a `setState` in an effect body is the cascading render
   * `react-hooks/set-state-in-effect` refuses, and adjusting state when a prop
   * changes is something React does during render.
   */
  const [seed, setSeed] = useState(tersimpan);
  if (seed !== tersimpan) {
    setSeed(tersimpan);
    setTeks(tersimpan);
  }

  const selisih = line.selisihLebih - line.selisihKurang;
  const belum = line.stokSo === null;

  const commit = () => {
    const bersih = teks.replace(/[^0-9]/g, '');
    // Empty is `null` — "not counted" — and not zero. A shelf that really is
    // empty is typed as `0`, which is a different fact and posts a deficit.
    onSave(bersih === '' ? null : Number(bersih));
  };

  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <View style={styles.baris}>
        <View style={styles.barisHead}>
          <View style={styles.grow}>
            <Text style={styles.barisNama} numberOfLines={2}>
              {line.nama}
            </Text>
            <Text style={styles.barisSub} numberOfLines={1}>
              {`Sistem ${formatNumber(line.stokAwal)} ${line.namaSatuanDasar}`}
            </Text>
          </View>
          <TextInput
            value={teks}
            onChangeText={(v) => setTeks(v.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onSubmitEditing={commit}
            editable={editable}
            inputMode="numeric"
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            // Deliberately not "0": an empty box has to read as a question that
            // has not been answered, which is exactly what null means here.
            placeholder="—"
            placeholderTextColor={C.textMuted}
            accessibilityLabel={`Hasil hitung ${line.nama}, sistem mencatat ${line.stokAwal}`}
            style={[styles.input, !editable && styles.inputLocked]}
          />
        </View>
        {belum ? null : (
          <View style={styles.selisihRow}>
            <Feather
              name={selisih === 0 ? 'check' : selisih > 0 ? 'trending-up' : 'trending-down'}
              size={RamahIcon.counter}
              color={selisih === 0 ? C.brandInk : selisih > 0 ? C.accentBlueInk : C.orange600}
            />
            <Text
              style={[
                styles.selisihText,
                selisih > 0 && styles.selisihLebih,
                selisih < 0 && styles.selisihKurang,
              ]}>
              {selisih === 0
                ? 'Cocok dengan catatan'
                : selisih > 0
                  ? `Lebih ${formatNumber(selisih)} ${line.namaSatuanDasar}`
                  : `Kurang ${formatNumber(-selisih)} ${line.namaSatuanDasar}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  // `related` under the controls, because the last of them is the heading of
  // the rows that follow.
  controls: { gap: L.stack, paddingBottom: L.related },
  // The heading opens the rows' group: `group` above it with the column's gap.
  groupStart: { paddingTop: L.group - L.stack },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: L.space6,
    gap: L.space2,
  },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.inline, paddingVertical: L.space2 },
  identityHead: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  identityName: { ...T.titleModerate, color: C.textTitle, flex: 1, minWidth: 0 },
  identitySub: { ...T.bodySmall, color: C.textBody },
  uraian: { ...T.bodySmall, color: C.textBody, paddingTop: L.space1 },

  tarikCard: {
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    gap: L.space3,
  },
  tarikTitle: { ...T.titleTiny, color: C.textTitle },
  tarikText: { ...T.bodySmall, color: C.textBody },

  progress: {
    padding: L.cardPad,
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    gap: L.space1,
  },
  progressLabel: { ...T.caption, color: C.textBody },
  progressValue: { ...T.titleLarge, color: C.textTitle },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.grey200,
    overflow: 'hidden',
    marginTop: L.space2,
  },
  barFill: { height: 4, borderRadius: 2, backgroundColor: C.brand },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  baris: { padding: L.cardPad, gap: L.space2 },
  barisHead: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  barisNama: { ...T.titleTiny, color: C.textTitle },
  barisSub: { ...T.bodySmall, color: C.textBody },
  input: {
    width: 88,
    height: 48,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: R.field,
    backgroundColor: C.surfacePage,
    textAlign: 'center',
    color: C.textTitle,
    ...T.titleSmall,
    paddingVertical: 0,
  },
  inputLocked: { backgroundColor: C.grey100, color: C.textBody },

  selisihRow: { flexDirection: 'row', alignItems: 'center', gap: L.related },
  selisihText: { ...T.bodySmall, color: C.brandInk },
  selisihLebih: { color: C.accentBlueInk },
  selisihKurang: { color: C.textWarning },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footNote: { paddingTop: L.space4 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.space2,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
