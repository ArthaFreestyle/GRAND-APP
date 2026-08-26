import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell, ROLE } from '@/components/shell/AppShell';
import {
  BackButton,
  Card,
  CardHead,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  KpiCard,
  OptionPicker,
  PagingBar,
  PrimaryButton,
  SearchBar,
  SecondaryButton,
  TextField,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, tanggal, todayISO } from '@/constants/theme-erp';

const PAGE_SIZE = 8;
const TODAY = todayISO();

interface RuangRef { id: number; nama: string }
interface ProdRef { kode: string; nama: string; unit: string }
interface OpItem { kode: string; sistem: number; fisik: number | null }
interface Session {
  id: number;
  no: string;
  ruang: number;
  tanggal: string;
  status: 'draft' | 'selesai';
  petugas: string;
  catatan: string;
  items: OpItem[];
}

const RUANG: RuangRef[] = [
  { id: 1, nama: 'Ruang Toko Depan' },
  { id: 2, nama: 'Gudang Belakang' },
  { id: 3, nama: 'Cabang Bekasi' },
];
const PRODS: ProdRef[] = [
  { kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', unit: 'pcs' },
  { kode: 'BRG-002', nama: 'Pulpen Standard AE8 Biru 0,7', unit: 'pcs' },
  { kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', unit: 'rim' },
  { kode: 'BRG-011', nama: 'HVS Sinar Dunia A4 80gr', unit: 'rim' },
  { kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', unit: 'pcs' },
  { kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', unit: 'pcs' },
  { kode: 'BRG-040', nama: 'Isi Staples No. 3 (kecil)', unit: 'box' },
  { kode: 'BRG-061', nama: 'Penggaris Besi 30cm', unit: 'pcs' },
  { kode: 'BRG-062', nama: 'Amplop Coklat A4', unit: 'pcs' },
  { kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', unit: 'pcs' },
  { kode: 'BRG-080', nama: 'Lakban Bening 2 inch', unit: 'pcs' },
];
// Live "system" stock per ruang — mutated by posting an opname (matches the design's
// module-level `stok` map that a posted session writes back into).
const STOK: Record<string, Record<number, number>> = {
  'BRG-001': { 1: 148, 2: 620, 3: 96 }, 'BRG-002': { 1: 96, 2: 410, 3: 0 },
  'BRG-010': { 1: 170, 2: 340, 3: 40 }, 'BRG-011': { 1: 6, 2: 22, 3: 0 },
  'BRG-020': { 1: 210, 2: 1200, 3: 150 }, 'BRG-030': { 1: 320, 2: 900, 3: 210 },
  'BRG-040': { 1: 3, 2: 14, 3: 0 }, 'BRG-061': { 1: 40, 2: 60, 3: 0 },
  'BRG-062': { 1: 250, 2: 480, 3: 100 }, 'BRG-071': { 1: 11, 2: 26, 3: 4 },
  'BRG-080': { 1: 61, 2: 240, 3: 12 },
};

const INITIAL: Session[] = [
  { id: 1, no: 'SO-2608-0004', ruang: 2, tanggal: '2026-08-19', status: 'draft', petugas: 'admin.rina', catatan: 'Opname bulanan gudang belakang',
    items: [
      { kode: 'BRG-001', sistem: 620, fisik: 618 }, { kode: 'BRG-002', sistem: 410, fisik: 410 },
      { kode: 'BRG-010', sistem: 340, fisik: 342 }, { kode: 'BRG-011', sistem: 22, fisik: 20 },
      { kode: 'BRG-020', sistem: 1200, fisik: null }, { kode: 'BRG-030', sistem: 900, fisik: null },
      { kode: 'BRG-040', sistem: 14, fisik: null }, { kode: 'BRG-061', sistem: 60, fisik: null },
      { kode: 'BRG-062', sistem: 480, fisik: null }, { kode: 'BRG-071', sistem: 26, fisik: null },
      { kode: 'BRG-080', sistem: 240, fisik: null },
    ] },
  { id: 2, no: 'SO-2608-0002', ruang: 1, tanggal: '2026-08-05', status: 'selesai', petugas: 'admin.rina', catatan: 'Opname awal bulan toko depan',
    items: [
      { kode: 'BRG-001', sistem: 150, fisik: 148 }, { kode: 'BRG-002', sistem: 96, fisik: 96 },
      { kode: 'BRG-010', sistem: 168, fisik: 170 }, { kode: 'BRG-011', sistem: 8, fisik: 6 },
      { kode: 'BRG-020', sistem: 205, fisik: 210 }, { kode: 'BRG-030', sistem: 320, fisik: 320 },
      { kode: 'BRG-040', sistem: 5, fisik: 3 }, { kode: 'BRG-061', sistem: 40, fisik: 40 },
      { kode: 'BRG-062', sistem: 250, fisik: 250 }, { kode: 'BRG-071', sistem: 12, fisik: 11 },
      { kode: 'BRG-080', sistem: 63, fisik: 61 },
    ] },
  { id: 3, no: 'SO-2607-0009', ruang: 3, tanggal: '2026-07-30', status: 'selesai', petugas: 'owner.hadi', catatan: 'Opname cabang triwulan',
    items: [
      { kode: 'BRG-001', sistem: 100, fisik: 96 }, { kode: 'BRG-010', sistem: 38, fisik: 40 },
      { kode: 'BRG-020', sistem: 150, fisik: 150 }, { kode: 'BRG-030', sistem: 210, fisik: 208 },
      { kode: 'BRG-062', sistem: 100, fisik: 100 }, { kode: 'BRG-071', sistem: 4, fisik: 4 },
      { kode: 'BRG-080', sistem: 12, fisik: 12 },
    ] },
];

interface Draft {
  fromId: number | null;
  no: string | null;
  ruang: number;
  tanggal: string;
  catatan: string;
  items: OpItem[];
  wsFilter: 'semua' | 'belum' | 'selisih';
  err: string;
}

function ruangNama(id: number) { return RUANG.find((r) => r.id === id)?.nama ?? '—'; }
function prod(kode: string) { return PRODS.find((p) => p.kode === kode); }
function prodNama(kode: string) { return prod(kode)?.nama ?? kode; }
function prodUnit(kode: string) { return prod(kode)?.unit ?? ''; }
function netLabel(n: number) { return (n > 0 ? '+' : '') + num(n); }
function netColor(n: number) { return n > 0 ? C.green : n < 0 ? C.red : C.muted3; }
function countedItems(items: OpItem[]) { return items.filter((it) => it.fisik !== null); }
function varianceItems(items: OpItem[]) { return countedItems(items).filter((it) => (it.fisik as number) - it.sistem !== 0); }
function netSelisih(items: OpItem[]) { return countedItems(items).reduce((s, it) => s + ((it.fisik as number) - it.sistem), 0); }

function snapshot(ruangId: number): OpItem[] {
  return PRODS.map((p) => ({ kode: p.kode, sistem: STOK[p.kode]?.[ruangId] ?? 0, fisik: null }));
}
function freshDraft(): Draft {
  const ruangId = RUANG[1].id;
  return { fromId: null, no: null, ruang: ruangId, tanggal: TODAY, catatan: '', items: snapshot(ruangId), wsFilter: 'semua', err: '' };
}
function loadDraft(t: Session): Draft {
  return { fromId: t.id, no: t.no, ruang: t.ruang, tanggal: t.tanggal, catatan: t.catatan || '', items: t.items.map((it) => ({ ...it })), wsFilter: 'semua', err: '' };
}

export default function StokOpnameScreen() {
  const [sessions, setSessions] = useState<Session[]>(INITIAL);
  const [seq, setSeq] = useState(300);
  const [soSeq, setSoSeq] = useState(4);
  const [view, setView] = useState<'list' | 'count' | 'detail'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'semua' | 'draft' | 'selesai'>('semua');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = ROLE !== 'STAFF';

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  const berjalanCount = sessions.filter((t) => t.status === 'draft').length;
  const selesaiCount = sessions.filter((t) => t.status === 'selesai').length;
  const selisihCount = sessions.filter((t) => t.status === 'selesai').reduce((sum, t) => sum + varianceItems(t.items).length, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((t) => {
        if (status !== 'semua' && t.status !== status) return false;
        if (!q) return true;
        return t.no.toLowerCase().includes(q) || ruangNama(t.ruang).toLowerCase().includes(q) || t.petugas.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
        return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id;
      });
  }, [sessions, query, status]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = sessions.find((t) => t.id === openId) ?? null;

  function setFisik(i: number, val: string) {
    if (!draft) return;
    const items = draft.items.map((it, j) => (j === i ? { ...it, fisik: val === '' ? null : (parseInt(val.replace(/[^\d]/g, ''), 10) || 0) } : it));
    setDraft({ ...draft, items, err: '' });
  }

  function commit(post: boolean) {
    if (!draft) return;
    const counted = draft.items.filter((it) => it.fisik !== null);
    if (!counted.length) return setDraft({ ...draft, err: '400 — isi minimal satu hitungan fisik.' });
    if (post && counted.length < draft.items.length) {
      return setDraft({ ...draft, err: `400 — ${draft.items.length - counted.length} item belum dihitung. Posting butuh seluruh item terhitung — simpan draft untuk lanjut nanti.` });
    }
    const ym = draft.tanggal.slice(2, 4) + draft.tanggal.slice(5, 7);
    let no = draft.no;
    let newSoSeq = soSeq;
    let id: number;
    if (draft.fromId) {
      id = draft.fromId;
    } else {
      newSoSeq = soSeq + 1;
      no = `SO-${ym}-${String(newSoSeq).padStart(4, '0')}`;
      id = seq + 1;
    }
    const rec: Session = { id, no: no as string, ruang: draft.ruang, tanggal: draft.tanggal, status: post ? 'selesai' : 'draft', petugas: 'admin.rina', catatan: draft.catatan.trim(), items: draft.items };

    if (post) {
      counted.forEach((it) => {
        if (!STOK[it.kode]) STOK[it.kode] = {};
        STOK[it.kode][draft.ruang] = it.fisik as number;
      });
    }

    setSessions((s) => {
      const exists = s.some((x) => x.id === id);
      return exists ? s.map((x) => (x.id === id ? rec : x)) : [...s, rec];
    });
    if (!draft.fromId) setSeq(id);
    setSoSeq(newSoSeq);
    setDraft(null);
    setView(post ? 'detail' : 'list');
    setOpenId(post ? id : null);

    if (post) {
      const nVar = draft.items.filter((it) => (it.fisik as number) - it.sistem !== 0).length;
      toast(`Opname ${no} diposting · ${nVar ? `${nVar} item disesuaikan di ${ruangNama(draft.ruang)}` : 'stok cocok, tidak ada penyesuaian'}`);
    } else {
      toast(`Draft ${no} disimpan · ${counted.length}/${draft.items.length} item terhitung`);
    }
  }

  const wsRows = draft
    ? draft.items
        .map((it, i) => {
          const counted = it.fisik !== null;
          const sel = counted ? (it.fisik as number) - it.sistem : 0;
          return { i, it, counted, sel };
        })
        .filter((r) => (draft.wsFilter === 'semua' ? true : draft.wsFilter === 'belum' ? !r.counted : r.counted && r.sel !== 0))
    : [];

  return (
    <AppShell title="Stok Opname">
      {view === 'list' && (
        <View style={styles.wrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nomor atau ruang" />
            <FilterPills
              options={[{ key: 'semua', label: 'Semua' }, { key: 'draft', label: 'Berjalan' }, { key: 'selesai', label: 'Selesai' }]}
              active={status}
              onPick={(k) => { setStatus(k); setPage(1); }}
            />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} opname</Text>
            {canWrite && <PrimaryButton label="Opname baru" onPress={() => { setDraft(freshDraft()); setView('count'); }} />}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <KpiCard label="Opname berjalan" value={num(berjalanCount)} color={berjalanCount > 0 ? C.amber : C.text} sub="sedang dihitung" />
            <KpiCard label="Opname selesai" value={num(selesaiCount)} sub="sudah terposting" />
            <KpiCard label="Selisih ditemukan" value={num(selisihCount)} color={selisihCount > 0 ? C.amber : C.text} sub="item disesuaikan" />
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>RUANG & DOKUMEN</Text>
              <Text style={[styles.thText, { width: 176 }]}>STATUS</Text>
              <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>HASIL</Text>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {slice.map((t) => {
                const isDraft = t.status === 'draft';
                const countedN = countedItems(t.items).length;
                const nVar = varianceItems(t.items).length;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      if (isDraft) {
                        if (canWrite) { setDraft(loadDraft(t)); setView('count'); }
                        else { setView('detail'); setOpenId(t.id); }
                      } else { setView('detail'); setOpenId(t.id); }
                    }}
                    style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={styles.namaText} numberOfLines={1}>{ruangNama(t.ruang)}</Text>
                      <Text style={styles.metaText} numberOfLines={1}>{t.no} · {tanggal(t.tanggal)} · {t.petugas}</Text>
                    </View>
                    <View style={{ width: 176 }}>
                      <View style={[styles.badge, { backgroundColor: isDraft ? C.amberBg : C.greenBg, borderColor: isDraft ? C.amberBorder : C.greenBorder }]}>
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDraft ? C.amber : C.green }}>{isDraft ? 'Berjalan' : 'Selesai'}</Text>
                      </View>
                    </View>
                    <View style={{ width: 150, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: isDraft ? C.amber : nVar ? C.amber : C.green }}>
                        {isDraft ? `${countedN}/${t.items.length}` : nVar ? `${nVar} selisih` : 'cocok'}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{isDraft ? 'dihitung' : `${t.items.length} item`}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {slice.length === 0 && <EmptyState title="Tidak ada opname yang cocok" sub="Coba kata kunci lain atau ubah filter status." />}
            </ScrollView>
            <PagingBar
              label={filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} dari ${filtered.length} · halaman ${currentPage}/${totalPage}` : '0 hasil'}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
            />
          </View>
        </View>
      )}

      {view === 'count' && draft && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          <View style={styles.detailHead}>
            <BackButton label={draft.fromId ? '← Daftar' : '← Batal'} onPress={() => { setView('list'); setDraft(null); }} />
            <Text style={styles.detailNo}>{draft.no || 'Opname baru'}</Text>
            <View style={[styles.badge, { backgroundColor: C.amberBg, borderColor: C.amberBorder }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.amber }}>Berjalan</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 13.5, color: C.muted2 }}>Nomor final dibuat saat opname diposting</Text>
          </View>

          <Card style={{ padding: 16, gap: 14, flexDirection: 'row', flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Field label="Ruang dihitung" hint={draft.fromId ? 'Terkunci — draft ini sudah berisi hitungan untuk ruang tersebut.' : undefined}>
                {draft.fromId ? (
                  <View style={styles.readout}><Text style={styles.readoutText}>{ruangNama(draft.ruang)}</Text></View>
                ) : (
                  <OptionPicker options={RUANG.map((r) => ({ value: String(r.id), label: r.nama }))} value={String(draft.ruang)}
                    onChange={(v) => setDraft({ ...draft, ruang: parseInt(v, 10), items: snapshot(parseInt(v, 10)), err: '' })} />
                )}
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label="Tanggal opname">
                <TextField value={draft.tanggal} onChangeText={(v) => setDraft({ ...draft, tanggal: v })} placeholder="YYYY-MM-DD" />
              </Field>
            </View>
            <View style={{ flex: 1.4, minWidth: 220 }}>
              <Field label="Catatan (opsional)">
                <TextField value={draft.catatan} onChangeText={(v) => setDraft({ ...draft, catatan: v })} placeholder="mis. opname bulanan gudang" />
              </Field>
            </View>
          </Card>

          <Card>
            <CardHead
              title="Lembar hitung"
              right={
                <FilterPills
                  options={[{ key: 'semua', label: 'Semua' }, { key: 'belum', label: 'Belum dihitung' }, { key: 'selisih', label: 'Ada selisih' }]}
                  active={draft.wsFilter}
                  onPick={(k) => setDraft({ ...draft, wsFilter: k })}
                />
              }
            />
            <View style={styles.wsHeadRow}>
              <Text style={{ flex: 1 }}>PRODUK</Text>
              <Text style={{ width: 120, textAlign: 'right' }}>STOK SISTEM</Text>
              <Text style={{ width: 140, textAlign: 'right' }}>STOK FISIK</Text>
              <Text style={{ width: 140, textAlign: 'right' }}>SELISIH</Text>
            </View>
            {wsRows.map(({ i, it, counted, sel }) => (
              <View key={it.kode} style={[styles.wsRow, { backgroundColor: counted && sel !== 0 ? '#FDFBF6' : '#fff' }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 15.5, fontWeight: '500' }} numberOfLines={1}>{prodNama(it.kode)}</Text>
                  <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode} · {prodUnit(it.kode)}</Text>
                </View>
                <Text style={{ width: 120, textAlign: 'right', fontSize: 16, fontWeight: '600', color: C.dark2 }}>{num(it.sistem)}</Text>
                <View style={{ width: 140, alignItems: 'flex-end' }}>
                  <View style={{ width: 120 }}>
                    <TextField
                      value={it.fisik === null ? '' : String(it.fisik)}
                      onChangeText={(v) => setFisik(i, v)}
                      keyboardType="numeric"
                      placeholder="—"
                    />
                  </View>
                </View>
                <Text style={{ width: 140, textAlign: 'right', fontSize: 16, fontWeight: '700', color: !counted ? '#C4C9D0' : netColor(sel) }}>
                  {!counted ? '—' : sel === 0 ? '0' : netLabel(sel)}
                </Text>
              </View>
            ))}
            {wsRows.length === 0 && <EmptyState title="Tidak ada item pada filter ini" sub="Ubah filter untuk melihat item lain." />}
          </Card>

          {(() => {
            const countedN = countedItems(draft.items).length;
            const totalN = draft.items.length;
            const nVar = varianceItems(draft.items).length;
            const net = netSelisih(draft.items);
            return (
              <View style={{ alignItems: 'flex-end' }}>
                <Card style={{ width: 400, maxWidth: '100%', padding: 16, gap: 12 }}>
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.muted3 }}>Item dihitung</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800' }}>{countedN} / {totalN}</Text>
                  </View>
                  <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
                    <Text style={{ fontSize: 14.5, color: C.muted3 }}>Item dengan selisih</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: nVar ? C.amber : C.green }}>{nVar ? `${nVar} item` : 'Tidak ada'}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.muted3 }}>Net penyesuaian</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: netColor(net) }}>{netLabel(net)} unit</Text>
                  </View>
                  <ErrorBanner message={draft.err} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <SecondaryButton label="Simpan draft" onPress={() => commit(false)} flex={1} />
                    <PrimaryButton label="Posting & sesuaikan" onPress={() => commit(true)} flex={1.4} />
                  </View>
                </Card>
              </View>
            );
          })()}
        </ScrollView>
      )}

      {view === 'detail' && current && current.status === 'selesai' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {(() => {
            const nVar = varianceItems(current.items).length;
            const net = netSelisih(current.items);
            return (
              <>
                <View style={styles.detailHead}>
                  <BackButton onPress={() => { setView('list'); setOpenId(null); }} />
                  <Text style={styles.detailNo}>{current.no}</Text>
                  <View style={[styles.badge, { backgroundColor: C.greenBg, borderColor: C.greenBorder }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.green }}>Selesai</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <KpiCard label="Ruang" value={ruangNama(current.ruang)} sub={`Dihitung oleh ${current.petugas}`} />
                  <KpiCard label="Tanggal opname" value={tanggal(current.tanggal)} sub={`${current.items.length} item dihitung`} />
                  <KpiCard label="Item dengan selisih" value={num(nVar)} color={nVar ? C.amber : C.green} sub={`net ${netLabel(net)}`} />
                </View>
                {!!current.catatan && (
                  <Card style={{ padding: 14 }}>
                    <Text style={{ fontSize: 12.5, color: C.muted2 }}>Catatan</Text>
                    <Text style={{ fontSize: 15, color: C.text, marginTop: 3, lineHeight: 20 }}>{current.catatan}</Text>
                  </Card>
                )}
                <Card>
                  <CardHead title="Hasil hitung" right={<Text style={{ fontSize: 13.5, color: C.muted2 }}>Stok sistem disesuaikan ke stok fisik saat posting</Text>} />
                  <View style={styles.wsHeadRow}>
                    <Text style={{ flex: 1 }}>PRODUK</Text>
                    <Text style={{ width: 120, textAlign: 'right' }}>SEBELUM</Text>
                    <Text style={{ width: 120, textAlign: 'right' }}>HASIL HITUNG</Text>
                    <Text style={{ width: 140, textAlign: 'right' }}>SELISIH</Text>
                  </View>
                  {current.items.map((it) => {
                    const sel = (it.fisik as number) - it.sistem;
                    return (
                      <View key={it.kode} style={[styles.wsRow, { backgroundColor: sel === 0 ? '#fff' : '#FDFBF6' }]}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={{ fontSize: 15.5, fontWeight: '500' }} numberOfLines={1}>{prodNama(it.kode)}</Text>
                          <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode} · {prodUnit(it.kode)}</Text>
                        </View>
                        <Text style={{ width: 120, textAlign: 'right', fontSize: 16, color: C.muted3 }}>{num(it.sistem)}</Text>
                        <Text style={{ width: 120, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>{num(it.fisik as number)}</Text>
                        <Text style={{ width: 140, textAlign: 'right', fontSize: 16, fontWeight: '700', color: netColor(sel) }}>{sel === 0 ? '0' : netLabel(sel)}</Text>
                      </View>
                    );
                  })}
                </Card>
              </>
            );
          })()}
        </ScrollView>
      )}

      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 18, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  countLabel: { fontSize: 14, color: C.muted3 },
  tableCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 48, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 74, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  namaText: { fontSize: 16.5, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  badge: { height: 26, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  wsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 40, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 58, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  readout: { height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.borderCard, backgroundColor: C.badgeBg },
  readoutText: { fontSize: 15, color: C.dark2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
