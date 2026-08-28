import { useMemo, useRef, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  Badge,
  CheckBox,
  DataTable,
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
  type ToneName,
} from '@/components/shell/ui';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Colors as C, num } from '@/constants/theme-erp';

type UnitTipe = 'toko' | 'gudang' | 'kantor' | 'cabang';
type RuangTipe = 'etalase' | 'gudang' | 'kelas' | 'kantor' | 'lab';

const UNIT_TIPE_META: Record<UnitTipe, { label: string; tone: ToneName }> = {
  toko: { label: 'Toko', tone: 'primary' as const },
  gudang: { label: 'Gudang', tone: 'amber' as const },
  kantor: { label: 'Kantor', tone: 'neutral' as const },
  cabang: { label: 'Cabang', tone: 'green' as const },
};
const RUANG_TIPE_META: Record<RuangTipe, { label: string; tone: ToneName }> = {
  etalase: { label: 'Etalase', tone: 'primary' as const },
  gudang: { label: 'Gudang', tone: 'amber' as const },
  kelas: { label: 'Kelas', tone: 'green' as const },
  kantor: { label: 'Kantor', tone: 'neutral' as const },
  lab: { label: 'Lab', tone: 'neutral' as const },
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
      <Box className="flex-1 gap-3.5 p-[18px]">
        <Box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KpiCard label="Unit kerja" value={num(units.length)} sub={`${units.filter((u) => u.aktif).length} aktif`} />
          <KpiCard label="Ruang / lokasi" value={num(rooms.length)} sub={`${rooms.filter((r) => r.aktif).length} aktif`} />
          <KpiCard label="SKU tersimpan" value={num(totalSku)} sub="akumulasi seluruh ruang" valueClass={'text-primary-dark'} />
          <KpiCard
            label="Unit nonaktif"
            value={num(units.filter((u) => !u.aktif).length)}
            sub="disembunyikan dari transaksi"
            valueClass={units.some((u) => !u.aktif) ? C.amber : C.green}
          />
        </Box>

        <Box className="flex-row flex-wrap items-center gap-3">
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
          <Box style={{ flex: 1 }} />
          <Text className="text-sm text-muted-foreground">{tab === 'unit' ? `${filteredUnits.length} unit` : `${filteredRooms.length} ruang`}</Text>
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
        </Box>

        {tab === 'unit' ? (
          <DataTable
            minWidth={720}
            head={
              <Box className="h-12 flex-row items-center gap-3 border-b border-line-light bg-thead pl-5 pr-9">
                <Text className="flex-1 text-[12.5px] font-semibold tracking-wide text-faint">UNIT KERJA</Text>
                <Text className="w-[140px] text-[12.5px] font-semibold tracking-wide text-faint">TIPE</Text>
                <Text className="w-[130px] text-right text-[12.5px] font-semibold tracking-wide text-faint">RUANG</Text>
                <Box style={{ width: 210 }} />
              </Box>
            }
            footer={
              <Box className="h-12 flex-row items-center border-t border-line-light bg-thead px-5">
                <Text className="text-sm text-muted-foreground">
                  {filteredUnits.length ? `Menampilkan ${filteredUnits.length} dari ${units.length} unit kerja` : '0 hasil'}
                </Text>
              </Box>
            }>
              {filteredUnits.map((u) => {
                const meta = UNIT_TIPE_META[u.tipe];
                const uRooms = roomsOf(u.id);
                const sku = uRooms.reduce((a, r) => a + r.sku, 0);
                return (
                  <Box key={u.id} className="min-h-[74px] flex-row items-center gap-3 border-b border-line-lighter pl-5 pr-9">
                    <Box style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text className={`text-[17px] font-medium ${u.aktif ? 'text-foreground' : 'text-faint-2'}`} numberOfLines={1}>{u.nama}</Text>
                        {!u.aktif && <NeutralBadge />}
                      </Box>
                      <Text className="text-[12.5px] text-faint" numberOfLines={1}>{u.kode} · PJ {u.pj || '—'}</Text>
                    </Box>
                    <Box style={{ width: 140 }}>
                      <Badge label={meta.label} tone={meta.tone} small />
                    </Box>
                    <Box style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>{uRooms.length} ruang</Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{num(sku)} SKU</Text>
                    </Box>
                    <Box style={{ width: 210, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                      <GhostButton label="Lihat ruang" onPress={() => { setTab('ruang'); setRuangUnit(String(u.id)); setQuery(''); }} />
                      {canWriteUnit && <GhostButton label="Ubah" onPress={() => openUnitEdit(u)} />}
                    </Box>
                  </Box>
                );
              })}
              {filteredUnits.length === 0 && <EmptyState title="Tidak ada unit kerja yang cocok" sub="Coba kata kunci lain." />}
          </DataTable>
        ) : (
          <DataTable
            minWidth={740}
            head={
              <Box className="h-12 flex-row items-center gap-3 border-b border-line-light bg-thead pl-5 pr-9">
                <Text className="flex-1 text-[12.5px] font-semibold tracking-wide text-faint">RUANG</Text>
                <Text className="w-[200px] text-[12.5px] font-semibold tracking-wide text-faint">UNIT KERJA</Text>
                <Text className="w-[120px] text-[12.5px] font-semibold tracking-wide text-faint">TIPE</Text>
                <Text className="w-[90px] text-right text-[12.5px] font-semibold tracking-wide text-faint">SKU</Text>
                <Box style={{ width: 90 }} />
              </Box>
            }
            footer={
              <Box className="h-12 flex-row items-center border-t border-line-light bg-thead px-5">
                <Text className="text-sm text-muted-foreground">
                  {filteredRooms.length ? `Menampilkan ${filteredRooms.length} dari ${rooms.length} ruang` : '0 hasil'}
                </Text>
              </Box>
            }>
              {filteredRooms.map((r) => {
                const meta = RUANG_TIPE_META[r.tipe];
                const u = unitOf(r.unitId);
                return (
                  <Box key={r.id} className="min-h-[74px] flex-row items-center gap-3 border-b border-line-lighter pl-5 pr-9">
                    <Box style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text className={`text-base font-medium ${r.aktif ? 'text-foreground' : 'text-faint-2'}`} numberOfLines={1}>{r.nama}</Text>
                        {!r.aktif && <NeutralBadge />}
                      </Box>
                      <Text className="font-mono text-[12.5px] text-faint">{r.kode}</Text>
                    </Box>
                    <Text style={{ width: 200, fontSize: 14, color: C.dark2 }} numberOfLines={1}>{u ? u.nama : '—'}</Text>
                    <Box style={{ width: 120 }}>
                      <Badge label={meta.label} tone={meta.tone} small />
                    </Box>
                    <Text style={{ width: 90, textAlign: 'right', fontSize: 15 }}>{num(r.sku)}</Text>
                    <Box style={{ width: 90, alignItems: 'flex-end' }}>
                      {canWriteRuang && <GhostButton label="Ubah" onPress={() => openRuangEdit(r)} />}
                    </Box>
                  </Box>
                );
              })}
              {filteredRooms.length === 0 && <EmptyState title="Tidak ada ruang yang cocok" sub="Coba kata kunci lain atau ubah filter unit kerja." />}
          </DataTable>
        )}
      </Box>

      <ModalShell visible={!!modal} width={540} onRequestClose={closeModal}>
        <ModalHead
          title={
            modal?.kind === 'unit-new' ? 'Unit kerja baru' : modal?.kind === 'unit-edit' ? 'Ubah unit kerja' : modal?.kind === 'ruang-new' ? 'Ruang baru' : 'Ubah ruang'
          }
          sub={isUnitModal ? 'Unit kerja mengelompokkan ruang penyimpanan dan pemakaian stok.' : 'Ruang adalah lokasi fisik penyimpanan stok di dalam sebuah unit kerja.'}
        />
        <Box style={{ padding: 20, gap: 14 }}>
          {isUnitModal && (
            <>
              <Box style={{ flexDirection: 'row', gap: 12 }}>
                <Box style={{ flex: 1 }}>
                  <Field label="Kode unit">
                    <TextField value={unitDraft.kode} onChangeText={(v) => { setUnitDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={!isEdit} mono placeholder="UK-006" />
                  </Field>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Field label="Nama">
                    <TextField value={unitDraft.nama} onChangeText={(v) => { setUnitDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="Gudang Cabang Depok" />
                  </Field>
                </Box>
              </Box>
              <Box style={{ flexDirection: 'row', gap: 12 }}>
                <Box style={{ flex: 1 }}>
                  <Field label="Tipe">
                    <OptionPicker
                      options={(['toko', 'gudang', 'kantor', 'cabang'] as UnitTipe[]).map((t) => ({ value: t, label: UNIT_TIPE_META[t].label }))}
                      value={unitDraft.tipe}
                      onChange={(v) => setUnitDraft((d) => ({ ...d, tipe: v as UnitTipe }))}
                    />
                  </Field>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Field label="Telepon">
                    <TextField value={unitDraft.telepon} onChangeText={(v) => setUnitDraft((d) => ({ ...d, telepon: v }))} placeholder="021-5567-8890" />
                  </Field>
                </Box>
              </Box>
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
              <Box style={{ flexDirection: 'row', gap: 12 }}>
                <Box style={{ flex: 1 }}>
                  <Field label="Kode ruang">
                    <TextField value={ruangDraft.kode} onChangeText={(v) => { setRuangDraft((d) => ({ ...d, kode: v })); setModalErr(''); }} editable={!isEdit} mono placeholder="RG-011" />
                  </Field>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Field label="Nama">
                    <TextField value={ruangDraft.nama} onChangeText={(v) => { setRuangDraft((d) => ({ ...d, nama: v })); setModalErr(''); }} placeholder="Gudang Lantai 2" />
                  </Field>
                </Box>
              </Box>
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
        </Box>
        <ModalFooter onCancel={closeModal} onSave={save} saveLabel={isEdit ? 'Simpan perubahan' : 'Simpan'} />
      </ModalShell>

      <Toast message={toastMsg} />
    </AppShell>
  );
}

