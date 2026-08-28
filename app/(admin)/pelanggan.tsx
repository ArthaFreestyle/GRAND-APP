import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  BackButton,
  Card,
  CardHead,
  CheckBox,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  GhostButton,
  ModalFooter,
  ModalHead,
  ModalShell,
  NeutralBadge,
  PagingBar,
  PrimaryButton,
  SearchBar,
  SecondaryButton,
  StatTile,
  TextField,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, rp, rpShort, tanggal } from '@/constants/theme-erp';
import { ApiError } from '@/services/api';
import { decimalToNumber, rupiahToDecimal } from '@/services/decimal';
import {
  createPelanggan,
  getPelanggan,
  listPelanggan,
  listPiutang,
  updatePelanggan,
  type Pelanggan,
  type PiutangNota,
} from '@/services/pelanggan';

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;

interface Draft {
  id: number | null;
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
  /** Whole rupiah as typed; only meaningful while `tanpaBatas` is false. */
  plafon: string;
  /**
   * Maps to `plafon_kredit: null`, which means no limit at all — the opposite of
   * `"0.00"`, which forbids credit entirely.
   */
  tanpaBatas: boolean;
  aktif: boolean;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  kode: '',
  nama: '',
  telepon: '',
  alamat: '',
  npwp: '',
  plafon: '0',
  tanpaBatas: true,
  aktif: true,
};

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export default function PelangganScreen() {
  const [rows, setRows] = useState<Pelanggan[]>([]);
  const [totalItem, setTotalItem] = useState(0);
  const [totalPage, setTotalPage] = useState(1);
  const [listErr, setListErr] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [current, setCurrent] = useState<Pelanggan | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [piutang, setPiutang] = useState<PiutangNota[]>([]);
  const [piutangTotal, setPiutangTotal] = useState(0);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [modalErr, setModalErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pelanggan');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ---- list ----

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await listPelanggan({ page, size: PAGE_SIZE, search: search || undefined });
      setRows(result.data);
      setTotalItem(result.paging.total_item ?? result.data.length);
      setTotalPage(Math.max(1, result.paging.total_page ?? 1));
      setListErr('');
    } catch (e) {
      setListErr(messageOf(e, 'Gagal memuat daftar pelanggan.'));
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // ---- detail ----

  const openDetail = useCallback(async (id: number) => {
    setView('detail');
    setDetailLoading(true);
    setPiutang([]);
    setPiutangTotal(0);
    try {
      const detail = await getPelanggan(id);
      setCurrent(detail);
      // Outstanding notes are their own paginated read; the customer record
      // never carries them.
      listPiutang(id, { size: 50 })
        .then((p) => {
          setPiutang(p.data);
          setPiutangTotal(p.paging.total_item ?? p.data.length);
        })
        .catch(() => setPiutang([]));
    } catch (e) {
      setCurrent(null);
      setView('list');
      toast(messageOf(e, 'Gagal memuat detail pelanggan.'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function applyDetail(saved: Pelanggan) {
    setCurrent(saved);
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  }

  // ---- form ----

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setModalErr('');
    setModal('new');
  }

  function openEdit(c: Pelanggan) {
    setDraft({
      id: c.id,
      kode: c.kode,
      nama: c.nama,
      telepon: c.telepon,
      alamat: c.alamat,
      npwp: c.npwp,
      plafon: c.plafon === null ? '0' : String(Math.round(decimalToNumber(c.plafon))),
      tanpaBatas: c.plafon === null,
      aktif: c.aktif,
    });
    setModalErr('');
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setDraft(EMPTY_DRAFT);
    setModalErr('');
  }

  async function save() {
    if (saving) return;
    const nama = draft.nama.trim();
    if (!nama) return setModalErr('Nama wajib diisi.');

    const body = {
      kode: draft.kode.trim() || null,
      nama,
      telepon: draft.telepon.trim() || null,
      alamat: draft.alamat.trim() || null,
      npwp: draft.npwp.trim() || null,
      plafon_kredit: draft.tanpaBatas ? null : rupiahToDecimal(draft.plafon),
    };

    setSaving(true);
    try {
      if (modal === 'new') {
        const created = await createPelanggan(body);
        closeModal();
        await reloadList();
        setCurrent(created);
        setPiutang([]);
        setPiutangTotal(0);
        setView('detail');
        toast(`Pelanggan ${created.nama} ditambahkan`);
        return;
      }
      if (draft.id != null) {
        applyDetail(await updatePelanggan(draft.id, { ...body, is_aktif: draft.aktif }));
        closeModal();
        toast('Perubahan tersimpan');
      }
    } catch (e) {
      // 409 is a duplicate kode; the server names it.
      setModalErr(messageOf(e, 'Gagal menyimpan pelanggan.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAktif() {
    if (!current || saving) return;
    const next = !current.aktif;
    setSaving(true);
    try {
      applyDetail(await updatePelanggan(current.id, { is_aktif: next }));
      toast(next ? 'Pelanggan diaktifkan kembali' : 'Pelanggan dinonaktifkan');
    } catch (e) {
      toast(messageOf(e, 'Gagal mengubah status pelanggan.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- derived ----

  const piutangJalan = piutang.reduce((s, n) => s + decimalToNumber(n.sisa_piutang), 0);
  const plafonAngka = current && current.plafon !== null ? decimalToNumber(current.plafon) : null;
  const nearLimit = plafonAngka !== null && plafonAngka > 0 && piutangJalan >= plafonAngka * 0.9;
  const sisaLimit = plafonAngka === null ? null : plafonAngka - piutangJalan;

  const pagingLabel = totalItem
    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItem)} dari ${totalItem} · halaman ${page}/${totalPage}`
    : '0 hasil';

  function plafonLabel(p: string | null): string {
    if (p === null) return 'tanpa batas';
    const n = decimalToNumber(p);
    return n === 0 ? 'tunai saja' : `limit ${rpShort(n)}`;
  }

  return (
    <AppShell title="Pelanggan">
      {view === 'list' && (
        <View style={styles.listWrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Cari nama atau kode pelanggan" />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{totalItem} pelanggan</Text>
            {canWrite && <PrimaryButton label="Pelanggan baru" onPress={openNew} />}
          </View>

          <DataTable
            minWidth={720}
            head={
              <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 180 }]}>NPWP</Text>
              <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>PLAFON KREDIT</Text>
                <View style={{ width: 90 }} />
              </View>
            }
            footer={
              <PagingBar
                label={pagingLabel}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
              />
            }>
            {rows.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Pressable onPress={() => openDetail(r.id)} style={styles.rowMain}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>
                          {r.nama}
                        </Text>
                        {!r.aktif && <NeutralBadge />}
                      </View>
                      <Text style={styles.metaText} numberOfLines={1}>
                        {r.kode || 'tanpa kode'} · {r.telepon || '—'}
                      </Text>
                    </View>
                    <Text style={{ width: 180, fontSize: 14, color: C.muted3 }} numberOfLines={1}>
                      {r.npwp || '—'}
                    </Text>
                    <View style={{ width: 150, alignItems: 'flex-end' }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: r.plafon === null ? C.muted : C.text,
                        }}>
                        {plafonLabel(r.plafon)}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={{ width: 90, alignItems: 'flex-end' }}>
                    {canWrite && <GhostButton label="Ubah" onPress={() => openEdit(r)} />}
                  </View>
                </View>
              ))}
              {listLoading && rows.length === 0 && (
                <View style={styles.centerBox}>
                  <ActivityIndicator color={C.primary} />
                </View>
              )}
              {!listLoading && listErr !== '' && (
                <View style={styles.centerBox}>
                  <Text style={styles.errText}>{listErr}</Text>
                  <GhostButton label="Coba lagi" onPress={reloadList} />
                </View>
              )}
              {!listLoading && listErr === '' && rows.length === 0 && (
                <EmptyState
                  title="Tidak ada pelanggan yang cocok"
                  sub="Pencarian mencocokkan sebagian kode atau nama pelanggan."
                />
              )}
          </DataTable>
        </View>
      )}

      {view === 'detail' && detailLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}

      {view === 'detail' && !detailLoading && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          <View style={styles.detailHead}>
            <BackButton
              onPress={() => {
                setView('list');
                setCurrent(null);
                setPiutang([]);
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={styles.detailTitle}>{current.nama}</Text>
              {!current.aktif && <NeutralBadge />}
            </View>
            <View style={{ flex: 1 }} />
            {canWrite && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SecondaryButton label="Ubah pelanggan" onPress={() => openEdit(current)} />
                <SecondaryButton
                  label={current.aktif ? 'Nonaktifkan' : 'Aktifkan kembali'}
                  color={current.aktif ? C.red : C.primary}
                  onPress={toggleAktif}
                />
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile
              label="Piutang berjalan"
              value={rp(piutangJalan)}
              color={piutangJalan <= 0 ? C.text : nearLimit ? C.red : C.text}
              sub={
                piutangJalan <= 0
                  ? 'Tidak ada tagihan berjalan'
                  : nearLimit
                    ? 'Mendekati / melewati plafon'
                    : 'Ada tagihan berjalan'
              }
              subColor={nearLimit ? C.red : C.muted}
            />
            <StatTile
              label="Plafon kredit"
              value={plafonAngka === null ? 'Tanpa batas' : rp(plafonAngka)}
              sub={
                plafonAngka === null
                  ? 'Penjualan kredit tidak pernah ditolak'
                  : plafonAngka === 0
                    ? 'Tunai saja — kredit selalu ditolak'
                    : 'Ditegakkan saat posting nota kredit'
              }
            />
            <StatTile
              label="Sisa plafon"
              value={sisaLimit === null ? '—' : rp(Math.max(0, sisaLimit))}
              color={sisaLimit !== null && sisaLimit < 0 ? C.red : C.text}
              sub={plafonAngka === null ? 'tanpa batas' : `dari ${rp(plafonAngka)}`}
            />
            <StatTile
              label="Nota belum lunas"
              value={num(piutang.length)}
              color={piutang.length > 0 ? C.red : C.text}
              sub={piutangTotal > piutang.length ? `dari ${piutangTotal} nota` : 'seluruhnya'}
            />
          </View>

          <Card>
            <CardHead title="Kontak & alamat" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Kode</Text>
                <Text style={styles.kVal}>{current.kode || '—'}</Text>
              </View>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>Telepon</Text>
                <Text style={styles.kVal}>{current.telepon || '—'}</Text>
              </View>
              <View style={styles.contactCell}>
                <Text style={styles.kLabel}>NPWP</Text>
                <Text style={styles.kVal}>{current.npwp || '—'}</Text>
              </View>
              <View style={[styles.contactCell, { borderRightWidth: 0 }]}>
                <Text style={styles.kLabel}>Alamat</Text>
                <Text style={styles.kVal}>{current.alamat || '—'}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <CardHead
              title="Piutang berjalan"
              right={<Text style={{ fontSize: 14, color: C.muted3 }}>{piutangTotal} nota</Text>}
            />
            {piutang.length === 0 ? (
              <EmptyState
                title="Tidak ada piutang berjalan"
                sub="Hanya nota kredit yang sudah diposting dan belum lunas yang muncul di sini — nota tunai tidak pernah jadi piutang."
              />
            ) : (
              piutang.map((h) => (
                <View key={h.id_penjualan} style={styles.notaRow}>
                  <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>{tanggal(h.tanggal ?? '')}</Text>
                  <Text style={{ flex: 1, fontSize: 14, color: C.dark2, fontFamily: 'monospace' }} numberOfLines={1}>
                    {h.nomor}
                  </Text>
                  <Text style={{ width: 140, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>
                    {rp(decimalToNumber(h.total))}
                  </Text>
                  <Text
                    style={{
                      width: 140,
                      fontSize: 15,
                      fontWeight: '600',
                      textAlign: 'right',
                      color: C.red,
                    }}>
                    {rp(decimalToNumber(h.sisa_piutang))}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}

      <ModalShell visible={!!modal} width={560} onRequestClose={closeModal}>
        <ModalHead
          title={modal === 'new' ? 'Pelanggan baru' : 'Ubah pelanggan'}
          sub="Plafon kredit ditegakkan saat nota kredit diposting. Tanpa batas berarti tidak pernah ditolak; plafon 0 berarti tunai saja."
        />
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Kode pelanggan (opsional)">
                <TextField
                  value={draft.kode}
                  onChangeText={(v) => {
                    setDraft((d) => ({ ...d, kode: v }));
                    setModalErr('');
                  }}
                  mono
                  placeholder="PLG-009"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="NPWP">
                <TextField
                  value={draft.npwp}
                  onChangeText={(v) => setDraft((d) => ({ ...d, npwp: v }))}
                  mono
                  placeholder="—"
                />
              </Field>
            </View>
          </View>
          <Field label="Nama">
            <TextField
              value={draft.nama}
              onChangeText={(v) => {
                setDraft((d) => ({ ...d, nama: v }));
                setModalErr('');
              }}
              placeholder="CV Sinar Jaya"
            />
          </Field>
          <Field label="Telepon">
            <TextField
              value={draft.telepon}
              onChangeText={(v) => setDraft((d) => ({ ...d, telepon: v }))}
              placeholder="0812-3456-7890"
            />
          </Field>
          <Field label="Alamat">
            <TextField
              value={draft.alamat}
              onChangeText={(v) => setDraft((d) => ({ ...d, alamat: v }))}
              placeholder="Jl. ..."
              multiline
            />
          </Field>
          <CheckBox
            checked={draft.tanpaBatas}
            onPress={() => setDraft((d) => ({ ...d, tanpaBatas: !d.tanpaBatas }))}
            label="Tanpa batas kredit — penjualan kredit tidak pernah ditolak"
          />
          {!draft.tanpaBatas && (
            <Field label="Plafon kredit (Rp)">
              <TextField
                value={draft.plafon}
                onChangeText={(v) => setDraft((d) => ({ ...d, plafon: v }))}
                keyboardType="numeric"
                placeholder="0"
              />
            </Field>
          )}
          {modal === 'edit' && (
            <CheckBox
              checked={draft.aktif}
              onPress={() => setDraft((d) => ({ ...d, aktif: !d.aktif }))}
              label="Aktif — bisa dipilih di kasir"
            />
          )}
          <ErrorBanner message={modalErr} />
        </View>
        <ModalFooter
          onCancel={closeModal}
          onSave={save}
          saveLabel={modal === 'new' ? 'Simpan pelanggan' : 'Simpan perubahan'}
        />
      </ModalShell>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  thText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  namaText: { fontSize: 15.5, fontWeight: '600' },
  metaText: { fontSize: 13, color: C.muted2 },
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  contactCell: {
    minWidth: 200,
    flexGrow: 1,
    flexBasis: 0,
    padding: 16,
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: C.borderLight,
  },
  kLabel: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.4, color: C.muted },
  kVal: { fontSize: 15, color: C.text },
  notaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderLighter,
  },
});
