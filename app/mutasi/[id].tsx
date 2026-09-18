/**
 * Mutasi — one document, at every status.
 *
 * ## Two buttons, one person
 *
 * `posting` and `batal` are both `SUPERADMIN`'s, and there is nothing between
 * `DRAFT` and `POSTED` for anybody else to press. So a gudang grant opening its
 * own draft sees the edit icons and a sentence saying who posts it, and nothing
 * pretending to be a submit button: there is no endpoint behind one.
 *
 * ## A frozen room is said before posting, not after
 *
 * Posting writes into **both** rooms, and the `kartu_stok` trigger refuses a
 * room with an open stok opname. A room can freeze after the draft was written,
 * so this screen reads `GET /ruang` too and names the freezing document above the
 * dock. The destination may be in a unit this grant cannot list; then nothing is
 * said, because nothing is known, and the server's refusal carries its own reason.
 *
 * ## Editing
 *
 * `DRAFT` only, both halves. The header — date, both rooms, note — edits in a
 * sheet; the room lists are drawn inside it rather than in a second sheet over
 * the first. The lines edit in place because `PUT .../detail` replaces the whole
 * set, and opening that editor reads each product's balance in the source room
 * so the cap is printed before anything is typed.
 *
 * Once posted, the stat card shows the value that moved — Σ `qty_dasar ×
 * harga_pokok`, copied from the outgoing `kartu_stok` rows. Before posting that
 * number does not exist anywhere, so nothing stands in for it.
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
  BarisBarangEditor,
  barisDari,
  barisKosong,
  barisToInput,
  BarisTerbaca,
  lengkapiBaris,
  terapkanLengkap,
  type BarisDraft,
} from '@/components/shell/baris-barang';
import { DaftarRuangPilihan, useDaftarRuang } from '@/components/shell/pilih-ruang';
import {
  RamahBadge,
  RamahBarrierCard,
  RamahField,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahStackCard,
  RamahStatCard,
  RamahSummaryCard,
  RamahTertiaryButton,
} from '@/components/shell/ramah';
import { DOKUMEN_RAMAH } from '@/components/shell/status-dokumen';
import { formatNumber, formatRupiah, formatTanggal } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import type { AksiDokumen } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { formatDesimal } from '@/services/decimal';
import {
  aksiTersedia,
  getMutasi,
  jalankanAksi,
  mutasiBus,
  mutasiRowOf,
  nilaiMutasi,
  replaceMutasiDetail,
  updateMutasi,
  type MutasiDoc,
} from '@/services/mutasi';
import { useActiveRole, useCanWrite } from '@/services/permissions';

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HeaderDraft {
  tanggal: string;
  asal: number;
  tujuan: number;
  keterangan: string;
}

export default function MutasiDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);
  // A malformed `:id` is known the moment the params arrive — derived, not stored.
  const idValid = Number.isFinite(id) && id > 0;

  const canWrite = useCanWrite('mutasi');
  const role = useActiveRole();
  const daftar = useDaftarRuang();

  const [doc, setDoc] = useState<MutasiDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loadedId, setLoadedId] = useState(0);
  const loading = idValid && loadedId !== id;
  /**
   * Bumped by pull-to-refresh. `refreshing` tracks it against `loadedToken`
   * rather than `loading`, which is keyed on `id` alone and would never
   * disagree while pulling on the same document.
   */
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedToken, setLoadedToken] = useState(-1);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const [header, setHeader] = useState<HeaderDraft | null>(null);
  const [headerErr, setHeaderErr] = useState('');

  const [lines, setLines] = useState<BarisDraft[] | null>(null);
  const [linesErr, setLinesErr] = useState('');

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  // Read once on the way in — safe on a pushed route, which is mounted fresh.
  const announceCreated = useRef(params.baru === '1');

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getMutasi(id)
      .then((current) => {
        if (!alive) return;
        setDoc(current);
        setLoadErr('');
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(`Tersimpan sebagai draf ${current.nomor}. Stok belum berpindah.`);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setDoc(null);
        // A source room outside the unit kerja answers 404, like an unknown id.
        setLoadErr(messageOf(e, 'Gagal memuat mutasi.'));
      })
      .finally(() => {
        if (alive) {
          setLoadedId(id);
          setLoadedToken(reloadToken);
        }
      });
    return () => {
      alive = false;
    };
  }, [id, idValid, reloadToken]);

  const applyDoc = useCallback((saved: MutasiDoc, message: string) => {
    setDoc(saved);
    if (message) setKabar(message);
    mutasiBus.publish({ kind: 'saved', row: mutasiRowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/mutasi');
  }, [router]);

  const updateLines = useCallback((updater: (prev: BarisDraft[]) => BarisDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  async function openLineEditor() {
    if (!doc) return;
    setLinesErr('');
    const seeded = doc.lines.length ? barisDari(doc.lines) : [barisKosong()];
    setLines(seeded);
    const lengkap = await lengkapiBaris(seeded, doc.idRuangAsal);
    setLines((prev) => (prev === null ? prev : terapkanLengkap(prev, lengkap)));
  }

  async function saveHeader() {
    if (!doc || !header || busy) return;
    if (!TANGGAL_RE.test(header.tanggal)) return setHeaderErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
    if (header.asal === header.tujuan) return setHeaderErr('Gudang asal dan tujuan harus berbeda.');
    setBusy(true);
    try {
      applyDoc(
        await updateMutasi(doc.id, {
          tanggal: header.tanggal,
          id_ruang_asal: header.asal,
          id_ruang_tujuan: header.tujuan,
          keterangan: header.keterangan.trim() || null,
        }),
        'Header mutasi tersimpan'
      );
      setHeader(null);
      setHeaderErr('');
    } catch (e) {
      setHeaderErr(messageOf(e, 'Gagal menyimpan header.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    if (!doc || !lines || busy) return;
    const detail = barisToInput(lines, { minimalSatu: true, pakaiKeterangan: false });
    if (!detail.ok) return setLinesErr(detail.error);
    setBusy(true);
    try {
      applyDoc(await replaceMutasiDetail(doc.id, detail.detail), 'Barang mutasi diganti');
      setLines(null);
      setLinesErr('');
    } catch (e) {
      setLinesErr(messageOf(e, 'Gagal menyimpan barang.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAksi() {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim() === '') return setAksiErr('Alasan wajib diisi.');
    setBusy(true);
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      applyDoc(saved, pesanAksi(aksi.key, saved));
      setAksi(null);
      setAlasan('');
      setAksiErr('');
    } catch (e) {
      // The server names the blocker — a short balance with both figures, a
      // closed month, a frozen room — and no invented wording beats it.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Mutasi" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Mutasi tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat dokumen tidak dikenali.'}</Text>
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
        <RamahHeader title="Mutasi" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const meta = DOKUMEN_RAMAH[doc.status];
  const editing = lines !== null;
  const bolehUbah = canWrite && doc.status === 'DRAFT';
  const nilai = nilaiMutasi(doc);

  // Forward first, destructive last — `AKSI` is in flow order, not button order.
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);

  const beku = (idRuang: number) =>
    daftar.ruang.find((r) => r.id === idRuang)?.nomorOpnameBeku ?? null;
  const bekuAsal = doc.status === 'DRAFT' ? beku(doc.idRuangAsal) : null;
  const bekuTujuan = doc.status === 'DRAFT' ? beku(doc.idRuangTujuan) : null;

  const pilihAksi = (a: AksiDokumen) => {
    setAksi(a);
    setAlasan('');
    setAksiErr('');
  };

  return (
    <View style={styles.screen}>
      <RamahHeader
        title={doc.nomor || 'Mutasi'}
        onBack={goBack}
        right={
          bolehUbah && !editing ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah header mutasi"
                onPress={() =>
                  setHeader({
                    tanggal: doc.tanggal.slice(0, 10),
                    asal: doc.idRuangAsal,
                    tujuan: doc.idRuangTujuan,
                    keterangan: doc.keterangan,
                  })
                }
              />
              <RamahIconButton
                icon="list"
                label="Ubah barang mutasi"
                onPress={() => void openLineEditor()}
              />
            </View>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
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
              {`${doc.namaRuangAsal || '—'} → ${doc.namaRuangTujuan || '—'}`}
            </Text>
            <RamahBadge label={meta.label} tone={meta.tone} />
          </View>
          <Text style={styles.identitySub}>{formatTanggal(doc.tanggal)}</Text>
        </View>

        {doc.status === 'BATAL' && doc.alasanBatal ? (
          <RamahBarrierCard tone="danger" title="Mutasi dibatalkan" description={doc.alasanBatal} />
        ) : null}

        {nilai !== null ? (
          <View style={styles.statRow}>
            <RamahStatCard label="Nilai dipindah" value={formatRupiah(nilai)} />
            <RamahStatCard label="Barang" value={`${doc.lines.length} baris`} />
          </View>
        ) : null}

        {editing && lines ? (
          <View style={styles.group}>
            <BarisBarangEditor
              judul="Barang dipindah"
              drafts={lines}
              onChange={updateLines}
              idRuang={doc.idRuangAsal}
              pakaiKeterangan={false}
            />
            {linesErr ? <RamahInlineError message={linesErr} /> : null}
          </View>
        ) : (
          <View style={styles.group}>
            <RamahSectionHeader>Barang dipindah</RamahSectionHeader>
            {doc.lines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Belum ada barang</Text>
              </View>
            ) : (
              <RamahStackCard>
                {doc.lines.map((l) => (
                  <BarisTerbaca
                    key={l.id}
                    nama={l.nama}
                    jumlah={`${formatDesimal(l.qtyInput)} ${l.namaSatuan}`}
                    rincian={
                      l.faktor === 1 ? undefined : `${formatNumber(l.qtyDasar)} ${l.namaSatuanDasar}`
                    }
                    nilai={
                      l.hppDasar === null
                        ? undefined
                        : formatRupiah(l.qtyDasar * Number(l.hppDasar))
                    }
                  />
                ))}
              </RamahStackCard>
            )}
          </View>
        )}

        {!editing ? (
          <View style={styles.group}>
            <RamahSectionHeader>Jejak dokumen</RamahSectionHeader>
            <RamahSummaryCard rows={jejakRows(doc)} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {editing ? (
          <>
            <RamahPrimaryButton label="Simpan barang" onPress={() => void saveLines()} busy={busy} disabled={busy} />
            <RamahTertiaryButton
              label="Batal"
              height={L.controlHSm + 8}
              onPress={() => {
                setLines(null);
                setLinesErr('');
              }}
            />
          </>
        ) : (
          <>
            {bekuAsal ? (
              <RamahNote icon="lock">{`${doc.namaRuangAsal} beku oleh opname ${bekuAsal}.`}</RamahNote>
            ) : null}
            {bekuTujuan ? (
              <RamahNote icon="lock">{`${doc.namaRuangTujuan} beku oleh opname ${bekuTujuan}.`}</RamahNote>
            ) : null}
            {aksiList.length > 0 ? (
              aksiList.map((a, i) =>
                i === 0 && !a.danger ? (
                  <RamahPrimaryButton key={a.key} label={a.label} onPress={() => pilihAksi(a)} />
                ) : (
                  <RamahSecondaryButton
                    key={a.key}
                    label={a.label}
                    fullWidth
                    height={L.controlH}
                    onPress={() => pilihAksi(a)}
                  />
                )
              )
            ) : (
              <Text style={styles.noAksi}>{pesanTanpaAksi(doc.status)}</Text>
            )}
          </>
        )}
      </View>

      <RamahSheet
        visible={header !== null}
        title="Ubah header mutasi"
        onClose={() => {
          setHeader(null);
          setHeaderErr('');
        }}>
        {header ? (
          <View style={styles.sheetWrap}>
            <View style={styles.sheetBody}>
              <RamahField
                label="Tanggal"
                required
                value={header.tanggal}
                onChangeText={(v) => {
                  setHeader({ ...header, tanggal: v });
                  setHeaderErr('');
                }}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                maxLength={10}
              />
              <RamahField
                label="Keterangan"
                value={header.keterangan}
                onChangeText={(v) => setHeader({ ...header, keterangan: v })}
                placeholder="Opsional"
                multiline
                maxLength={1000}
              />
            </View>
            <Text style={styles.sheetLabel}>Gudang asal</Text>
            <DaftarRuangPilihan
              ruang={daftar.ruang}
              selectedId={header.asal}
              lain={{ id: header.tujuan, label: 'Sudah jadi gudang tujuan' }}
              terpilihLuar={{ id: doc.idRuangAsal, nama: doc.namaRuangAsal }}
              onPick={(r) => {
                setHeader({ ...header, asal: r.id });
                setHeaderErr('');
              }}
            />
            <Text style={styles.sheetLabel}>Gudang tujuan</Text>
            <DaftarRuangPilihan
              ruang={daftar.ruang}
              selectedId={header.tujuan}
              lain={{ id: header.asal, label: 'Sudah jadi gudang asal' }}
              terpilihLuar={{ id: doc.idRuangTujuan, nama: doc.namaRuangTujuan }}
              onPick={(r) => {
                setHeader({ ...header, tujuan: r.id });
                setHeaderErr('');
              }}
            />
            <View style={styles.sheetBody}>
              {headerErr ? <RamahInlineError message={headerErr} /> : null}
              <RamahPrimaryButton
                label="Simpan header"
                onPress={() => void saveHeader()}
                busy={busy}
                disabled={busy}
              />
            </View>
          </View>
        ) : null}
      </RamahSheet>

      <AksiDialog
        aksi={aksi}
        alasan={alasan}
        onChangeAlasan={(v) => {
          setAlasan(v);
          setAksiErr('');
        }}
        error={aksiErr}
        onCancel={() => {
          setAksi(null);
          setAksiErr('');
        }}
        onConfirm={() => void confirmAksi()}
        busy={busy}
      />
    </View>
  );
}

function pesanAksi(key: AksiDokumen['key'], saved: MutasiDoc): string {
  switch (key) {
    case 'posting':
      return `Diposting · ${saved.lines.length} baris pindah ke ${saved.namaRuangTujuan}.`;
    case 'batal':
      return 'Dibatalkan · baris pembalik bertanggal hari ini.';
    default:
      return `Mutasi sekarang ${DOKUMEN_RAMAH[saved.status].label}.`;
  }
}

/** Why this grant has no buttons here. */
function pesanTanpaAksi(status: MutasiDoc['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Menunggu diposting superadmin.';
    case 'POSTED':
      return 'Sudah masuk kartu stok. Hanya superadmin yang bisa membatalkannya.';
    case 'BATAL':
      return 'Mutasi batal.';
    default:
      return '';
  }
}

function jejakRows(doc: MutasiDoc): { label: string; value: string }[] {
  const rows = [{ label: 'Dibuat', value: formatTanggal(doc.createdAt) }];
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  if (doc.keterangan) rows.push({ label: 'Keterangan', value: doc.keterangan });
  return rows;
}

/**
 * No top, left or right inset: `app/mutasi/_layout.tsx` pays those. The bottom is
 * the dock's; the sheet is its own window and pays its own.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -L.space2 },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space1,
    paddingBottom: L.space6,
    gap: L.group,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.space1 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  identityName: { ...T.titleModerate, color: C.textTitle, flexShrink: 1 },
  identitySub: { ...T.bodySmall, color: C.textBody },

  statRow: { flexDirection: 'row', gap: L.stack },

  group: { gap: L.related },
  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
  },
  emptyTitle: { ...T.bodySmall, color: C.textBody },

  noAksi: { ...T.bodySmall, color: C.textMuted, textAlign: 'center', paddingVertical: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.related,
    backgroundColor: C.surfacePage,
    ...E.low,
  },

  sheetWrap: { gap: L.space4 },
  sheetBody: { paddingHorizontal: L.gutter, gap: L.space5 },
  sheetLabel: { ...T.caption, color: C.textBody, paddingHorizontal: L.gutter, paddingTop: L.space2 },
});
