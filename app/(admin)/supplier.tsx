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

type Tipe = 'distributor' | 'pabrik' | 'perorangan';
const TIPE_META: Record<Tipe, { label: string; color: string; bg: string; border: string }> = {
  distributor: { label: 'Distributor', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder },
  pabrik: { label: 'Pabrik', color: C.green, bg: C.greenBg, border: C.greenBorder },
  perorangan: { label: 'Perorangan', color: C.muted3, bg: C.badgeBg, border: C.borderCard },
};

interface Faktur {
  no: string;
  tanggal: string;
  total: number;
  sisa: number;
  jatuh: string | null;
}
interface Supplier {
  id: number;
  kode: string;
  nama: string;
  tipe: Tipe;
  narahubung: string;
  telepon: string;
  email: string;
  npwp: string;
  kota: string;
  alamat: string;
  aktif: boolean;
  tempo: number;
  faktur: Faktur[];
}

const TODAY = todayISO();

const INITIAL: Supplier[] = [
  { id: 1, kode: 'SUP-001', nama: 'PT Sinar Dunia Distribusi', tipe: 'distributor', narahubung: 'Bpk. Hendra', telepon: '021-5567-8890', email: 'order@sinardunia.co.id', npwp: '01.234.567.8-021.000', kota: 'Jakarta Pusat', alamat: 'Jl. Industri Raya No. 12, Kemayoran', aktif: true, tempo: 30,
    faktur: [
      { no: 'FB-2608-0044', tanggal: '2026-08-13', total: 18500000, sisa: 18500000, jatuh: '2026-09-12' },
      { no: 'FB-2607-0091', tanggal: '2026-07-28', total: 12400000, sisa: 6000000, jatuh: '2026-08-27' },
      { no: 'FB-2607-0033', tanggal: '2026-07-10', total: 15200000, sisa: 0, jatuh: '2026-08-09' },
    ] },
  { id: 2, kode: 'SUP-002', nama: 'CV Tiga Roda ATK', tipe: 'distributor', narahubung: 'Ibu Sinta', telepon: '021-8890-2211', email: 'cs@tigaroda-atk.com', npwp: '02.345.678.9-014.000', kota: 'Bekasi', alamat: 'Ruko Grand Galaxy Blok B No. 7', aktif: true, tempo: 21,
    faktur: [
      { no: 'FB-2608-0051', tanggal: '2026-08-16', total: 8600000, sisa: 8600000, jatuh: '2026-09-06' },
      { no: 'FB-2606-0140', tanggal: '2026-06-25', total: 7300000, sisa: 3200000, jatuh: '2026-07-16' },
    ] },
  { id: 3, kode: 'SUP-003', nama: 'PT Faber-Castell Indonesia', tipe: 'pabrik', narahubung: 'Bpk. Wawan', telepon: '021-4602-1100', email: 'sales.id@faber-castell.com', npwp: '03.456.789.0-092.000', kota: 'Bekasi', alamat: 'Kawasan Industri Jababeka II, Cikarang', aktif: true, tempo: 45,
    faktur: [
      { no: 'FB-2608-0060', tanggal: '2026-08-05', total: 22000000, sisa: 22000000, jatuh: '2026-09-19' },
      { no: 'FB-2605-0210', tanggal: '2026-05-30', total: 19800000, sisa: 0, jatuh: '2026-07-14' },
    ] },
  { id: 4, kode: 'SUP-004', nama: 'Toko Grosir Pena Jaya', tipe: 'distributor', narahubung: 'Bpk. Anton', telepon: '0812-9087-6655', email: '', npwp: '', kota: 'Jakarta Barat', alamat: 'Pasar Asemka Lt. 1 Blok C No. 44', aktif: true, tempo: 14,
    faktur: [{ no: 'FB-2608-0038', tanggal: '2026-08-11', total: 4200000, sisa: 4200000, jatuh: '2026-08-25' }] },
  { id: 5, kode: 'SUP-005', nama: 'PT Standardpen Industries', tipe: 'pabrik', narahubung: 'Ibu Melati', telepon: '021-6905-3344', email: 'b2b@standardpen.co.id', npwp: '04.567.890.1-073.000', kota: 'Tangerang', alamat: 'Jl. Raya Serang Km 12, Cikupa', aktif: true, tempo: 30,
    faktur: [{ no: 'FB-2607-0122', tanggal: '2026-07-18', total: 14500000, sisa: 0, jatuh: '2026-08-17' }] },
  { id: 6, kode: 'SUP-006', nama: 'UD Amplop Makmur', tipe: 'perorangan', narahubung: 'Bpk. Sutrisno', telepon: '0857-7788-1234', email: '', npwp: '', kota: 'Bogor', alamat: 'Jl. Suryakencana No. 88', aktif: true, tempo: 0,
    faktur: [{ no: 'FB-2608-0029', tanggal: '2026-08-14', total: 1850000, sisa: 0, jatuh: null }] },
  { id: 7, kode: 'SUP-007', nama: 'PT Casio Electronics Indonesia', tipe: 'pabrik', narahubung: 'Bpk. Ferry', telepon: '021-2988-7700', email: 'trade@casio.co.id', npwp: '05.678.901.2-088.000', kota: 'Jakarta Selatan', alamat: 'Gedung Casio Tower Lt. 8, Jl. TB Simatupang', aktif: false, tempo: 30,
    faktur: [{ no: 'FB-2604-0301', tanggal: '2026-04-20', total: 9600000, sisa: 0, jatuh: '2026-05-20' }] },
  { id: 8, kode: 'SUP-008', nama: 'CV Lakban Sejahtera', tipe: 'distributor', narahubung: 'Ibu Ratna', telepon: '0821-1234-9988', email: 'lakbansejahtera@gmail.com', npwp: '', kota: 'Bekasi', alamat: 'Jl. Cakung Cilincing Km 3 No. 21', aktif: true, tempo: 21, faktur: [] },
];

interface Draft {
  id: number | null;
  kode: string;
  nama: string;
  tipe: Tipe;
  narahubung: string;
  telepon: string;
  email: string;
  npwp: string;
  kota: string;
  alamat: string;
  tempo: string;
  aktif: boolean;
}
const EMPTY_DRAFT: Draft = { id: null, kode: '', nama: '', tipe: 'distributor', narahubung: '', telepon: '', email: '', npwp: '', kota: '', alamat: '', tempo: '30', aktif: true };

export default function SupplierScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL);
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

  const canWrite = useCanWrite('supplier');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  function patch(id: number, p: Partial<Supplier>) {
    setSuppliers((list) => list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((c) => {
      if (tipe !== 'semua' && c.tipe !== tipe) return false;
      if (!q) return true;
      return c.nama.toLowerCase().includes(q) || c.kode.toLowerCase().includes(q) || c.narahubung.toLowerCase().includes(q);
    });
  }, [suppliers, query, tipe]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = suppliers.find((c) => c.id === openId) ?? null;

  const hutangOf = (c: Supplier) => c.faktur.reduce((s, n) => s + n.sisa, 0);
  const totalBeliOf = (c: Supplier) => c.faktur.reduce((s, n) => s + n.total, 0);
  const belumLunasOf = (c: Supplier) => c.faktur.filter((n) => n.sisa > 0).length;

  function openEdit(c: Supplier) {
    setDraft({ id: c.id, kode: c.kode, nama: c.nama, tipe: c.tipe, narahubung: c.narahubung, telepon: c.telepon, email: c.email, npwp: c.npwp, kota: c.kota, alamat: c.alamat, tempo: String(c.tempo), aktif: c.aktif });
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
    const tempo = parseInt(draft.tempo || '0', 10) || 0;
    const narahubung = draft.narahubung.trim();
    const telepon = draft.telepon.trim();
    const email = draft.email.trim();
    const npwp = draft.npwp.trim();
    const kota = draft.kota.trim();
    const alamat = draft.alamat.trim();

    if (modal === 'new') {
      const kode = draft.kode.trim();
      if (!kode) return setModalErr('400 — kode supplier wajib diisi.');
      if (suppliers.some((c) => c.kode.toLowerCase() === kode.toLowerCase())) {
        return setModalErr(`409 — kode ${kode} sudah dipakai supplier lain.`);
      }
      const id = seq + 1;
      const sup: Supplier = { id, kode, nama, tipe: draft.tipe, narahubung, telepon, email, npwp, kota, alamat, aktif: true, tempo, faktur: [] };
      setSuppliers((l) => [...l, sup]);
      setSeq(id);
      closeModal();
      setView('detail');
      setOpenId(id);
      toast(`Supplier ${nama} ditambahkan`);
      return;
    }
    if (draft.id != null) patch(draft.id, { nama, tipe: draft.tipe, narahubung, telepon, email, npwp, kota, alamat, tempo, aktif: draft.aktif });
    closeModal();
    toast('Perubahan tersimpan');
  }

  const tipeOptions: { key: 'semua' | Tipe; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'distributor', label: 'Distributor' },
    { key: 'pabrik', label: 'Pabrik' },
    { key: 'perorangan', label: 'Perorangan' },
  ];

  return (
    <AppShell title="Supplier">
      {view === 'list' && (
        <View style={styles.listWrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nama, kode, atau narahubung" />
            <FilterPills options={tipeOptions} active={tipe} onPick={(k) => { setTipe(k); setPage(1); }} />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} supplier</Text>
            {canWrite && <PrimaryButton label="Supplier baru" onPress={() => { setDraft(EMPTY_DRAFT); setModalErr(''); setModal('new'); }} />}
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.thText, { width: 128 }]}>TIPE</Text>
              <Text style={[styles.thText, { width: 140, textAlign: 'right' }]}>HUTANG</Text>
              <View style={{ width: 90 }} />
            </View>
            <ScrollView style={{ flex: 1 }}>
              {slice.map((r) => {
                const meta = TIPE_META[r.tipe];
                const hutang = hutangOf(r);
                const belum = belumLunasOf(r);
                const jatuhTempo = r.faktur.some((n) => n.sisa > 0 && n.jatuh && n.jatuh < TODAY);
                return (
                  <View key={r.id} style={styles.row}>
                    <Pressable onPress={() => { setView('detail'); setOpenId(r.id); }} style={styles.rowMain}>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <Text style={[styles.namaText, { color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>{r.nama}</Text>
                          {!r.aktif && <NeutralBadge />}
                        </View>
                        <Text style={styles.metaText} numberOfLines={1}>
                          {r.kode} · {r.narahubung || '—'}{r.kota ? ` · ${r.kota}` : ''}
                        </Text>
                      </View>
                      <View style={{ width: 128 }}>
                        <Badge label={meta.label} color={meta.color} bg={meta.bg} border={meta.border} small />
                      </View>
                      <View style={{ width: 140, alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: hutang <= 0 ? C.muted : jatuhTempo ? C.red : C.text }}>
                          {hutang > 0 ? rpShort(hutang) : '—'}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.muted }}>{belum > 0 ? `${belum} faktur terbuka` : 'lunas semua'}</Text>
                      </View>
                    </Pressable>
                    <View style={{ width: 90, alignItems: 'flex-end' }}>
                      {canWrite && <GhostButton label="Ubah" onPress={() => openEdit(r)} />}
                    </View>
                  </View>
                );
              })}
              {slice.length === 0 && <EmptyState title="Tidak ada supplier yang cocok" sub="Coba kata kunci lain atau ubah filter tipe." />}
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
                <SecondaryButton label="Ubah supplier" onPress={() => openEdit(current)} />
                <SecondaryButton
                  label={current.aktif ? 'Nonaktifkan' : 'Aktifkan kembali'}
                  color={current.aktif ? C.red : C.primary}
                  onPress={() => {
                    patch(current.id, { aktif: !current.aktif });
                    toast(current.aktif ? 'Supplier dinonaktifkan' : 'Supplier diaktifkan kembali');
                  }}
                />
              </View>
            )}
          </View>

          {(() => {
            const hutang = hutangOf(current);
            const jatuhTempo = current.faktur.some((n) => n.sisa > 0 && n.jatuh && n.jatuh < TODAY);
            const belum = belumLunasOf(current);
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <StatTile label="Hutang berjalan" value={rp(hutang)} color={hutang <= 0 ? C.text : jatuhTempo ? C.red : C.text}
                  sub={hutang <= 0 ? 'Tidak ada hutang berjalan' : jatuhTempo ? 'Ada faktur lewat jatuh tempo' : 'Ada hutang berjalan'}
                  subColor={jatuhTempo ? C.red : C.muted} />
                <StatTile label="Tempo bayar" value={current.tempo > 0 ? `${current.tempo} hari` : 'Tunai'} sub={current.tempo > 0 ? 'sejak tanggal faktur' : 'bayar di tempat'} />
                <StatTile label="Nilai pembelian" value={rp(totalBeliOf(current))} sub={`akumulasi ${current.faktur.length} faktur`} />
                <StatTile label="Faktur belum lunas" value={num(belum)} color={belum > 0 ? C.red : C.text} sub={`dari ${current.faktur.length} faktur`} />
              </View>
            );
          })()}

          <Card>
            <CardHead title="Kontak & alamat" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Narahubung</Text><Text style={styles.kVal}>{current.narahubung || '—'}</Text></View>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Telepon</Text><Text style={styles.kVal}>{current.telepon || '—'}</Text></View>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Email</Text><Text style={styles.kVal}>{current.email || '—'}</Text></View>
              <View style={[styles.contactCell, { borderRightWidth: 0 }]}><Text style={styles.kLabel}>NPWP</Text><Text style={styles.kVal}>{current.npwp || '—'}</Text></View>
              <View style={styles.contactCell}><Text style={styles.kLabel}>Kota</Text><Text style={styles.kVal}>{current.kota || '—'}</Text></View>
              <View style={[styles.contactCell, { flexBasis: '66%', borderRightWidth: 0 }]}><Text style={styles.kLabel}>Alamat</Text><Text style={styles.kVal}>{current.alamat || '—'}</Text></View>
            </View>
          </Card>

          <Card>
            <CardHead title="Riwayat faktur pembelian" right={<Text style={{ fontSize: 14, color: C.muted3 }}>{current.faktur.length} faktur</Text>} />
            {current.faktur.length === 0 ? (
              <EmptyState title="Belum ada pembelian" sub="Faktur pembelian dari supplier ini akan muncul di sini." />
            ) : (
              current.faktur.map((h) => {
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

      <ModalShell visible={!!modal} width={580} onRequestClose={closeModal}>
        <ModalHead
          title={modal === 'new' ? 'Supplier baru' : 'Ubah supplier'}
          sub={modal === 'new' ? 'Isi data supplier. Tempo 0 berarti pembelian dibayar tunai di tempat.' : 'Perbarui data kontak dan tempo pembayaran supplier ini.'}
        />
        <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Kode supplier">
                <TextField value={draft.kode} onChangeText={(v) => { setDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={modal === 'new'} mono placeholder="SUP-009" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Tipe">
                <SelectPill<Tipe> value={draft.tipe} options={['distributor', 'pabrik', 'perorangan']} labels={TIPE_META} onChange={(v) => setDraft((d) => ({ ...d, tipe: v }))} />
              </Field>
            </View>
          </View>
          <Field label="Nama">
            <TextField value={draft.nama} onChangeText={(v) => { setDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="PT Sinar Dunia Distribusi" />
          </Field>
          <Field label="Narahubung">
            <TextField value={draft.narahubung} onChangeText={(v) => setDraft((d) => ({ ...d, narahubung: v }))} placeholder="Nama sales / PIC" />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Telepon">
                <TextField value={draft.telepon} onChangeText={(v) => setDraft((d) => ({ ...d, telepon: v }))} placeholder="021-5567-8890" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Email">
                <TextField value={draft.email} onChangeText={(v) => setDraft((d) => ({ ...d, email: v }))} placeholder="sales@supplier.co.id" />
              </Field>
            </View>
          </View>
          <Field label="Alamat">
            <TextField value={draft.alamat} onChangeText={(v) => setDraft((d) => ({ ...d, alamat: v }))} placeholder="Jl. ..." multiline />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Kota">
                <TextField value={draft.kota} onChangeText={(v) => setDraft((d) => ({ ...d, kota: v }))} placeholder="Jakarta Pusat" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="NPWP">
                <TextField value={draft.npwp} onChangeText={(v) => setDraft((d) => ({ ...d, npwp: v }))} placeholder="00.000.000.0-000.000" />
              </Field>
            </View>
            <View style={{ width: 120 }}>
              <Field label="Tempo (hari)">
                <TextField value={draft.tempo} onChangeText={(v) => setDraft((d) => ({ ...d, tempo: v }))} keyboardType="numeric" placeholder="30" />
              </Field>
            </View>
          </View>
          {modal === 'edit' && (
            <CheckBox checked={draft.aktif} onPress={() => setDraft((d) => ({ ...d, aktif: !d.aktif }))} label="Aktif — bisa dipilih saat input pembelian" />
          )}
          <ErrorBanner message={modalErr} />
        </ScrollView>
        <ModalFooter onCancel={closeModal} onSave={save} saveLabel={modal === 'new' ? 'Simpan supplier' : 'Simpan perubahan'} />
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
  contactCell: { flexGrow: 1, flexBasis: 200, padding: 14, borderRightWidth: 1, borderRightColor: C.borderLighter, gap: 3 },
  kLabel: { fontSize: 12.5, color: C.muted2 },
  kVal: { fontSize: 15, color: C.text, lineHeight: 20 },
  notaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 58, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  selectPill: { height: 44, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  selectPillActive: { backgroundColor: C.primaryTintBg, borderColor: C.primaryTintBorder },
  selectPillText: { fontSize: 14, color: C.dark2 },
  selectPillTextActive: { color: C.primaryDark, fontWeight: '600' },
});
