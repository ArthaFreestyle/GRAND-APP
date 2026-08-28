import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  Badge,
  CheckBox,
  EmptyState,
  ErrorBanner,
  Field,
  GhostButton,
  KpiCard,
  ModalFooter,
  ModalHead,
  ModalShell,
  NeutralBadge,
  OptionPicker,
  PrimaryButton,
  SearchBar,
  TabSwitch,
  TextField,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num } from '@/constants/theme-erp';

type UnitTipe = 'toko' | 'gudang' | 'kantor' | 'cabang';
type RuangTipe = 'etalase' | 'gudang' | 'kelas' | 'kantor' | 'lab';

const UNIT_TIPE_META: Record<UnitTipe, { label: string; color: string; bg: string; border: string }> = {
  toko: { label: 'Toko', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder },
  gudang: { label: 'Gudang', color: C.amber, bg: C.amberBg, border: C.amberBorder },
  kantor: { label: 'Kantor', color: C.muted3, bg: C.badgeBg, border: C.borderCard },
  cabang: { label: 'Cabang', color: C.green, bg: C.greenBg, border: C.greenBorder },
};
const RUANG_TIPE_META: Record<RuangTipe, { label: string; color: string; bg: string; border: string }> = {
  etalase: { label: 'Etalase', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder },
  gudang: { label: 'Gudang', color: C.amber, bg: C.amberBg, border: C.amberBorder },
  kelas: { label: 'Kelas', color: C.green, bg: C.greenBg, border: C.greenBorder },
  kantor: { label: 'Kantor', color: C.muted3, bg: C.badgeBg, border: C.borderCard },
  lab: { label: 'Lab', color: C.muted3, bg: C.badgeBg, border: C.borderCard },
};

interface UnitKerja { id: number; kode: string; nama: string; tipe: UnitTipe; pj: string; telepon: string; aktif: boolean }
interface Ruang { id: number; kode: string; nama: string; unitId: number; tipe: RuangTipe; sku: number; aktif: boolean }

const INITIAL_UNITS: UnitKerja[] = [
  { id: 1, kode: 'UK-001', nama: 'Toko Depan', tipe: 'toko', pj: 'Rina Kartika', telepon: '021-3145-7788', aktif: true },
  { id: 2, kode: 'UK-002', nama: 'Gudang Pusat', tipe: 'gudang', pj: 'Yusuf Maulana', telepon: '021-3145-7790', aktif: true },
  { id: 3, kode: 'UK-003', nama: 'Kantor Administrasi', tipe: 'kantor', pj: 'Dewi Anggraini', telepon: '021-3145-7791', aktif: true },
  { id: 4, kode: 'UK-004', nama: 'Cabang Bekasi', tipe: 'cabang', pj: 'Andi Prasetyo', telepon: '021-8890-4455', aktif: true },
  { id: 5, kode: 'UK-005', nama: 'Sekolah Binaan SDN Menteng 01', tipe: 'cabang', pj: 'Sari Wulandari', telepon: '021-3901-2233', aktif: false },
];

const INITIAL_ROOMS: Ruang[] = [
  { id: 1, kode: 'RG-001', nama: 'Ruang Toko Depan', unitId: 1, tipe: 'etalase', sku: 124, aktif: true },
  { id: 2, kode: 'RG-002', nama: 'Etalase Kasir', unitId: 1, tipe: 'etalase', sku: 46, aktif: true },
  { id: 3, kode: 'RG-003', nama: 'Gudang Utama', unitId: 2, tipe: 'gudang', sku: 318, aktif: true },
  { id: 4, kode: 'RG-004', nama: 'Gudang Transit', unitId: 2, tipe: 'gudang', sku: 88, aktif: true },
  { id: 5, kode: 'RG-005', nama: 'Ruang Arsip', unitId: 3, tipe: 'kantor', sku: 12, aktif: true },
  { id: 6, kode: 'RG-006', nama: 'Ruang ATK Kantor', unitId: 3, tipe: 'kantor', sku: 58, aktif: true },
  { id: 7, kode: 'RG-007', nama: 'Toko Cabang Bekasi', unitId: 4, tipe: 'etalase', sku: 96, aktif: true },
  { id: 8, kode: 'RG-008', nama: 'Gudang Cabang Bekasi', unitId: 4, tipe: 'gudang', sku: 142, aktif: true },
  { id: 9, kode: 'RG-009', nama: 'Ruang Kelas 4A', unitId: 5, tipe: 'kelas', sku: 24, aktif: false },
  { id: 10, kode: 'RG-010', nama: 'Ruang Guru', unitId: 5, tipe: 'kantor', sku: 18, aktif: false },
];

type Modal =
  | { kind: 'unit-new' }
  | { kind: 'unit-edit'; id: number }
  | { kind: 'ruang-new' }
  | { kind: 'ruang-edit'; id: number }
  | null;

interface UnitDraft { kode: string; nama: string; tipe: UnitTipe; pj: string; telepon: string; aktif: boolean }
interface RuangDraft { kode: string; nama: string; unitId: string; tipe: RuangTipe; aktif: boolean }

export default function UnitKerjaRuangScreen() {
  const [units, setUnits] = useState<UnitKerja[]>(INITIAL_UNITS);
  const [rooms, setRooms] = useState<Ruang[]>(INITIAL_ROOMS);
  const [uSeq, setUSeq] = useState(5);
  const [rSeq, setRSeq] = useState(10);
  const [tab, setTab] = useState<'unit' | 'ruang'>('unit');
  const [query, setQuery] = useState('');
  const [ruangUnit, setRuangUnit] = useState('semua');
  const [modal, setModal] = useState<Modal>(null);
  const [unitDraft, setUnitDraft] = useState<UnitDraft>({ kode: '', nama: '', tipe: 'toko', pj: '', telepon: '' , aktif: true });
  const [ruangDraft, setRuangDraft] = useState<RuangDraft>({ kode: '', nama: '', unitId: '', tipe: 'gudang', aktif: true });
  const [modalErr, setModalErr] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWriteUnit = useCanWrite('unit-kerja');
  const canWriteRuang = useCanWrite('ruang');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  const roomsOf = (uid: number) => rooms.filter((r) => r.unitId === uid);
  const unitOf = (id: number) => units.find((u) => u.id === id);

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => u.nama.toLowerCase().includes(q) || u.kode.toLowerCase().includes(q) || u.pj.toLowerCase().includes(q));
  }, [units, query]);

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      if (ruangUnit !== 'semua' && r.unitId !== parseInt(ruangUnit, 10)) return false;
      if (!q) return true;
      const u = units.find((x) => x.id === r.unitId);
      return r.nama.toLowerCase().includes(q) || r.kode.toLowerCase().includes(q) || (u ? u.nama.toLowerCase().includes(q) : false);
    });
  }, [rooms, query, ruangUnit, units]);

  const totalSku = rooms.reduce((a, r) => a + r.sku, 0);

  function openUnitEdit(u: UnitKerja) {
    setUnitDraft({ kode: u.kode, nama: u.nama, tipe: u.tipe, pj: u.pj, telepon: u.telepon, aktif: u.aktif });
    setModalErr('');
    setModal({ kind: 'unit-edit', id: u.id });
  }
  function openRuangEdit(r: Ruang) {
    setRuangDraft({ kode: r.kode, nama: r.nama, unitId: String(r.unitId), tipe: r.tipe, aktif: r.aktif });
    setModalErr('');
    setModal({ kind: 'ruang-edit', id: r.id });
  }
  function closeModal() {
    setModal(null);
    setModalErr('');
  }

  function save() {
    if (!modal) return;
    if (modal.kind === 'unit-new' || modal.kind === 'unit-edit') {
      const nama = unitDraft.nama.trim();
      if (!nama) return setModalErr('400 — nama wajib diisi.');
      const pj = unitDraft.pj.trim();
      const telepon = unitDraft.telepon.trim();
      if (modal.kind === 'unit-new') {
        const kode = unitDraft.kode.trim();
        if (!kode) return setModalErr('400 — kode unit wajib diisi.');
        if (units.some((u) => u.kode.toLowerCase() === kode.toLowerCase())) return setModalErr(`409 — kode ${kode} sudah dipakai unit lain.`);
        const id = uSeq + 1;
        setUnits((l) => [...l, { id, kode, nama, tipe: unitDraft.tipe, pj, telepon, aktif: true }]);
        setUSeq(id);
        closeModal();
        toast(`Unit kerja ${nama} ditambahkan`);
        return;
      }
      setUnits((l) => l.map((u) => (u.id === modal.id ? { ...u, nama, tipe: unitDraft.tipe, pj, telepon, aktif: unitDraft.aktif } : u)));
      closeModal();
      toast('Perubahan unit tersimpan');
      return;
    }

    // ruang
    const nama = ruangDraft.nama.trim();
    if (!nama) return setModalErr('400 — nama wajib diisi.');
    if (!ruangDraft.unitId) return setModalErr('400 — pilih unit kerja induk.');
    const unitId = parseInt(ruangDraft.unitId, 10);
    if (modal.kind === 'ruang-new') {
      const kode = ruangDraft.kode.trim();
      if (!kode) return setModalErr('400 — kode ruang wajib diisi.');
      if (rooms.some((r) => r.kode.toLowerCase() === kode.toLowerCase())) return setModalErr(`409 — kode ${kode} sudah dipakai ruang lain.`);
      const id = rSeq + 1;
      setRooms((l) => [...l, { id, kode, nama, unitId, tipe: ruangDraft.tipe, sku: 0, aktif: true }]);
      setRSeq(id);
      closeModal();
      toast(`Ruang ${nama} ditambahkan`);
      return;
    }
    setRooms((l) => l.map((r) => (r.id === modal.id ? { ...r, nama, unitId, tipe: ruangDraft.tipe, aktif: ruangDraft.aktif } : r)));
    closeModal();
    toast('Perubahan ruang tersimpan');
  }

  const isUnitModal = modal?.kind === 'unit-new' || modal?.kind === 'unit-edit';
  const isRuangModal = modal?.kind === 'ruang-new' || modal?.kind === 'ruang-edit';
  const isEdit = modal?.kind === 'unit-edit' || modal?.kind === 'ruang-edit';

  return (
    <AppShell title="Unit Kerja & Ruang">
      <View style={styles.wrap}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard label="Unit kerja" value={num(units.length)} sub={`${units.filter((u) => u.aktif).length} aktif`} />
          <KpiCard label="Ruang / lokasi" value={num(rooms.length)} sub={`${rooms.filter((r) => r.aktif).length} aktif`} />
          <KpiCard label="SKU tersimpan" value={num(totalSku)} sub="akumulasi seluruh ruang" color={C.primaryDark} />
          <KpiCard
            label="Unit nonaktif"
            value={num(units.filter((u) => !u.aktif).length)}
            sub="disembunyikan dari transaksi"
            color={units.some((u) => !u.aktif) ? C.amber : C.green}
          />
        </View>

        <View style={styles.toolbar}>
          <TabSwitch
            options={[{ key: 'unit', label: 'Unit Kerja' }, { key: 'ruang', label: 'Ruang' }]}
            active={tab}
            onPick={(k) => { setTab(k); setQuery(''); }}
          />
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'unit' ? 'Cari nama, kode, atau PJ' : 'Cari ruang, kode, atau unit'}
            maxWidth={360}
          />
          {tab === 'ruang' && (
            <OptionPicker
              options={[{ value: 'semua', label: 'Semua unit kerja' }, ...units.map((u) => ({ value: String(u.id), label: u.nama }))]}
              value={ruangUnit}
              onChange={setRuangUnit}
            />
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.countLabel}>{tab === 'unit' ? `${filteredUnits.length} unit` : `${filteredRooms.length} ruang`}</Text>
          {(tab === 'unit' ? canWriteUnit : canWriteRuang) && (
            <PrimaryButton
              label={tab === 'unit' ? 'Unit kerja baru' : 'Ruang baru'}
              onPress={() => {
                setModalErr('');
                if (tab === 'unit') {
                  setUnitDraft({ kode: '', nama: '', tipe: 'toko', pj: '', telepon: '', aktif: true });
                  setModal({ kind: 'unit-new' });
                } else {
                  setRuangDraft({ kode: '', nama: '', unitId: ruangUnit !== 'semua' ? ruangUnit : '', tipe: 'gudang', aktif: true });
                  setModal({ kind: 'ruang-new' });
                }
              }}
            />
          )}
        </View>

        {tab === 'unit' ? (
          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>UNIT KERJA</Text>
              <Text style={[styles.thText, { width: 140 }]}>TIPE</Text>
              <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>RUANG</Text>
              <View style={{ width: 210 }} />
            </View>
            <ScrollView style={{ flex: 1 }}>
              {filteredUnits.map((u) => {
                const meta = UNIT_TIPE_META[u.tipe];
                const uRooms = roomsOf(u.id);
                const sku = uRooms.reduce((a, r) => a + r.sku, 0);
                return (
                  <View key={u.id} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text style={[styles.namaText, { color: u.aktif ? C.text : C.muted2 }]} numberOfLines={1}>{u.nama}</Text>
                        {!u.aktif && <NeutralBadge />}
                      </View>
                      <Text style={styles.metaText} numberOfLines={1}>{u.kode} · PJ {u.pj || '—'}</Text>
                    </View>
                    <View style={{ width: 140 }}>
                      <Badge label={meta.label} color={meta.color} bg={meta.bg} border={meta.border} small />
                    </View>
                    <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>{uRooms.length} ruang</Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{num(sku)} SKU</Text>
                    </View>
                    <View style={{ width: 210, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                      <GhostButton label="Lihat ruang" onPress={() => { setTab('ruang'); setRuangUnit(String(u.id)); setQuery(''); }} />
                      {canWriteUnit && <GhostButton label="Ubah" onPress={() => openUnitEdit(u)} />}
                    </View>
                  </View>
                );
              })}
              {filteredUnits.length === 0 && <EmptyState title="Tidak ada unit kerja yang cocok" sub="Coba kata kunci lain." />}
            </ScrollView>
            <View style={styles.pagingBar}>
              <Text style={styles.pagingLabel}>
                {filteredUnits.length ? `Menampilkan ${filteredUnits.length} dari ${units.length} unit kerja` : '0 hasil'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>RUANG</Text>
              <Text style={[styles.thText, { width: 200 }]}>UNIT KERJA</Text>
              <Text style={[styles.thText, { width: 120 }]}>TIPE</Text>
              <Text style={[styles.thText, { width: 90, textAlign: 'right' }]}>SKU</Text>
              <View style={{ width: 90 }} />
            </View>
            <ScrollView style={{ flex: 1 }}>
              {filteredRooms.map((r) => {
                const meta = RUANG_TIPE_META[r.tipe];
                const u = unitOf(r.unitId);
                return (
                  <View key={r.id} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text style={[styles.namaText, { fontSize: 16, color: r.aktif ? C.text : C.muted2 }]} numberOfLines={1}>{r.nama}</Text>
                        {!r.aktif && <NeutralBadge />}
                      </View>
                      <Text style={[styles.metaText, { fontFamily: 'monospace' }]}>{r.kode}</Text>
                    </View>
                    <Text style={{ width: 200, fontSize: 14, color: C.dark2 }} numberOfLines={1}>{u ? u.nama : '—'}</Text>
                    <View style={{ width: 120 }}>
                      <Badge label={meta.label} color={meta.color} bg={meta.bg} border={meta.border} small />
                    </View>
                    <Text style={{ width: 90, textAlign: 'right', fontSize: 15 }}>{num(r.sku)}</Text>
                    <View style={{ width: 90, alignItems: 'flex-end' }}>
                      {canWriteRuang && <GhostButton label="Ubah" onPress={() => openRuangEdit(r)} />}
                    </View>
                  </View>
                );
              })}
              {filteredRooms.length === 0 && <EmptyState title="Tidak ada ruang yang cocok" sub="Coba kata kunci lain atau ubah filter unit kerja." />}
            </ScrollView>
            <View style={styles.pagingBar}>
              <Text style={styles.pagingLabel}>
                {filteredRooms.length ? `Menampilkan ${filteredRooms.length} dari ${rooms.length} ruang` : '0 hasil'}
              </Text>
            </View>
          </View>
        )}
      </View>

      <ModalShell visible={!!modal} width={540} onRequestClose={closeModal}>
        <ModalHead
          title={
            modal?.kind === 'unit-new' ? 'Unit kerja baru' : modal?.kind === 'unit-edit' ? 'Ubah unit kerja' : modal?.kind === 'ruang-new' ? 'Ruang baru' : 'Ubah ruang'
          }
          sub={isUnitModal ? 'Unit kerja mengelompokkan ruang penyimpanan dan pemakaian stok.' : 'Ruang adalah lokasi fisik penyimpanan stok di dalam sebuah unit kerja.'}
        />
        <View style={{ padding: 20, gap: 14 }}>
          {isUnitModal && (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Kode unit">
                    <TextField value={unitDraft.kode} onChangeText={(v) => { setUnitDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={!isEdit} mono placeholder="UK-006" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Nama">
                    <TextField value={unitDraft.nama} onChangeText={(v) => { setUnitDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="Gudang Cabang Depok" />
                  </Field>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Tipe">
                    <OptionPicker
                      options={(['toko', 'gudang', 'kantor', 'cabang'] as UnitTipe[]).map((t) => ({ value: t, label: UNIT_TIPE_META[t].label }))}
                      value={unitDraft.tipe}
                      onChange={(v) => setUnitDraft((d) => ({ ...d, tipe: v as UnitTipe }))}
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Telepon">
                    <TextField value={unitDraft.telepon} onChangeText={(v) => setUnitDraft((d) => ({ ...d, telepon: v }))} placeholder="021-5567-8890" />
                  </Field>
                </View>
              </View>
              <Field label="Penanggung jawab">
                <TextField value={unitDraft.pj} onChangeText={(v) => setUnitDraft((d) => ({ ...d, pj: v }))} placeholder="Nama PIC unit" />
              </Field>
              {isEdit && (
                <CheckBox checked={unitDraft.aktif} onPress={() => setUnitDraft((d) => ({ ...d, aktif: !d.aktif }))} label="Aktif — bisa dipilih saat transaksi & mutasi" />
              )}
            </>
          )}
          {isRuangModal && (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Kode ruang">
                    <TextField value={ruangDraft.kode} onChangeText={(v) => { setRuangDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={!isEdit} mono placeholder="RG-011" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Nama">
                    <TextField value={ruangDraft.nama} onChangeText={(v) => { setRuangDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="Gudang Lantai 2" />
                  </Field>
                </View>
              </View>
              <Field label="Unit kerja">
                <OptionPicker options={units.map((u) => ({ value: String(u.id), label: `${u.kode} · ${u.nama}` }))} value={ruangDraft.unitId || null} onChange={(v) => { setRuangDraft((d) => ({ ...d, unitId: v })); setModalErr(''); }} />
              </Field>
              <Field label="Tipe ruang">
                <OptionPicker
                  options={(['etalase', 'gudang', 'kelas', 'kantor', 'lab'] as RuangTipe[]).map((t) => ({ value: t, label: RUANG_TIPE_META[t].label }))}
                  value={ruangDraft.tipe}
                  onChange={(v) => setRuangDraft((d) => ({ ...d, tipe: v as RuangTipe }))}
                />
              </Field>
              {isEdit && (
                <CheckBox checked={ruangDraft.aktif} onPress={() => setRuangDraft((d) => ({ ...d, aktif: !d.aktif }))} label="Aktif — bisa dipilih sebagai lokasi stok" />
              )}
            </>
          )}
          <ErrorBanner message={modalErr} />
        </View>
        <ModalFooter onCancel={closeModal} onSave={save} saveLabel={isEdit ? 'Simpan perubahan' : 'Simpan'} />
      </ModalShell>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 18, gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 48, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 74, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted },
  pagingBar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.borderLight, backgroundColor: C.tableHeaderBg },
  pagingLabel: { fontSize: 14, color: C.muted3 },
});
