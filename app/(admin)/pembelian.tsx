import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  BackButton,
  Badge,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  OptionPicker,
  PagingBar,
  PrimaryButton,
  SearchBar,
  StatTile,
  TextField,
  TinyButton,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, addDays, rp, rpShort, tanggal, todayISO } from '@/constants/theme-erp';

const PAGE_SIZE = 8;
const TODAY = todayISO();

interface SupplierRef { id: number; kode: string; nama: string; tempo: number }
interface ProdRef { kode: string; nama: string; hargaBeli: number; satuan: { u: string; f: number }[] }
interface FakturItem { kode: string; qty: number; satuan: string; harga: number }
interface Faktur { id: number; no: string; supId: number; tanggal: string; dibayar: number; items: FakturItem[] }

const SUPPLIERS: SupplierRef[] = [
  { id: 1, kode: 'SUP-001', nama: 'PT Sinar Dunia Distribusi', tempo: 30 },
  { id: 2, kode: 'SUP-002', nama: 'CV Tiga Roda ATK', tempo: 21 },
  { id: 3, kode: 'SUP-003', nama: 'PT Faber-Castell Indonesia', tempo: 45 },
  { id: 5, kode: 'SUP-005', nama: 'PT Standardpen Industries', tempo: 30 },
  { id: 8, kode: 'SUP-008', nama: 'CV Lakban Sejahtera', tempo: 21 },
];
const PRODS: ProdRef[] = [
  { kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', hargaBeli: 2600, satuan: [{ u: 'pcs', f: 1 }, { u: 'lusin', f: 12 }] },
  { kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', hargaBeli: 42000, satuan: [{ u: 'rim', f: 1 }, { u: 'dus', f: 5 }] },
  { kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', hargaBeli: 3200, satuan: [{ u: 'pcs', f: 1 }, { u: 'pak', f: 10 }] },
  { kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', hargaBeli: 2100, satuan: [{ u: 'pcs', f: 1 }, { u: 'lusin', f: 12 }] },
  { kode: 'BRG-080', nama: 'Lakban Bening 2 inch', hargaBeli: 8500, satuan: [{ u: 'pcs', f: 1 }, { u: 'box', f: 24 }] },
  { kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', hargaBeli: 68000, satuan: [{ u: 'pcs', f: 1 }] },
];

const INITIAL: Faktur[] = [
  { id: 1, no: 'FB-2608-0060', supId: 3, tanggal: '2026-08-05', dibayar: 0,
    items: [{ kode: 'BRG-030', qty: 300, satuan: 'lusin', harga: 25200 }, { kode: 'BRG-001', qty: 300, satuan: 'lusin', harga: 31200 }] },
  { id: 2, no: 'FB-2608-0044', supId: 1, tanggal: '2026-08-13', dibayar: 0,
    items: [{ kode: 'BRG-010', qty: 250, satuan: 'rim', harga: 42000 }, { kode: 'BRG-010', qty: 20, satuan: 'dus', harga: 210000 }] },
  { id: 3, no: 'FB-2608-0051', supId: 2, tanggal: '2026-08-16', dibayar: 0,
    items: [{ kode: 'BRG-020', qty: 200, satuan: 'pak', harga: 32000 }, { kode: 'BRG-080', qty: 100, satuan: 'pcs', harga: 8500 }] },
  { id: 4, no: 'FB-2607-0091', supId: 1, tanggal: '2026-07-15', dibayar: 6000000,
    items: [{ kode: 'BRG-010', qty: 200, satuan: 'rim', harga: 42000 }, { kode: 'BRG-010', qty: 15, satuan: 'dus', harga: 210000 }] },
  { id: 5, no: 'FB-2607-0122', supId: 5, tanggal: '2026-07-18', dibayar: 12480000,
    items: [{ kode: 'BRG-001', qty: 400, satuan: 'lusin', harga: 31200 }] },
  { id: 6, no: 'FB-2606-0140', supId: 2, tanggal: '2026-06-25', dibayar: 4000000,
    items: [{ kode: 'BRG-020', qty: 150, satuan: 'pak', harga: 32000 }, { kode: 'BRG-030', qty: 100, satuan: 'lusin', harga: 25200 }] },
  { id: 7, no: 'FB-2608-0021', supId: 8, tanggal: '2026-08-16', dibayar: 0,
    items: [{ kode: 'BRG-080', qty: 40, satuan: 'box', harga: 204000 }] },
];

interface Draft {
  supId: string;
  tanggal: string;
  dibayar: string;
  items: FakturItem[];
  rowKode: string;
  rowSatuan: string | null;
  rowQty: string;
  rowHarga: string;
  err: string;
}
function freshDraft(): Draft {
  return { supId: '', tanggal: TODAY, dibayar: '0', items: [], rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' };
}

function sup(id: number) { return SUPPLIERS.find((x) => x.id === id); }
function prod(kode: string) { return PRODS.find((x) => x.kode === kode); }
function prodNama(kode: string) { return prod(kode)?.nama ?? kode; }
function totalOf(f: Faktur) { return f.items.reduce((s, it) => s + it.qty * it.harga, 0); }
function jatuhOf(f: Faktur) { const s = sup(f.supId); return s && s.tempo > 0 ? addDays(f.tanggal, s.tempo) : null; }
function statusOf(f: Faktur) {
  const sisa = totalOf(f) - f.dibayar;
  if (sisa <= 0) return { key: 'lunas', label: 'Lunas', color: C.green, bg: C.greenBg, border: C.greenBorder };
  const j = jatuhOf(f);
  if (j && j < TODAY) return { key: 'telat', label: 'Jatuh tempo', color: C.red, bg: C.redBg, border: C.redBorder };
  if (f.dibayar > 0) return { key: 'sebagian', label: 'Bayar sebagian', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder };
  return { key: 'belum', label: 'Belum dibayar', color: C.amber, bg: C.amberBg, border: C.amberBorder };
}

export default function PembelianScreen() {
  const [faktur, setFaktur] = useState<Faktur[]>(INITIAL);
  const [seq, setSeq] = useState(100);
  const [noSeq, setNoSeq] = useState(61);
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'semua' | 'belum' | 'lunas'>('semua');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('pembelian');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faktur
      .filter((f) => {
        const sisa = totalOf(f) - f.dibayar;
        if (status === 'belum' && sisa <= 0) return false;
        if (status === 'lunas' && sisa > 0) return false;
        if (!q) return true;
        const s = sup(f.supId);
        return f.no.toLowerCase().includes(q) || (s ? s.nama.toLowerCase().includes(q) : false);
      })
      .slice()
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));
  }, [faktur, query, status]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = faktur.find((f) => f.id === openId) ?? null;

  const openList = faktur.filter((f) => totalOf(f) - f.dibayar > 0);
  const overdueList = openList.filter((f) => { const j = jatuhOf(f); return j && j < TODAY; });
  const sumHutang = openList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumOverdue = overdueList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumTotal = faktur.reduce((a, f) => a + totalOf(f), 0);

  function addRow() {
    if (!draft) return;
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    const harga = parseInt(String(draft.rowHarga || '').replace(/\D/g, ''), 10);
    if (Number.isNaN(harga) || harga <= 0) return setDraft({ ...draft, err: '400 — harga beli wajib diisi.' });
    const items = [...draft.items, { kode: draft.rowKode, qty, satuan: draft.rowSatuan ?? '', harga }];
    setDraft({ ...draft, items, rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' });
  }

  function save() {
    if (!draft) return;
    if (!draft.supId) return setDraft({ ...draft, err: '400 — pilih supplier dulu.' });
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    const total = draft.items.reduce((s, it) => s + it.qty * it.harga, 0);
    const dibayar = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
    if (dibayar > total) return setDraft({ ...draft, err: '400 — pembayaran melebihi total faktur.' });
    const ym = draft.tanggal.slice(2, 4) + draft.tanggal.slice(5, 7);
    const newNoSeq = noSeq + 1;
    const no = `FB-${ym}-${String(newNoSeq).padStart(4, '0')}`;
    const id = seq + 1;
    const supId = parseInt(draft.supId, 10);
    const fak: Faktur = { id, no, supId, tanggal: draft.tanggal, dibayar, items: draft.items };
    setFaktur((l) => [...l, fak]);
    setSeq(id);
    setNoSeq(newNoSeq);
    setDraft(null);
    setView('detail');
    setOpenId(id);
    toast(`Faktur ${no} disimpan · hutang tercatat ke ${sup(supId)?.nama}`);
  }

  function payFull(f: Faktur) {
    setFaktur((l) => l.map((x) => (x.id === f.id ? { ...x, dibayar: totalOf(x) } : x)));
    toast(`Hutang faktur ${f.no} dilunasi`);
  }

  const rowProd = draft?.rowKode ? prod(draft.rowKode) : null;

  return (
    <AppShell title="Pembelian">
      {view === 'list' && (
        <View style={styles.wrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nomor faktur atau supplier" />
            <FilterPills
              options={[{ key: 'semua', label: 'Semua' }, { key: 'belum', label: 'Belum lunas' }, { key: 'lunas', label: 'Lunas' }]}
              active={status}
              onPick={(k) => { setStatus(k); setPage(1); }}
            />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} faktur</Text>
            {canWrite && <PrimaryButton label="Faktur baru" onPress={() => { setDraft(freshDraft()); setView('new'); }} />}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile label="Total hutang berjalan" value={rp(sumHutang)} color={C.red} sub={`${openList.length} faktur belum lunas`} />
            <StatTile label="Jatuh tempo terlewat" value={rp(sumOverdue)} color={sumOverdue > 0 ? C.red : C.text} sub={`${overdueList.length} faktur lewat tempo`} />
            <StatTile label="Nilai pembelian tercatat" value={rp(sumTotal)} sub={`${faktur.length} faktur`} />
          </View>

          <DataTable
            minWidth={640}
            head={
              <View style={styles.tableHeadRow}>
                <Text style={[styles.thText, { flex: 1 }]}>SUPPLIER & FAKTUR</Text>
                <Text style={[styles.thText, { width: 150 }]}>STATUS</Text>
                <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>TOTAL / SISA</Text>
              </View>
            }
            footer={
              <PagingBar
                label={filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} dari ${filtered.length} · halaman ${currentPage}/${totalPage}` : '0 hasil'}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPage, p + 1))}
              />
            }>
              {slice.map((f) => {
                const total = totalOf(f);
                const sisa = total - f.dibayar;
                const st = statusOf(f);
                const s = sup(f.supId);
                return (
                  <Pressable key={f.id} onPress={() => { setView('detail'); setOpenId(f.id); }} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={styles.namaText} numberOfLines={1}>{s ? s.nama : '—'}</Text>
                      <Text style={styles.metaText} numberOfLines={1}>{f.no} · {tanggal(f.tanggal)} · {f.items.length} item</Text>
                    </View>
                    <View style={{ width: 150 }}>
                      <Badge label={st.label} color={st.color} bg={st.bg} border={st.border} small />
                    </View>
                    <View style={{ width: 150, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>{rp(total)}</Text>
                      <Text style={{ fontSize: 12, color: sisa > 0 ? (st.key === 'telat' ? C.red : C.amber) : C.green }}>
                        {sisa > 0 ? `sisa ${rpShort(sisa)}` : 'lunas'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {slice.length === 0 && <EmptyState title="Tidak ada faktur yang cocok" sub="Coba kata kunci lain atau ubah filter status." />}
          </DataTable>
        </View>
      )}

      {view === 'detail' && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {(() => {
            const total = totalOf(current);
            const sisa = total - current.dibayar;
            const st = statusOf(current);
            const s = sup(current.supId);
            const j = jatuhOf(current);
            const overdue = sisa > 0 && !!j && j < TODAY;
            return (
              <>
                <View style={styles.detailHead}>
                  <BackButton onPress={() => { setView('list'); setOpenId(null); }} />
                  <Text style={styles.detailNo}>{current.no}</Text>
                  <Badge label={st.label} color={st.color} bg={st.bg} border={st.border} />
                  <View style={{ flex: 1 }} />
                  {canWrite && sisa > 0 && <PrimaryButton label="Lunasi hutang" onPress={() => payFull(current)} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <StatTile label="Total faktur" value={rp(total)} sub={`${current.items.length} jenis item`} />
                  <StatTile label="Sudah dibayar" value={rp(current.dibayar)} color={C.green} sub={current.dibayar <= 0 ? 'Belum ada pembayaran' : current.dibayar >= total ? 'Faktur lunas' : 'Sebagian dari total'} />
                  <StatTile label="Sisa hutang" value={rp(sisa)} color={sisa <= 0 ? C.text : overdue ? C.red : C.text}
                    sub={sisa <= 0 ? 'Tidak ada hutang' : j ? (overdue ? `Lewat tempo ${tanggal(j)}` : `Jatuh tempo ${tanggal(j)}`) : 'Tunai — bayar di tempat'}
                    subColor={overdue ? C.red : C.muted} />
                </View>
                <Card>
                  <CardHead title={s ? s.nama : '—'} right={<Text style={{ fontSize: 13.5, color: C.muted3 }}>Faktur {tanggal(current.tanggal)} · tempo {s && s.tempo > 0 ? `${s.tempo} hari` : 'tunai'}</Text>} />
                  <View style={styles.itemsHeadRow}>
                    <Text style={{ flex: 1 }}>PRODUK</Text>
                    <Text style={{ width: 110, textAlign: 'right' }}>QTY</Text>
                    <Text style={{ width: 140, textAlign: 'right' }}>HARGA</Text>
                    <Text style={{ width: 150, textAlign: 'right' }}>SUBTOTAL</Text>
                  </View>
                  {current.items.map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={{ fontSize: 15.5, fontWeight: '500' }}>{prodNama(it.kode)}</Text>
                        <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode}</Text>
                      </View>
                      <Text style={{ width: 110, textAlign: 'right', fontSize: 15 }}>{it.qty.toLocaleString('id-ID')} {it.satuan}</Text>
                      <Text style={{ width: 140, textAlign: 'right', fontSize: 15, color: C.dark2 }}>{rp(it.harga)}</Text>
                      <Text style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>{rp(it.qty * it.harga)}</Text>
                    </View>
                  ))}
                  <View style={styles.itemsFoot}>
                    <Text style={{ fontSize: 14, color: C.muted3 }}>Total faktur</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.2 }}>{rp(total)}</Text>
                  </View>
                </Card>
              </>
            );
          })()}
        </ScrollView>
      )}

      {view === 'new' && draft && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          <View style={styles.detailHead}>
            <BackButton label="← Batal" onPress={() => { setView('list'); setDraft(null); }} />
            <Text style={[styles.detailNo, { fontFamily: undefined, fontWeight: '800' }]}>Faktur pembelian baru</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 13.5, color: C.muted2 }}>Nomor faktur dibuat otomatis saat disimpan</Text>
          </View>

          <Card style={{ padding: 16, gap: 14, flexDirection: 'row', flexWrap: 'wrap' }}>
            <View style={{ flex: 2, minWidth: 240 }}>
              <Field label="Supplier">
                <OptionPicker options={SUPPLIERS.map((s) => ({ value: String(s.id), label: `${s.kode} · ${s.nama}` }))} value={draft.supId || null} onChange={(v) => setDraft({ ...draft, supId: v, err: '' })} />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label="Tanggal faktur">
                <TextField value={draft.tanggal} onChangeText={(v) => setDraft({ ...draft, tanggal: v })} placeholder="YYYY-MM-DD" />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Field label="Tempo / jatuh tempo">
                <View style={styles.readout}>
                  <Text style={styles.readoutText}>
                    {draft.supId
                      ? (() => { const s = sup(parseInt(draft.supId, 10)); return s ? (s.tempo > 0 ? `${s.tempo} hari → jatuh ${tanggal(addDays(draft.tanggal, s.tempo))}` : 'Tunai — bayar di tempat') : ''; })()
                      : 'Pilih supplier dulu'}
                  </Text>
                </View>
              </Field>
            </View>
          </Card>

          <Card>
            <CardHead title="Item pembelian" />
            <View style={styles.addRow}>
              <View style={{ flex: 2, minWidth: 180 }}>
                <Field label="PRODUK">
                  <OptionPicker options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))} value={draft.rowKode || null}
                    onChange={(v) => {
                      const p = prod(v);
                      const satuan = p ? p.satuan[0].u : null;
                      const harga = p ? String(p.hargaBeli * p.satuan[0].f) : '';
                      setDraft({ ...draft, rowKode: v, rowSatuan: satuan, rowHarga: harga, err: '' });
                    }} />
                </Field>
              </View>
              <View style={{ width: 100 }}>
                <Field label="QTY">
                  <TextField value={draft.rowQty} onChangeText={(v) => setDraft({ ...draft, rowQty: v, err: '' })} keyboardType="numeric" placeholder="0" />
                </Field>
              </View>
              <View style={{ width: 130 }}>
                <Field label="SATUAN">
                  <OptionPicker options={(rowProd?.satuan ?? []).map((u) => ({ value: u.u, label: u.u }))} value={draft.rowSatuan}
                    onChange={(v) => {
                      const sf = rowProd?.satuan.find((u) => u.u === v);
                      const harga = sf && rowProd ? String(rowProd.hargaBeli * sf.f) : draft.rowHarga;
                      setDraft({ ...draft, rowSatuan: v, rowHarga: harga });
                    }} />
                </Field>
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Field label="HARGA BELI / SATUAN">
                  <TextField value={draft.rowHarga} onChangeText={(v) => setDraft({ ...draft, rowHarga: v, err: '' })} keyboardType="numeric" placeholder="0" />
                </Field>
              </View>
              <PrimaryButton label="Tambah" onPress={addRow} />
            </View>
            <View style={styles.itemsHeadRow}>
              <Text style={{ flex: 1 }}>PRODUK</Text>
              <Text style={{ width: 100, textAlign: 'right' }}>QTY</Text>
              <Text style={{ width: 130, textAlign: 'right' }}>HARGA</Text>
              <Text style={{ width: 140, textAlign: 'right' }}>SUBTOTAL</Text>
              <View style={{ width: 80 }} />
            </View>
            {draft.items.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{prodNama(it.kode)}</Text>
                <Text style={{ width: 100, textAlign: 'right', fontSize: 14.5 }}>{it.qty.toLocaleString('id-ID')} {it.satuan}</Text>
                <Text style={{ width: 130, textAlign: 'right', fontSize: 14.5, color: C.dark2 }}>{rp(it.harga)}</Text>
                <Text style={{ width: 140, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>{rp(it.qty * it.harga)}</Text>
                <View style={{ width: 80, alignItems: 'flex-end' }}>
                  <TinyButton label="Hapus" danger onPress={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} />
                </View>
              </View>
            ))}
            {draft.items.length === 0 && <EmptyState title="Belum ada item" sub="Pilih produk, isi qty dan harga beli, lalu klik Tambah." />}
          </Card>

          {(() => {
            const total = draft.items.reduce((a, it) => a + it.qty * it.harga, 0);
            const dibayarNum = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
            const sisa = total - dibayarNum;
            return (
              <View style={{ alignItems: 'flex-end' }}>
                <Card style={{ width: 380, maxWidth: '100%', padding: 16, gap: 12 }}>
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total faktur</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800' }}>{rp(total)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.dark2 }}>Bayar sekarang</Text>
                    <View style={{ width: 170 }}>
                      <TextField value={draft.dibayar} onChangeText={(v) => setDraft({ ...draft, dibayar: v, err: '' })} keyboardType="numeric" placeholder="0" />
                    </View>
                  </View>
                  <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
                    <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Sisa hutang</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: sisa > 0 ? C.red : C.green }}>{rp(Math.max(0, sisa))}</Text>
                  </View>
                  <ErrorBanner message={draft.err} />
                  <PrimaryButton label="Simpan faktur" onPress={save} />
                </Card>
              </View>
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
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 48, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 74, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  itemsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 40, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  itemsFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20, padding: 14, backgroundColor: C.tableHeaderBg, borderTopWidth: 1, borderTopColor: C.borderLight },
  readout: { height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.borderLight, backgroundColor: '#F7F8FA' },
  readoutText: { fontSize: 13.5, color: C.dark2 },
  addRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
