/**
 * Saldo awal — one document, at every status.
 *
 * ## The fence is said before the button, not after the 409
 *
 * The rule that shapes this module is not its flow (that is `pembelian`'s, on
 * purpose) but its fence: **one `(barang, ruang)` for life**, and cancelling from
 * `POSTED` closes that door for good — the correction is a `stok_opname`. Both
 * halves are written in `AKSI` in `services/saldo-awal.ts`, and `AksiDialog`
 * prints them in the confirmation *before* it can be pressed. What the server
 * answers instead — a 409 naming the `kode_barang`, a 400 for a closed period, a
 * 409 for a room frozen by an opname — is shown as it came, through `messageOf`,
 * never summarised into "gagal".
 *
 * ## The whole page is one `FlatList`
 *
 * A migration can carry 500 SKUs, and a `ScrollView` would mount every row and
 * keep them. Identity, cards and the audit trail are the list's header and footer;
 * the rows are its data, and they are either the saved lines (reading) or the
 * draft (editing) — never both.
 *
 * `nilai_masuk` on a saved line is the server's figure, `qty × harga` rounded
 * once. The editor's preview is only ever a preview.
 *
 * Who runs what: `INVENTARIS` types and submits, `SUPERADMIN` posts, rejects and
 * cancels. A transition the grant cannot run is not rendered. `?baru=1` says the
 * draft was just created and opens the line editor, because an empty draft has
 * only one thing left to do; it is read once, safe on a pushed route.
 */
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  barisKosong,
  BarisEditorRow,
  barisToInput,
  draftOfLine,
  formatUang,
  isiProduk,
  MAKS_BARIS,
  PilihProdukSheet,
  PilihSatuanSheet,
  previewTotal,
  type BarisDraft,
} from '@/components/saldo-awal/baris';
import { AksiDialog } from '@/components/shell/aksi-dialog';
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
  RamahStatCard,
  RamahSummaryCard,
  RamahTertiaryButton,
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
import type { AksiDokumen } from '@/services/alur-dokumen';
import { messageOf } from '@/services/api';
import { formatDesimal } from '@/services/decimal';
import { useActiveRole, useCanWrite } from '@/services/permissions';
import {
  aksiTersedia,
  getSaldoAwal,
  jalankanAksi,
  replaceSaldoAwalDetail,
  saldoAwalBus,
  saldoAwalRowOf,
  updateSaldoAwal,
  type SaldoAwalDoc,
  type SaldoAwalLine,
} from '@/services/saldo-awal';

type Item =
  | { kind: 'edit'; row: BarisDraft; index: number }
  | { kind: 'view'; line: SaldoAwalLine; first: boolean; last: boolean };

export default function SaldoAwalDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const params = useLocalSearchParams<{ id: string; baru?: string }>();
  const id = Number(params.id);

  const canWrite = useCanWrite('saldo-awal');
  const role = useActiveRole();

  // A malformed `:id` is a fact about the route, known when the params arrive.
  const idValid = Number.isFinite(id) && id > 0;

  const [doc, setDoc] = useState<SaldoAwalDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  // Loading is derived from the id wanted against the id loaded.
  const [loadedId, setLoadedId] = useState(0);
  const loading = idValid && loadedId !== id;
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedToken, setLoadedToken] = useState(-1);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  /** The header sheet. `null` means it is closed. */
  const [header, setHeader] = useState<{ tanggal: string; alasan: string } | null>(null);
  const [headerErr, setHeaderErr] = useState('');

  /** `null` means the lines are not being edited. */
  const [rows, setRows] = useState<BarisDraft[] | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [linesErr, setLinesErr] = useState('');
  const [produkUntuk, setProdukUntuk] = useState<string | null>(null);
  const [satuanUntuk, setSatuanUntuk] = useState<string | null>(null);

  const [aksi, setAksi] = useState<AksiDokumen | null>(null);
  const [alasan, setAlasan] = useState('');
  const [aksiErr, setAksiErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState('');

  // Read once, on the way in — safe on a pushed route, which is mounted fresh.
  const announceCreated = useRef(params.baru === '1');

  useEffect(() => {
    if (!idValid) return;
    let alive = true;
    getSaldoAwal(id)
      .then((current) => {
        if (!alive) return;
        setDoc(current);
        setLoadErr('');
        if (announceCreated.current) {
          announceCreated.current = false;
          setKabar(`Draf ${current.nomor} dibuat. Belum menyentuh stok — isi barisnya, lalu ajukan.`);
          if (current.status === 'DRAFT' && current.lines.length === 0) setRows([barisKosong()]);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setDoc(null);
        // A document in a room outside the active unit kerja answers 404, like
        // one that never existed — and reached cold there is no list to toast over.
        setLoadErr(messageOf(e, 'Gagal memuat dokumen saldo awal.'));
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

  /** Every write answers with the whole document, so this is the only sync needed. */
  const applyDoc = useCallback((saved: SaldoAwalDoc, message: string) => {
    setDoc(saved);
    if (message) setKabar(message);
    saldoAwalBus.publish({ kind: 'saved', row: saldoAwalRowOf(saved) });
  }, []);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/saldo-awal');
  }, [router]);

  // ---- line editor ----

  const ubahBaris = useCallback((key: string, next: Partial<BarisDraft>) => {
    setRows((prev) => (prev === null ? prev : prev.map((r) => (r.key === key ? { ...r, ...next } : r))));
    setRowErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const hapusBaris = useCallback((key: string) => {
    setRows((prev) => (prev === null ? prev : prev.filter((r) => r.key !== key)));
  }, []);

  const bukaProduk = useCallback((key: string) => setProdukUntuk(key), []);
  const bukaSatuan = useCallback((key: string) => setSatuanUntuk(key), []);

  async function simpanBaris() {
    if (!doc || !rows || busy) return;
    const built = barisToInput(rows);
    if (!built.ok) {
      setRowErrors(built.errors);
      setLinesErr(built.error);
      return;
    }
    setBusy(true);
    try {
      applyDoc(await replaceSaldoAwalDetail(doc.id, built.detail), 'Baris dokumen diganti');
      setRows(null);
      setRowErrors({});
      setLinesErr('');
    } catch (e) {
      // 409 names the `kode_barang`, the room and `stok_opname` as the way out.
      setLinesErr(messageOf(e, 'Gagal menyimpan baris.'));
    } finally {
      setBusy(false);
    }
  }

  async function simpanHeader() {
    if (!doc || !header || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(header.tanggal)) {
      setHeaderErr('Tulis tanggalnya sebagai YYYY-MM-DD.');
      return;
    }
    if (header.alasan.trim() === '') {
      setHeaderErr('Alasan tidak boleh kosong.');
      return;
    }
    setBusy(true);
    try {
      applyDoc(
        await updateSaldoAwal(doc.id, { tanggal: header.tanggal, alasan: header.alasan.trim() }),
        'Header dokumen tersimpan'
      );
      setHeader(null);
      setHeaderErr('');
    } catch (e) {
      setHeaderErr(messageOf(e, 'Gagal menyimpan header.'));
    } finally {
      setBusy(false);
    }
  }

  async function konfirmasiAksi() {
    if (!doc || !aksi || busy) return;
    if (aksi.alasanField && alasan.trim() === '') {
      setAksiErr('Alasan wajib diisi.');
      return;
    }
    if (aksi.key === 'ajukan' && doc.lines.length === 0) {
      setAksiErr('Tambahkan minimal satu baris dulu.');
      return;
    }
    setBusy(true);
    try {
      const saved = await jalankanAksi(doc.id, aksi, alasan.trim());
      applyDoc(saved, pesanAksi(aksi, saved));
      setAksi(null);
      setAlasan('');
      setAksiErr('');
    } catch (e) {
      // The server names the actual blocker — a closed period, a room frozen by
      // an opname, a product that left the catalogue, goods already issued — and
      // no invented wording beats it. `AksiDialog` links a closed period.
      setAksiErr(messageOf(e, 'Tindakan ditolak server.'));
    } finally {
      setBusy(false);
    }
  }

  const bukaKartuStok = useCallback(
    (idProduct: number, idRuang: number) => {
      // The document's own room travels with the push, so the ledger opens on
      // the shelf this document wrote — whose first row is this one.
      router.push({ pathname: '/produk/[id]', params: { id: idProduct, ruang: idRuang } });
    },
    [router]
  );

  const mulaiUbahBaris = useCallback(() => {
    if (!doc) return;
    setRows(doc.lines.length > 0 ? doc.lines.map(draftOfLine) : [barisKosong()]);
    setRowErrors({});
    setLinesErr('');
  }, [doc]);

  // ---- failure and loading pages ----

  if (!idValid || (!loading && !doc)) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Saldo awal" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Dokumen tidak ditemukan</Text>
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
        <RamahHeader title="Saldo awal" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const meta = DOKUMEN_RAMAH[doc.status];
  const editing = rows !== null;
  const bolehUbah = canWrite && doc.status === 'DRAFT';
  const posted = doc.status === 'POSTED';

  // Forward transitions first: `AKSI` is in flow order, and a supervisor on a
  // `DIAJUKAN` document would otherwise get *reject* as the green pill.
  const aksiList = aksiTersedia(doc.status, role)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(x.a.danger) - Number(y.a.danger) || x.i - y.i)
    .map(({ a }) => a);

  const items: Item[] = editing
    ? rows.map((row, index) => ({ kind: 'edit', row, index }))
    : doc.lines.map((line, i) => ({
        kind: 'view',
        line,
        first: i === 0,
        last: i === doc.lines.length - 1,
      }));

  const barisSheet = rows?.find((r) => r.key === satuanUntuk) ?? null;

  return (
    <View style={styles.screen}>
      <RamahHeader
        title={doc.nomor || 'Saldo awal'}
        onBack={goBack}
        right={
          bolehUbah && !editing ? (
            <View style={styles.headerActions}>
              <RamahIconButton
                icon="edit-2"
                label="Ubah header dokumen"
                onPress={() =>
                  setHeader({ tanggal: doc.tanggal.slice(0, 10), alasan: doc.alasan })
                }
              />
              <RamahIconButton icon="list" label="Ubah baris" onPress={mulaiUbahBaris} />
            </View>
          ) : undefined
        }
      />

      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'edit' ? it.row.key : String(it.line.id))}
        renderItem={({ item }) =>
          item.kind === 'edit' ? (
            <View style={styles.editRow}>
              <BarisEditorRow
                index={item.index}
                baris={item.row}
                error={rowErrors[item.row.key]}
                onProduk={bukaProduk}
                onSatuan={bukaSatuan}
                onUbah={ubahBaris}
                onHapus={hapusBaris}
              />
            </View>
          ) : (
            <BarisTerbaca
              line={item.line}
              first={item.first}
              last={item.last}
              onPress={
                // Only once posted is there a movement to look at; on a draft the
                // ledger would open on a chain this document is not in yet.
                posted ? () => bukaKartuStok(item.line.idProduct, doc.idRuang) : undefined
              }
            />
          )
        }
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
        }
        ListHeaderComponent={
          <View style={styles.head}>
            {kabar ? <RamahNote icon="check-circle">{kabar}</RamahNote> : null}

            <View style={styles.identity}>
              <View style={styles.identityTop}>
                <Text style={styles.identityName} numberOfLines={2}>
                  {doc.namaRuang || `Ruang #${doc.idRuang}`}
                </Text>
                <RamahBadge label={meta.label} tone={meta.tone} />
              </View>
              <Text style={styles.identitySub}>{`Cutover ${formatTanggal(doc.tanggal)}`}</Text>
            </View>

            {doc.status === 'DRAFT' && doc.alasanTolak ? (
              <RamahBarrierCard
                tone="danger"
                title="Pengajuan sebelumnya ditolak"
                description={doc.alasanTolak}
              />
            ) : null}
            {doc.status === 'BATAL' && doc.alasanBatal ? (
              <RamahBarrierCard tone="danger" title="Dokumen dibatalkan" description={doc.alasanBatal} />
            ) : null}

            <View style={styles.statRow}>
              <RamahStatCard
                label="Nilai persediaan"
                // Null until posted, drawn as no figure — never "Rp 0".
                value={doc.totalNilai === null ? '—' : formatUang(doc.totalNilai)}
                note={posted ? 'Sudah masuk kartu stok' : 'Terisi saat diposting'}
              />
              <RamahStatCard
                label="Baris"
                value={`${editing ? rows.length : doc.lines.length} baris`}
                note={posted ? undefined : 'Belum menyentuh stok'}
              />
            </View>

            <RamahSummaryCard rows={[{ label: 'Alasan', value: doc.alasan || '—' }]} />

            <View style={styles.group}>
              <RamahSectionHeader>
                {editing ? 'Ubah baris' : posted ? 'Baris · buka kartu stok' : 'Baris'}
              </RamahSectionHeader>
              {!editing && doc.lines.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Dokumen ini belum punya baris</Text>
                  <Text style={styles.emptySub}>Draf tanpa baris ditolak saat diajukan.</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListFooterComponent={
          editing ? (
            <View style={styles.foot}>
              {rows.length < MAKS_BARIS ? (
                <View style={styles.addBar}>
                  <RamahSecondaryButton
                    label="Tambah baris"
                    icon="plus"
                    onPress={() => setRows((prev) => (prev ? [...prev, barisKosong()] : prev))}
                  />
                </View>
              ) : null}
              <RamahSummaryCard
                rows={[{ label: 'Perkiraan nilai', value: formatUang(previewTotal(rows)) }]}
              />
              <Text style={styles.editNote}>Menyimpan mengganti seluruh baris sekaligus.</Text>
              {linesErr ? <RamahInlineError message={linesErr} /> : null}
            </View>
          ) : (
            <View style={styles.foot}>
              <RamahSectionHeader>Jejak dokumen</RamahSectionHeader>
              <RamahSummaryCard rows={jejakRows(doc)} />
            </View>
          )
        }
      />

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {editing ? (
          <>
            <RamahPrimaryButton
              label="Simpan baris"
              onPress={simpanBaris}
              busy={busy}
              disabled={busy}
            />
            <RamahTertiaryButton
              label="Batal"
              height={L.controlHSm + 8}
              onPress={() => {
                setRows(null);
                setRowErrors({});
                setLinesErr('');
              }}
            />
          </>
        ) : aksiList.length > 0 ? (
          aksiList.map((a, i) => {
            const buka = () => {
              setAksi(a);
              setAlasan('');
              setAksiErr('');
            };
            return i === 0 && !a.danger ? (
              <RamahPrimaryButton key={`${a.key}-${a.dari}`} label={a.label} onPress={buka} />
            ) : (
              <RamahSecondaryButton
                key={`${a.key}-${a.dari}`}
                label={a.label}
                fullWidth
                height={L.controlH}
                onPress={buka}
              />
            );
          })
        ) : (
          <Text style={styles.noAksi}>{pesanTanpaAksi(doc.status)}</Text>
        )}
      </View>

      <PilihProdukSheet
        visible={produkUntuk !== null}
        idRuang={doc.idRuang}
        onClose={() => setProdukUntuk(null)}
        onPick={(p) => {
          const key = produkUntuk;
          setProdukUntuk(null);
          if (key === null || rows === null) return;
          // One product once per document: `saldo_awal_detail_baris_uidx` is the
          // net, this is the sentence.
          if (rows.some((r) => r.key !== key && r.idProduct === p.id)) {
            setRowErrors((prev) => ({ ...prev, [key]: `${p.nama} sudah ada di baris lain.` }));
            return;
          }
          ubahBaris(key, isiProduk(rows.find((r) => r.key === key) ?? barisKosong(), p));
        }}
      />

      <PilihSatuanSheet
        baris={barisSheet}
        onClose={() => setSatuanUntuk(null)}
        onPick={(s) => {
          if (satuanUntuk !== null) ubahBaris(satuanUntuk, { idSatuanInput: s.id, namaSatuan: s.nama });
          setSatuanUntuk(null);
        }}
      />

      {/* The header sheet: `tanggal` and `alasan`. Both are NOT NULL — they may
          change and may not be emptied. The gudang is not offered: the lines are
          checked against its catalogue, so moving it would orphan them. */}
      <RamahSheet
        visible={header !== null}
        title="Ubah header dokumen"
        onClose={() => {
          setHeader(null);
          setHeaderErr('');
        }}>
        {header ? (
          <View style={styles.sheetBody}>
            <RamahField
              label="Tanggal cutover"
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
              label="Alasan"
              required
              value={header.alasan}
              onChangeText={(v) => {
                setHeader({ ...header, alasan: v });
                setHeaderErr('');
              }}
              multiline
              maxLength={1000}
              error={headerErr}
            />
            <RamahPrimaryButton
              label="Simpan header"
              onPress={simpanHeader}
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
        onConfirm={konfirmasiAksi}
        busy={busy}
      />
    </View>
  );
}

/**
 * One saved line: what was typed, and — in the server's own figure — what it is
 * worth. Once posted the row is the way into that product's ledger, where this
 * line is the first row of the chain.
 */
function BarisTerbaca({
  line,
  first,
  last,
  onPress,
}: {
  line: SaldoAwalLine;
  first: boolean;
  last: boolean;
  onPress?: () => void;
}) {
  const [down, setDown] = useState(false);
  const dasar =
    line.faktor === 1 ? '' : ` · ${formatNumber(line.qtyDasar)} ${line.namaSatuanDasar}`;
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${line.nama}, ${formatDesimal(line.qtyInput)} ${line.namaSatuan}, ${formatUang(line.nilaiMasuk)}${onPress ? '. Buka kartu stok' : ''}`}
        style={[styles.row, down && onPress && styles.rowDown]}>
        <View style={styles.grow}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {line.nama}
          </Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {`${formatDesimal(line.qtyInput)} ${line.namaSatuan} × ${formatUang(line.hargaSatuanInput)}${dasar}`}
          </Text>
        </View>
        <Text style={styles.rowValue} numberOfLines={1}>
          {formatUang(line.nilaiMasuk)}
        </Text>
        {onPress ? <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} /> : null}
      </Pressable>
    </View>
  );
}

/** What to say after a transition landed — per transition, because what changed differs each time. */
function pesanAksi(aksi: AksiDokumen, saved: SaldoAwalDoc): string {
  switch (aksi.key) {
    case 'ajukan':
      return 'Diajukan · tanggal dan barisnya sekarang terkunci sampai diposting atau ditolak.';
    case 'tolak':
      return 'Ditolak dan kembali ke draf. Alasannya tersimpan di dokumen.';
    case 'posting':
      return `Diposting · ${saved.lines.length} baris masuk kartu stok di ${saved.namaRuang}. Buka barisnya untuk melihat kartu stoknya.`;
    case 'batal':
      return aksi.dari === 'POSTED'
        ? 'Dibatalkan · baris pembalik bertanggal hari ini. Barang-barang ini tidak bisa diberi saldo awal lagi — koreksinya lewat stok opname.'
        : 'Dibatalkan · belum ada baris kartu stok yang ditulis.';
    default:
      return `Dokumen sekarang ${saved.status}.`;
  }
}

/** Why this screen has no buttons for the grant that is reading it. */
function pesanTanpaAksi(status: SaldoAwalDoc['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Draf ini menunggu diajukan oleh staf gudang atau supervisor.';
    case 'DIAJUKAN':
      return 'Menunggu supervisor memposting atau menolak. Tanggal dan barisnya terkunci.';
    case 'POSTED':
      return 'Sudah masuk kartu stok. Hanya supervisor yang bisa membatalkannya.';
    case 'BATAL':
      return 'Dokumen batal. Tidak ada lagi yang bisa dilakukan di sini.';
    default:
      return '';
  }
}

/** Only the stamps that exist — a document never submitted has no "Diajukan". */
function jejakRows(doc: SaldoAwalDoc): { label: string; value: string }[] {
  const rows = [{ label: 'Dibuat', value: formatTanggal(doc.createdAt) }];
  if (doc.diajukanPada) rows.push({ label: 'Diajukan', value: formatTanggal(doc.diajukanPada) });
  if (doc.disetujuiPada) rows.push({ label: 'Disetujui', value: formatTanggal(doc.disetujuiPada) });
  if (doc.postedAt) rows.push({ label: 'Diposting', value: formatTanggal(doc.postedAt) });
  return rows;
}

/**
 * No top, left or right inset here: `app/saldo-awal/_layout.tsx` pays all three.
 * The bottom is the dock's and is read in the component. Sheets pay their own.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -L.space2 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space6 },
  head: { gap: L.group, paddingBottom: L.related },
  group: { gap: L.related },
  foot: { gap: L.stack, paddingTop: L.group },
  editRow: { paddingBottom: L.stack },
  addBar: { alignItems: 'flex-start' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  identity: { gap: L.space1 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  identityName: { ...T.titleModerate, color: C.textTitle, flexShrink: 1 },
  identitySub: { ...T.bodySmall, color: C.textBody },

  statRow: { flexDirection: 'row', gap: L.stack },

  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.titleTiny, color: C.textTitle },
  emptySub: { ...T.bodySmall, color: C.textBody },

  // The group card, assembled row by row: a `FlatList` item cannot be wrapped in
  // one element without giving up windowing. Each row draws the edges it owns.
  card: {
    backgroundColor: C.surfaceCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  cardFirst: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomWidth: 1, borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.surfaceStack },
  rowTitle: { ...T.titleTiny, color: C.textTitle },
  rowSub: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },
  rowValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', flexShrink: 0 },

  editNote: { ...T.bodySmall, color: C.textBody },
  noAksi: { ...T.bodySmall, color: C.textMuted, textAlign: 'center', paddingVertical: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    gap: L.related,
    backgroundColor: C.surfacePage,
    ...E.low,
  },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space5, paddingBottom: L.space2 },
});
