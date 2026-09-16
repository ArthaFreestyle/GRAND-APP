/**
 * Permintaan pemakaian — one request, at every one of its six statuses.
 *
 * ## Approval is its own sheet, because it carries numbers
 *
 * `setujui` is not a yes/no. It decides, per line, how much may leave — a line
 * left untouched gets everything it asked for, a smaller number trims it, and
 * zero refuses that line alone. So it does not go through `AksiDialog`; it opens
 * a sheet with one base-unit field per line, prefilled with what was asked, and
 * sends only the lines that were changed (the contract's own reading of an
 * omitted line is "give it all").
 *
 * **An approval that zeroes every line is refused here, before the request.**
 * The server would accept it — and the document would then be stuck: posting
 * refuses a request with nothing to write, and a `DISETUJUI` request can be
 * neither rejected nor cancelled. The honest way to give nobody anything is
 * `tolak`, and the error says so.
 *
 * ## The requester cannot decide their own request
 *
 * `pemakaian_penyetuju_check` refuses approval by the requester, and a rejection
 * is written to the same column. `aksiTersedia` drops both buttons for that
 * person, and the dock says who has to decide instead of showing nothing.
 *
 * ## What each quantity means
 *
 * `qty_dasar` is what was asked and never changes. `qty_disetujui_dasar` is null
 * until approved and is **the only quantity posting reads**. The lines print the
 * request first and, once decided, what was allowed beside it — that difference
 * is what anybody reading an approved request is looking for.
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
  AKSI,
  aksiTersedia,
  getPemakaian,
  jalankanAksi,
  pemakaianBus,
  pemakaianRowOf,
  pemohonSendiri,
  replacePemakaianDetail,
  setujuiPemakaian,
  updatePemakaian,
  type PemakaianDoc,
  type PemakaianLine,
} from '@/services/pemakaian';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import { useSession } from '@/services/session';

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const AKSI_SETUJUI = AKSI.find((a) => a.key === 'setujui');

interface HeaderDraft {
  tanggal: string;
  ruang: number;
  keperluan: string;
}

interface SetujuDraft {
  catatan: string;
  /** Base units per line id, as typed. */
  qty: Record<number, string>;
}

/** The typed approval for one line, or why it cannot be sent. */
function bacaDisetujui(line: PemakaianLine, raw: string | undefined): number | string {
  const t = (raw ?? '').trim();
  if (!/^\d+$/.test(t)) return 'Isi bilangan bulat';
  const n = Number(t);
  if (n > line.qtyDasar) return `Paling banyak ${formatNumber(line.qtyDasar)}`;
  return n;
}

export default function PemakaianDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);
  const idValid = Number.isFinite(id) && id > 0;

  const canWrite = useCanWrite('pemakaian');
  const role = useActiveRole();
  const session = useSession();
  const idUser = session?.user?.id ?? null;
  const daftar = useDaftarRuang();

  const [doc, setDoc] = useState<PemakaianDoc | null>(null);
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

  const [setuju, setSetuju] = useState<SetujuDraft | null>(null);
  const [setujuErr, setSetujuErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  const announceCreated = useRef(params.baru === '1');

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getPemakaian(id)
      .then((current) => {
        if (!alive) return;
        setDoc(current);
        setLoadErr('');
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(`Tersimpan sebagai draf ${current.nomor}. Ajukan untuk disetujui.`);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setDoc(null);
        setLoadErr(messageOf(e, 'Gagal memuat permintaan pemakaian.'));
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

  const applyDoc = useCallback((saved: PemakaianDoc, message: string) => {
    setDoc(saved);
    if (message) setKabar(message);
    pemakaianBus.publish({ kind: 'saved', row: pemakaianRowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pemakaian');
  }, [router]);

  const updateLines = useCallback((updater: (prev: BarisDraft[]) => BarisDraft[]) => {
    setLines((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  async function openLineEditor() {
    if (!doc) return;
    setLinesErr('');
    const seeded = doc.lines.length ? barisDari(doc.lines) : [barisKosong()];
    setLines(seeded);
    const lengkap = await lengkapiBaris(seeded, doc.idRuang);
    setLines((prev) => (prev === null ? prev : terapkanLengkap(prev, lengkap)));
  }

  async function saveHeader() {
    if (!doc || !header || busy) return;
    if (!TANGGAL_RE.test(header.tanggal)) return setHeaderErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
    if (header.keperluan.trim() === '') return setHeaderErr('Isi keperluannya.');
    setBusy(true);
    try {
      applyDoc(
        await updatePemakaian(doc.id, {
          tanggal: header.tanggal,
          id_ruang: header.ruang,
          keperluan: header.keperluan.trim(),
        }),
        'Header permintaan tersimpan'
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
    const detail = barisToInput(lines, { minimalSatu: true, pakaiKeterangan: true });
    if (!detail.ok) return setLinesErr(detail.error);
    setBusy(true);
    try {
      applyDoc(await replacePemakaianDetail(doc.id, detail.detail), 'Barang permintaan diganti');
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
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetuju() {
    if (!doc || !setuju || busy) return;
    const detail: { id_detail: number; qty_disetujui_dasar: number }[] = [];
    let total = 0;
    for (const line of doc.lines) {
      const n = bacaDisetujui(line, setuju.qty[line.id]);
      if (typeof n === 'string') return setSetujuErr(`${line.nama}: ${n.toLowerCase()}.`);
      total += n;
      // An omitted line gets its full request — only the trimmed ones are sent.
      if (n !== line.qtyDasar) detail.push({ id_detail: line.id, qty_disetujui_dasar: n });
    }
    // See the file header: an all-zero approval strands the request.
    if (total === 0) return setSetujuErr('Semua baris nol. Tolak permintaannya saja.');
    setBusy(true);
    try {
      const catatan = setuju.catatan.trim();
      const saved = await setujuiPemakaian(doc.id, {
        catatan: catatan || undefined,
        detail: detail.length ? detail : undefined,
      });
      applyDoc(saved, 'Disetujui · tinggal diposting saat barangnya keluar.');
      setSetuju(null);
      setSetujuErr('');
    } catch (e) {
      setSetujuErr(messageOf(e, 'Persetujuan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Pemakaian" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Permintaan tidak ditemukan</Text>
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
        <RamahHeader title="Pemakaian" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const meta = DOKUMEN_RAMAH[doc.status];
  const editing = lines !== null;
  const bolehUbah = canWrite && doc.status === 'DRAFT';
  const sendiri = pemohonSendiri(doc, idUser);

  const aksiList = aksiTersedia(doc, role, idUser)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);

  const ruangBeku =
    doc.status === 'DRAFT' || doc.status === 'DIAJUKAN' || doc.status === 'DISETUJUI'
      ? (daftar.ruang.find((r) => r.id === doc.idRuang)?.nomorOpnameBeku ?? null)
      : null;

  const pilihAksi = (a: AksiDokumen) => {
    if (a.key === 'setujui') {
      setSetuju({
        catatan: '',
        qty: Object.fromEntries(doc.lines.map((l) => [l.id, String(l.qtyDasar)])),
      });
      setSetujuErr('');
      return;
    }
    setAksi(a);
    setAlasan('');
    setAksiErr('');
  };

  return (
    <View style={styles.screen}>
      <RamahHeader
        title={doc.nomor || 'Pemakaian'}
        onBack={goBack}
        right={
          bolehUbah && !editing ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah header permintaan"
                onPress={() =>
                  setHeader({
                    tanggal: doc.tanggal.slice(0, 10),
                    ruang: doc.idRuang,
                    keperluan: doc.keperluan,
                  })
                }
              />
              <RamahIconButton
                icon="list"
                label="Ubah barang permintaan"
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
            <Text style={styles.identityName} numberOfLines={3}>
              {doc.keperluan || '—'}
            </Text>
            <RamahBadge label={meta.label} tone={meta.tone} />
          </View>
          <Text style={styles.identitySub}>
            {`${doc.namaPemohon || '—'} · ${formatTanggal(doc.tanggal)} · ${doc.namaRuang || '—'}`}
          </Text>
        </View>

        {doc.status === 'DITOLAK' ? (
          <RamahBarrierCard
            tone="danger"
            title="Permintaan ditolak"
            description={doc.catatanPersetujuan || 'Tanpa alasan tertulis.'}
          />
        ) : null}
        {doc.status === 'BATAL' && doc.alasanBatal ? (
          <RamahBarrierCard tone="danger" title="Pemakaian dibatalkan" description={doc.alasanBatal} />
        ) : null}

        {doc.totalHpp !== null ? (
          <View style={styles.statRow}>
            <RamahStatCard label="Nilai dipakai" value={formatRupiah(doc.totalHpp)} />
            <RamahStatCard label="Barang" value={`${doc.lines.length} baris`} />
          </View>
        ) : null}

        {editing && lines ? (
          <View style={styles.group}>
            <BarisBarangEditor
              judul="Barang diminta"
              drafts={lines}
              onChange={updateLines}
              idRuang={doc.idRuang}
              pakaiKeterangan
            />
            {linesErr ? <RamahInlineError message={linesErr} /> : null}
          </View>
        ) : (
          <View style={styles.group}>
            <RamahSectionHeader>Barang diminta</RamahSectionHeader>
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
                    jumlah={`${l.qtyDisetujuiDasar === null ? '' : 'diminta '}${formatDesimal(l.qtyInput)} ${l.namaSatuan}`}
                    rincian={rincianBaris(l)}
                    nilai={l.hppTotal === null ? undefined : formatRupiah(l.hppTotal)}
                    catatan={l.keterangan || undefined}
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
            <RamahPrimaryButton
              label="Simpan barang"
              onPress={() => void saveLines()}
              busy={busy}
              disabled={busy}
            />
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
            {ruangBeku ? (
              <RamahNote icon="lock">{`${doc.namaRuang} beku oleh opname ${ruangBeku}.`}</RamahNote>
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
              <Text style={styles.noAksi}>
                {pesanTanpaAksi(doc.status, sendiri && role === 'SUPERADMIN')}
              </Text>
            )}
          </>
        )}
      </View>

      <RamahSheet
        visible={header !== null}
        title="Ubah header permintaan"
        onClose={() => {
          setHeader(null);
          setHeaderErr('');
        }}>
        {header ? (
          <View style={styles.sheetWrap}>
            <View style={styles.sheetBody}>
              <RamahField
                label="Keperluan"
                required
                value={header.keperluan}
                onChangeText={(v) => {
                  setHeader({ ...header, keperluan: v });
                  setHeaderErr('');
                }}
                multiline
                maxLength={1000}
              />
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
            </View>
            <Text style={styles.sheetLabel}>Gudang</Text>
            <DaftarRuangPilihan
              ruang={daftar.ruang}
              selectedId={header.ruang}
              terpilihLuar={{ id: doc.idRuang, nama: doc.namaRuang }}
              onPick={(r) => setHeader({ ...header, ruang: r.id })}
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

      <RamahSheet
        visible={setuju !== null}
        title={AKSI_SETUJUI?.judul ?? 'Setujui permintaan'}
        onClose={() => {
          setSetuju(null);
          setSetujuErr('');
        }}>
        {setuju ? (
          <View style={styles.sheetBody}>
            <Text style={styles.penjelasan}>{AKSI_SETUJUI?.penjelasan}</Text>
            {doc.lines.map((l) => {
              const n = bacaDisetujui(l, setuju.qty[l.id]);
              return (
                <RamahField
                  key={l.id}
                  label={l.nama}
                  value={setuju.qty[l.id] ?? ''}
                  onChangeText={(v) => {
                    setSetuju({ ...setuju, qty: { ...setuju.qty, [l.id]: v } });
                    setSetujuErr('');
                  }}
                  keyboardType="number-pad"
                  trailing={<Text style={styles.satuanDasar}>{l.namaSatuanDasar}</Text>}
                  error={typeof n === 'string' ? n : undefined}
                  helper={
                    n === 0
                      ? 'Baris ini ditolak'
                      : `Diminta ${formatNumber(l.qtyDasar)} ${l.namaSatuanDasar}`
                  }
                />
              );
            })}
            <RamahField
              label="Catatan"
              value={setuju.catatan}
              onChangeText={(v) => setSetuju({ ...setuju, catatan: v })}
              placeholder="Opsional"
              multiline
              maxLength={1000}
            />
            {setujuErr ? <RamahInlineError message={setujuErr} /> : null}
            <RamahPrimaryButton
              label={AKSI_SETUJUI?.label ?? 'Setujui'}
              onPress={() => void confirmSetuju()}
              busy={busy}
              disabled={busy}
            />
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

/** What was decided about one line, once anything was. */
function rincianBaris(l: PemakaianLine): string | undefined {
  if (l.qtyDisetujuiDasar === null) {
    return l.faktor === 1 ? undefined : `${formatNumber(l.qtyDasar)} ${l.namaSatuanDasar}`;
  }
  if (l.qtyDisetujuiDasar === 0) return 'tidak disetujui';
  return `disetujui ${formatNumber(l.qtyDisetujuiDasar)} ${l.namaSatuanDasar}`;
}

function pesanAksi(key: AksiDokumen['key'], saved: PemakaianDoc): string {
  switch (key) {
    case 'ajukan':
      return 'Diajukan · isinya terkunci sampai diputuskan.';
    case 'tolak':
      return 'Ditolak · permintaan ini selesai di sini.';
    case 'posting':
      return `Diposting · barang keluar dari ${saved.namaRuang}.`;
    case 'batal':
      return 'Dibatalkan · barangnya masuk lagi ke gudang.';
    default:
      return `Permintaan sekarang ${DOKUMEN_RAMAH[saved.status].label}.`;
  }
}

/** Why this reader has no buttons here — including the one reason that is about the person. */
function pesanTanpaAksi(status: PemakaianDoc['status'], pemohonSuperadmin: boolean): string {
  switch (status) {
    case 'DRAFT':
      return 'Draf ini menunggu diajukan.';
    case 'DIAJUKAN':
      return pemohonSuperadmin
        ? 'Permintaan Anda sendiri — harus diputuskan superadmin lain.'
        : 'Menunggu disetujui atau ditolak superadmin.';
    case 'DISETUJUI':
      return 'Menunggu diposting superadmin saat barangnya keluar.';
    case 'POSTED':
      return 'Sudah masuk kartu stok. Hanya superadmin yang bisa membatalkannya.';
    case 'DITOLAK':
      return 'Permintaan ditolak. Buat permintaan baru kalau barangnya masih dibutuhkan.';
    case 'BATAL':
      return 'Pemakaian batal.';
    default:
      return '';
  }
}

function jejakRows(doc: PemakaianDoc): { label: string; value: string }[] {
  const rows = [
    { label: 'Pemohon', value: doc.namaPemohon || '—' },
    { label: 'Dibuat', value: formatTanggal(doc.createdAt) },
  ];
  if (doc.tsDisetujui) {
    rows.push({
      label: doc.status === 'DITOLAK' ? 'Ditolak' : 'Disetujui',
      value: formatTanggal(doc.tsDisetujui),
    });
  }
  // A rejection's reason is already the barrier card; repeating it here is noise.
  if (doc.catatanPersetujuan && doc.status !== 'DITOLAK') {
    rows.push({ label: 'Catatan persetujuan', value: doc.catatanPersetujuan });
  }
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  return rows;
}

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
  penjelasan: { ...T.bodyModerate, color: C.textBody },
  satuanDasar: { ...T.bodySmall, color: C.textBody },
});
