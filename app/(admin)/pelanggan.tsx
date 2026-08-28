import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  BackButton,
  Badge,
  Card,
  CardHead,
  CheckBox,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
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
import { Colors as C, num, rp, rpShort, tanggal, todayISO } from '@/constants/theme-erp';

const PAGE_SIZE = 8;

type Tipe = 'umum' | 'instansi' | 'reseller';
const TIPE_META: Record<Tipe, { label: string; color: string; bg: string; border: string }> = {
  umum: { label: 'Umum', color: C.muted3, bg: C.badgeBg, border: C.borderCard },
  instansi: { label: 'Instansi', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder },
  reseller: { label: 'Reseller', color: C.green, bg: C.greenBg, border: C.greenBorder },
};

interface Nota {
  no: string;
  tanggal: string;
  total: number;
  sisa: number;
  jatuh: string | null;
}
interface Customer {
  id: number;
  kode: string;
  nama: string;
  tipe: Tipe;
  telepon: string;
  kota: string;
  alamat: string;
  aktif: boolean;
  limit: number;
  tempo: number;
  nota: Nota[];
}

const TODAY = todayISO();

const INITIAL: Customer[] = [
  { id: 1, kode: 'PLG-001', nama: 'CV Sinar Jaya', tipe: 'instansi', telepon: '021-5567-8890', kota: 'Jakarta Pusat', alamat: 'Jl. Kramat Raya No. 45, Senen', aktif: true, limit: 20000000, tempo: 30,
    nota: [
      { no: 'INV-2608-0142', tanggal: '2026-08-14', total: 4200000, sisa: 4200000, jatuh: '2026-09-13' },
      { no: 'INV-2608-0090', tanggal: '2026-08-05', total: 4300000, sisa: 4300000, jatuh: '2026-09-04' },
      { no: 'INV-2607-0311', tanggal: '2026-07-22', total: 3100000, sisa: 0, jatuh: '2026-08-21' },
    ] },
  { id: 2, kode: 'PLG-002', nama: 'Toko Berkah ATK', tipe: 'reseller', telepon: '0812-9087-1122', kota: 'Bekasi', alamat: 'Ruko Harapan Indah Blok C2 No. 8', aktif: true, limit: 15000000, tempo: 21,
    nota: [
      { no: 'INV-2608-0155', tanggal: '2026-08-16', total: 7800000, sisa: 7800000, jatuh: '2026-09-06' },
      { no: 'INV-2608-0101', tanggal: '2026-08-08', total: 4200000, sisa: 4200000, jatuh: '2026-08-29' },
    ] },
  { id: 3, kode: 'PLG-003', nama: 'Budi Santoso', tipe: 'umum', telepon: '0813-4455-6677', kota: 'Depok', alamat: 'Jl. Margonda Raya No. 210', aktif: true, limit: 0, tempo: 0,
    nota: [{ no: 'INV-2608-0160', tanggal: '2026-08-17', total: 185000, sisa: 0, jatuh: null }] },
  { id: 4, kode: 'PLG-004', nama: 'SDN Menteng 01 Pagi', tipe: 'instansi', telepon: '021-3140-2255', kota: 'Jakarta Pusat', alamat: 'Jl. Cikini Raya No. 87', aktif: true, limit: 25000000, tempo: 45,
    nota: [
      { no: 'INV-2608-0120', tanggal: '2026-08-11', total: 3000000, sisa: 3000000, jatuh: '2026-09-25' },
      { no: 'INV-2606-0288', tanggal: '2026-06-30', total: 5400000, sisa: 0, jatuh: '2026-08-14' },
    ] },
  { id: 5, kode: 'PLG-005', nama: 'PT Maju Bersama Sentosa', tipe: 'instansi', telepon: '021-2988-4400', kota: 'Tangerang', alamat: 'Gedung MBS Lt. 4, Jl. MH Thamrin Km 3', aktif: true, limit: 30000000, tempo: 30,
    nota: [{ no: 'INV-2607-0299', tanggal: '2026-07-18', total: 9200000, sisa: 0, jatuh: '2026-08-17' }] },
  { id: 6, kode: 'PLG-006', nama: 'Koperasi Guru Sejahtera', tipe: 'instansi', telepon: '0251-8567-334', kota: 'Bogor', alamat: 'Jl. Pajajaran No. 156', aktif: true, limit: 10000000, tempo: 30,
    nota: [
      { no: 'INV-2607-0250', tanggal: '2026-07-10', total: 5600000, sisa: 5600000, jatuh: '2026-08-09' },
      { no: 'INV-2607-0240', tanggal: '2026-07-05', total: 4200000, sisa: 4200000, jatuh: '2026-08-04' },
    ] },
  { id: 7, kode: 'PLG-007', nama: 'Ani Wijaya', tipe: 'umum', telepon: '0857-7788-9900', kota: 'Jakarta Selatan', alamat: 'Jl. Fatmawati No. 12', aktif: true, limit: 0, tempo: 0, nota: [] },
  { id: 8, kode: 'PLG-008', nama: 'Toko Pena Mas', tipe: 'reseller', telepon: '0821-1234-5678', kota: 'Bekasi', alamat: 'Pasar Baru Bekasi Blok A No. 21', aktif: false, limit: 12000000, tempo: 21,
    nota: [{ no: 'INV-2605-0180', tanggal: '2026-05-20', total: 4200000, sisa: 4200000, jatuh: '2026-06-10' }] },
];

interface Draft {
  id: number | null;
  kode: string;
  nama: string;
  tipe: Tipe;
  telepon: string;
  kota: string;
  alamat: string;
  limit: string;
  tempo: string;
  aktif: boolean;
}
const EMPTY_DRAFT: Draft = { id: null, kode: '', nama: '', tipe: 'umum', telepon: '', kota: '', alamat: '', limit: '0', tempo: '0', aktif: true };

export default function PelangganScreen() {
  const [customers, setCustomers] = useState<Customer[]>(INITIAL);
  const [seq, setSeq] = useState(900);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [tipe, setTipe] = useState<'semua' | Tipe>('semua');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [modalErr, setModalErr] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pelanggan');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  function patch(id: number, p: Partial<Customer>) {
    setCustomers((list) => list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (tipe !== 'semua' && c.tipe !== tipe) return false;
      if (!q) return true;
      return c.nama.toLowerCase().includes(q) || c.kode.toLowerCase().includes(q) || c.telepon.toLowerCase().includes(q);
    });
  }, [customers, query, tipe]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = customers.find((c) => c.id === openId) ?? null;

  const piutangOf = (c: Customer) => c.nota.reduce((s, n) => s + n.sisa, 0);
  const belumLunasOf = (c: Customer) => c.nota.filter((n) => n.sisa > 0).length;

  function openEdit(c: Customer) {
    setDraft({ id: c.id, kode: c.kode, nama: c.nama, tipe: c.tipe, telepon: c.telepon, kota: c.kota, alamat: c.alamat, limit: String(c.limit), tempo: String(c.tempo), aktif: c.aktif });
    setModalErr('');
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setDraft(EMPTY_DRAFT);
    setModalErr('');
  }

  function save() {
    const nama = draft.nama.trim();
    if (!nama) return setModalErr('400 — nama wajib diisi.');
    const limit = parseInt(draft.limit || '0', 10) || 0;
    const tempo = parseInt(draft.tempo || '0', 10) || 0;
    const telepon = draft.telepon.trim();
    const kota = draft.kota.trim();
    const alamat = draft.alamat.trim();

    if (modal === 'new') {
      const kode = draft.kode.trim();
      if (!kode) return setModalErr('400 — kode pelanggan wajib diisi.');
      if (customers.some((c) => c.kode.toLowerCase() === kode.toLowerCase())) {
        return setModalErr(`409 — kode ${kode} sudah dipakai pelanggan lain.`);
      }
      const id = seq + 1;
      const cust: Customer = { id, kode, nama, tipe: draft.tipe, telepon, kota, alamat, aktif: true, limit, tempo, nota: [] };
      setCustomers((l) => [...l, cust]);
      setSeq(id);
      closeModal();
      setView('detail');
      setOpenId(id);
      toast(`Pelanggan ${nama} ditambahkan`);
      return;
    }
    if (draft.id != null) patch(draft.id, { nama, tipe: draft.tipe, telepon, kota, alamat, limit, tempo, aktif: draft.aktif });
    closeModal();
    toast('Perubahan tersimpan');
  }

  const tipeOptions: { key: 'semua' | Tipe; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'umum', label: 'Umum' },
    { key: 'instansi', label: 'Instansi' },
    { key: 'reseller', label: 'Reseller' },
  ];

  return (
    <AppShell title="Pelanggan">
      {view === 'list' && (
        <View style={styles.listWrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nama, kode, atau telepon" />
            <FilterPills options={tipeOptions} active={tipe} onPick={(k) => { setTipe(k); setPage(1); }} />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} pelanggan</Text>
            {canWrite && (
              <PrimaryButton
                label="Pelanggan baru"
                onPress={() => { setDraft(EMPTY_DRAFT); setModalErr(''); setModal('new'); }}
              />
            )}
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 116 }]}>TIPE</Text>
              <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>PIUTANG</Text>
              <View style={{ width: 90 }} />
            </View>
            <ScrollView style={{ flex: 1 }}>
              {slice.map((r) => {
                const meta = TIPE_META[r.tipe];
                const piutang = piutangOf(r);
                const nearLimit = r.limit > 0 && piutang >= r.limit * 0.9;
                return (
                  <View key={r.id} style={styles.row}>
                    <Pressable
                      onPress={() => { setView('detail'); setOpenId(r.id); }}
                      style={styles.rowMain}>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <Text style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>{r.nama}</Text>
                          {!r.aktif && <NeutralBadge />}
                        </View>
                        <Text style={styles.metaText} numberOfLines={1}>
                          {r.kode} · {r.telepon || '—'}{r.kota ? ` · ${r.kota}` : ''}
                        </Text>
                      </View>
                      <View style={{ width: 116 }}>
                        <Badge label={meta.label} color={meta.color} bg={meta.bg} border={meta.border} small />
                      </View>
                      <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: piutang <= 0 ? C.muted : nearLimit ? C.red : C.text }}>
                          {piutang > 0 ? rpShort(piutang) : '—'}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.muted }}>{r.limit > 0 ? `limit ${rpShort(r.limit)}` : 'tanpa limit'}</Text>
                      </View>
                    </Pressable>
                    <View style={{ width: 90, alignItems: 'flex-end' }}>
                      {canWrite && <GhostButton label="Ubah" onPress={() => openEdit(r)} />}
                    </View>
                  </View>
                );
              })}
              {slice.length === 0 && <EmptyState title="Tidak ada pelanggan yang cocok" sub="Coba kata kunci lain atau ubah filter tipe." />}
            </ScrollView>
            <PagingBar
              label={filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} dari ${filtered.length} · halaman ${currentPage}/${totalPage}` : '0 hasil'}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
            />
          </View>
        </View>
      )}

      {view === 'detail' && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          <View style={styles.detailHead}>
            <BackButton onPress={() => { setView('list'); setOpenId(null); }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={styles.detailTitle}>{current.nama}</Text>
              <Badge {...TIPE_META[current.tipe]} label={TIPE_META[current.tipe].label} />
              {!current.aktif && <NeutralBadge />}
            </View>
            <View style={{ flex: 1 }} />
            {canWrite && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SecondaryButton label="Ubah pelanggan" onPress={() => openEdit(current)} />
                <SecondaryButton
                  label={current.aktif ? 'Nonaktifkan' : 'Aktifkan kembali'}
                  color={current.aktif ? C.red : C.primary}
                  onPress={() => {
                    patch(current.id, { aktif: !current.aktif });
                    toast(current.aktif ? 'Pelanggan dinonaktifkan' : 'Pelanggan diaktifkan kembali');
                  }}
                />
              </View>
            )}
          </View>

          {(() => {
            const piutang = piutangOf(current);
            const sisaLimit = current.limit - piutang;
            const nearLimit = current.limit > 0 && piutang >= current.limit * 0.9;
            const belum = belumLunasOf(current);
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <StatTile label="Piutang berjalan" value={rp(piutang)} color={piutang <= 0 ? C.text : nearLimit ? C.red : C.text}
                  sub={piutang <= 0 ? 'Tidak ada tagihan berjalan' : nearLimit ? 'Mendekati / melewati limit' : 'Ada tagihan berjalan'}
                  subColor={nearLimit ? C.red : C.muted} />
                <StatTile label="Limit kredit" value={current.limit > 0 ? rp(current.limit) : 'Tanpa limit'} sub={`tempo ${current.tempo} hari`} />
                <StatTile label="Sisa limit" value={current.limit > 0 ? rp(Math.max(0, sisaLimit)) : '—'} color={current.limit > 0 && sisaLimit < 0 ? C.red : C.text} sub={`dari ${current.limit > 0 ? rp(current.limit) : '—'}`} />
                <StatTile label="Nota belum lunas" value={num(belum)} color={belum > 0 ? C.red : C.text} sub={`dari ${current.nota.length} nota`} />
              </View>
            );
          })()}

          <Card>
            <CardHead title="Kontak & alamat" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Telepon</Text><Text style={styles.kVal}>{current.telepon || '—'}</Text></View>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Kota</Text><Text style={styles.kVal}>{current.kota || '—'}</Text></View>
              <View style={[styles.contactCell, { borderRightWidth: 0 }]}><Text style={styles.kLabel}>Alamat</Text><Text style={styles.kVal}>{current.alamat || '—'}</Text></View>
            </View>
          </Card>

          <Card>
            <CardHead title="Riwayat nota" right={<Text style={{ fontSize: 14, color: C.muted3 }}>{current.nota.length} nota</Text>} />
            {current.nota.length === 0 ? (
              <EmptyState title="Belum ada transaksi" sub="Nota penjualan pelanggan ini akan muncul di sini." />
            ) : (
              current.nota.map((h) => {
                const status = h.sisa <= 0
                  ? { label: 'Lunas', color: C.green, bg: C.greenBg, border: C.greenBorder }
                  : h.jatuh && h.jatuh < TODAY
                  ? { label: 'Jatuh tempo', color: C.red, bg: C.redBg, border: C.redBorder }
                  : { label: 'Belum jatuh tempo', color: C.amber, bg: C.amberBg, border: C.amberBorder };
                return (
                  <View key={h.no} style={styles.notaRow}>
                    <Text style={{ width: 110, fontSize: 14, color: C.dark2 }}>{tanggal(h.tanggal)}</Text>
                    <Text style={{ width: 140, fontSize: 14, color: C.dark2, fontFamily: 'monospace' }}>{h.no}</Text>
                    <Text style={{ width: 120, fontSize: 16, fontWeight: '600', textAlign: 'right' }}>{rp(h.total)}</Text>
                    <View style={{ flex: 1, marginLeft: 20 }}>
                      <Badge {...status} small />
                    </View>
                    <Text style={{ width: 120, fontSize: 15, fontWeight: '600', textAlign: 'right', color: h.sisa > 0 ? (status.label === 'Jatuh tempo' ? C.red : C.text) : C.muted }}>
                      {h.sisa > 0 ? rp(h.sisa) : '—'}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
      )}

      <ModalShell visible={!!modal} width={560} onRequestClose={closeModal}>
        <ModalHead
          title={modal === 'new' ? 'Pelanggan baru' : 'Ubah pelanggan'}
          sub={modal === 'new' ? 'Isi data pelanggan. Limit kredit 0 berarti hanya melayani tunai.' : 'Perbarui data kontak dan pengaturan kredit pelanggan ini.'}
        />
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Kode pelanggan">
                <TextField value={draft.kode} onChangeText={(v) => { setDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={modal === 'new'} mono placeholder="PLG-009" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tipe">
                <SelectPill<Tipe> value={draft.tipe} options={['umum', 'instansi', 'reseller']} labels={TIPE_META} onChange={(v) => setDraft((d) => ({ ...d, tipe: v }))} />
              </Field>
            </View>
          </View>
          <Field label="Nama">
            <TextField value={draft.nama} onChangeText={(v) => { setDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="CV Sinar Jaya" />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Telepon">
                <TextField value={draft.telepon} onChangeText={(v) => setDraft((d) => ({ ...d, telepon: v }))} placeholder="0812-3456-7890" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Kota">
                <TextField value={draft.kota} onChangeText={(v) => setDraft((d) => ({ ...d, kota: v }))} placeholder="Jakarta Pusat" />
              </Field>
            </View>
          </View>
          <Field label="Alamat">
            <TextField value={draft.alamat} onChangeText={(v) => setDraft((d) => ({ ...d, alamat: v }))} placeholder="Jl. ..." multiline />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Limit kredit (Rp)">
                <TextField value={draft.limit} onChangeText={(v) => setDraft((d) => ({ ...d, limit: v }))} keyboardType="numeric" placeholder="0" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tempo (hari)">
                <TextField value={draft.tempo} onChangeText={(v) => setDraft((d) => ({ ...d, tempo: v }))} keyboardType="numeric" placeholder="30" />
              </Field>
            </View>
          </View>
          {modal === 'edit' && (
            <CheckBox checked={draft.aktif} onPress={() => setDraft((d) => ({ ...d, aktif: !d.aktif }))} label="Aktif — bisa dipilih di kasir" />
          )}
          <ErrorBanner message={modalErr} />
        </View>
        <ModalFooter onCancel={closeModal} onSave={save} saveLabel={modal === 'new' ? 'Simpan pelanggan' : 'Simpan perubahan'} />
      </ModalShell>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

function SelectPill<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, { label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.selectPill, active && styles.selectPillActive]}>
            <Text style={[styles.selectPillText, active && styles.selectPillTextActive]}>{labels[o].label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 48, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.borderLighter, minHeight: 74 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  detailTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  contactCell: { flexGrow: 1, flexBasis: 220, padding: 14, borderRightWidth: 1, borderRightColor: C.borderLighter, gap: 3 },
  kLabel: { fontSize: 12.5, color: C.muted2 },
  kVal: { fontSize: 15, color: C.text, lineHeight: 20 },
  notaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 58, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  selectPill: { height: 44, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  selectPillActive: { backgroundColor: C.primaryTintBg, borderColor: C.primaryTintBorder },
  selectPillText: { fontSize: 14, color: C.dark2 },
  selectPillTextActive: { color: C.primaryDark, fontWeight: '600' },
});
