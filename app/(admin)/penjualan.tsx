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

interface CustRef { id: number; kode: string; nama: string; limit: number; tempo: number }
interface ProdRef { kode: string; nama: string; satuan: { u: string; harga: number }[] }
interface NotaItem { kode: string; qty: number; satuan: string; harga: number }
interface Nota { id: number; no: string; custId: number; tanggal: string; dibayar: number; items: NotaItem[] }

const CUSTOMERS: CustRef[] = [
  { id: 0, kode: '—', nama: 'Pelanggan Umum (tunai)', limit: 0, tempo: 0 },
  { id: 1, kode: 'PLG-001', nama: 'CV Sinar Jaya', limit: 20000000, tempo: 30 },
  { id: 2, kode: 'PLG-002', nama: 'Toko Berkah ATK', limit: 15000000, tempo: 21 },
  { id: 3, kode: 'PLG-003', nama: 'Budi Santoso', limit: 0, tempo: 0 },
  { id: 4, kode: 'PLG-004', nama: 'SDN Menteng 01 Pagi', limit: 25000000, tempo: 45 },
  { id: 5, kode: 'PLG-005', nama: 'PT Maju Bersama Sentosa', limit: 30000000, tempo: 30 },
];
const PRODS: ProdRef[] = [
  { kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', satuan: [{ u: 'pcs', harga: 3500 }, { u: 'lusin', harga: 38000 }] },
  { kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', satuan: [{ u: 'rim', harga: 52000 }, { u: 'dus', harga: 250000 }] },
  { kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', satuan: [{ u: 'pcs', harga: 4200 }, { u: 'pak', harga: 39000 }] },
  { kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', satuan: [{ u: 'pcs', harga: 2800 }, { u: 'lusin', harga: 31000 }] },
  { kode: 'BRG-080', nama: 'Lakban Bening 2 inch', satuan: [{ u: 'pcs', harga: 11500 }] },
  { kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', satuan: [{ u: 'pcs', harga: 82000 }] },
];

const INITIAL: Nota[] = [
  { id: 1, no: 'INV-2608-0142', custId: 1, tanggal: '2026-08-14', dibayar: 0,
    items: [{ kode: 'BRG-010', qty: 15, satuan: 'dus', harga: 250000 }, { kode: 'BRG-001', qty: 12, satuan: 'lusin', harga: 38000 }] },
  { id: 2, no: 'INV-2608-0090', custId: 1, tanggal: '2026-08-05', dibayar: 0,
    items: [{ kode: 'BRG-010', qty: 60, satuan: 'rim', harga: 52000 }, { kode: 'BRG-020', qty: 30, satuan: 'pak', harga: 39000 }] },
  { id: 3, no: 'INV-2607-0311', custId: 1, tanggal: '2026-07-22', dibayar: 3100000,
    items: [{ kode: 'BRG-030', qty: 100, satuan: 'lusin', harga: 31000 }] },
  { id: 4, no: 'INV-2608-0155', custId: 2, tanggal: '2026-08-16', dibayar: 0,
    items: [{ kode: 'BRG-020', qty: 120, satuan: 'pak', harga: 39000 }, { kode: 'BRG-001', qty: 80, satuan: 'lusin', harga: 38000 }] },
  { id: 5, no: 'INV-2608-0160', custId: 3, tanggal: '2026-08-17', dibayar: 175000,
    items: [{ kode: 'BRG-001', qty: 20, satuan: 'pcs', harga: 3500 }, { kode: 'BRG-020', qty: 25, satuan: 'pcs', harga: 4200 }] },
  { id: 6, no: 'INV-2608-0120', custId: 4, tanggal: '2026-08-11', dibayar: 0,
    items: [{ kode: 'BRG-010', qty: 40, satuan: 'rim', harga: 52000 }, { kode: 'BRG-071', qty: 12, satuan: 'pcs', harga: 82000 }] },
  { id: 7, no: 'INV-2607-0299', custId: 5, tanggal: '2026-07-18', dibayar: 9225000,
    items: [{ kode: 'BRG-010', qty: 30, satuan: 'dus', harga: 250000 }, { kode: 'BRG-080', qty: 150, satuan: 'pcs', harga: 11500 }] },
  { id: 8, no: 'INV-2606-0140', custId: 2, tanggal: '2026-06-20', dibayar: 2000000,
    items: [{ kode: 'BRG-020', qty: 100, satuan: 'pak', harga: 39000 }] },
];

interface Draft {
  custId: string;
  tanggal: string;
  dibayar: string;
  items: NotaItem[];
  rowKode: string;
  rowSatuan: string | null;
  rowQty: string;
  rowHarga: string;
  err: string;
}
function freshDraft(): Draft {
  return { custId: '', tanggal: TODAY, dibayar: '0', items: [], rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' };
}

function cust(id: number) { return CUSTOMERS.find((x) => x.id === id); }
function prod(kode: string) { return PRODS.find((x) => x.kode === kode); }
function prodNama(kode: string) { return prod(kode)?.nama ?? kode; }
function totalOf(f: Nota) { return f.items.reduce((s, it) => s + it.qty * it.harga, 0); }
function jatuhOf(f: Nota) { const c = cust(f.custId); return c && c.tempo > 0 ? addDays(f.tanggal, c.tempo) : null; }
function statusOf(f: Nota) {
  const sisa = totalOf(f) - f.dibayar;
  if (sisa <= 0) return { key: 'lunas', label: 'Lunas', tone: 'green' as const };
  const j = jatuhOf(f);
  if (j && j < TODAY) return { key: 'telat', label: 'Jatuh tempo', tone: 'red' as const };
  if (f.dibayar > 0) return { key: 'sebagian', label: 'Bayar sebagian', tone: 'primary' as const };
  return { key: 'belum', label: 'Belum dibayar', tone: 'amber' as const };
}

export default function PenjualanScreen() {
  const [nota, setNota] = useState<Nota[]>(INITIAL);
  const [seq, setSeq] = useState(100);
  const [noSeq, setNoSeq] = useState(170);
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'semua' | 'belum' | 'lunas'>('semua');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('penjualan');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  function piutangCust(custId: number, exceptId: number | null) {
    return nota.filter((n) => n.custId === custId && n.id !== exceptId).reduce((a, n) => a + (totalOf(n) - n.dibayar), 0);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nota
      .filter((f) => {
        const sisa = totalOf(f) - f.dibayar;
        if (status === 'belum' && sisa <= 0) return false;
        if (status === 'lunas' && sisa > 0) return false;
        if (!q) return true;
        const c = cust(f.custId);
        return f.no.toLowerCase().includes(q) || (c ? c.nama.toLowerCase().includes(q) : false);
      })
      .slice()
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));
  }, [nota, query, status]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = nota.find((f) => f.id === openId) ?? null;

  const openList = nota.filter((f) => totalOf(f) - f.dibayar > 0);
  const overdueList = openList.filter((f) => { const j = jatuhOf(f); return j && j < TODAY; });
  const sumPiutang = openList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumOverdue = overdueList.reduce((a, f) => a + (totalOf(f) - f.dibayar), 0);
  const sumTotal = nota.reduce((a, f) => a + totalOf(f), 0);

  function addRow() {
    if (!draft) return;
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    const harga = parseInt(String(draft.rowHarga || '').replace(/\D/g, ''), 10);
    if (Number.isNaN(harga) || harga <= 0) return setDraft({ ...draft, err: '400 — harga jual wajib diisi.' });
    const items = [...draft.items, { kode: draft.rowKode, qty, satuan: draft.rowSatuan ?? '', harga }];
    setDraft({ ...draft, items, rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' });
  }

  function save() {
    if (!draft) return;
    if (draft.custId === '') return setDraft({ ...draft, err: '400 — pilih pelanggan dulu.' });
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    const custId = parseInt(draft.custId, 10);
    const c = cust(custId);
    const total = draft.items.reduce((s, it) => s + it.qty * it.harga, 0);
    const dibayar = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
    if (dibayar > total) return setDraft({ ...draft, err: '400 — pembayaran melebihi total nota.' });
    const sisaBaru = total - dibayar;
    if (c && c.limit > 0) {
      const terpakai = piutangCust(custId, null) + sisaBaru;
      if (terpakai > c.limit) {
        return setDraft({ ...draft, err: `409 — piutang ${rp(terpakai)} melebihi limit kredit ${rp(c.limit)}. Kurangi tempo atau minta pembayaran di muka.` });
      }
    }
    const ym = draft.tanggal.slice(2, 4) + draft.tanggal.slice(5, 7);
    const newNoSeq = noSeq + 1;
    const no = `INV-${ym}-${String(newNoSeq).padStart(4, '0')}`;
    const id = seq + 1;
    const rec: Nota = { id, no, custId, tanggal: draft.tanggal, dibayar, items: draft.items };
    setNota((l) => [...l, rec]);
    setSeq(id);
    setNoSeq(newNoSeq);
    setDraft(null);
    setView('detail');
    setOpenId(id);
    toast(`Nota ${no} disimpan${sisaBaru > 0 ? ` · piutang tercatat ke ${c?.nama}` : ' · lunas'}`);
  }

  function payFull(f: Nota) {
    setNota((l) => l.map((x) => (x.id === f.id ? { ...x, dibayar: totalOf(x) } : x)));
    toast(`Pelunasan nota ${f.no} diterima`);
  }

  const rowProd = draft?.rowKode ? prod(draft.rowKode) : null;

  return (
    <AppShell title="Penjualan">
      {view === 'list' && (
        <View style={styles.wrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nomor nota atau pelanggan" />
            <FilterPills
              options={[{ key: 'semua', label: 'Semua' }, { key: 'belum', label: 'Belum lunas' }, { key: 'lunas', label: 'Lunas' }]}
              active={status}
              onPick={(k) => { setStatus(k); setPage(1); }}
            />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} nota</Text>
            {canWrite && <PrimaryButton label="Nota baru" onPress={() => { setDraft(freshDraft()); setView('new'); }} />}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatTile label="Total piutang berjalan" value={rp(sumPiutang)} valueClass={'text-danger'} sub={`${openList.length} nota belum lunas`} />
            <StatTile label="Jatuh tempo terlewat" value={rp(sumOverdue)} valueClass={sumOverdue > 0 ? C.red : C.text} sub={`${overdueList.length} nota lewat tempo`} />
            <StatTile label="Nilai penjualan tercatat" value={rp(sumTotal)} sub={`${nota.length} nota`} />
          </View>

          <DataTable
            minWidth={640}
            head={
              <View style={styles.tableHeadRow}>
                <Text style={[styles.thText, { flex: 1 }]}>PELANGGAN & NOTA</Text>
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
                const c = cust(f.custId);
                return (
                  <Pressable key={f.id} onPress={() => { setView('detail'); setOpenId(f.id); }} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={styles.namaText} numberOfLines={1}>{c ? c.nama : '—'}</Text>
                      <Text style={styles.metaText} numberOfLines={1}>{f.no} · {tanggal(f.tanggal)} · {f.items.length} item</Text>
                    </View>
                    <View style={{ width: 150 }}>
                      <Badge label={st.label} tone={st.tone} small />
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
              {slice.length === 0 && <EmptyState title="Tidak ada nota yang cocok" sub="Coba kata kunci lain atau ubah filter status." />}
          </DataTable>
        </View>
      )}

      {view === 'detail' && current && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
          {(() => {
            const total = totalOf(current);
            const sisa = total - current.dibayar;
            const st = statusOf(current);
            const c = cust(current.custId);
            const j = jatuhOf(current);
            const overdue = sisa > 0 && !!j && j < TODAY;
            return (
              <>
                <View style={styles.detailHead}>
                  <BackButton onPress={() => { setView('list'); setOpenId(null); }} />
                  <Text style={styles.detailNo}>{current.no}</Text>
                  <Badge label={st.label} tone={st.tone} />
                  <View style={{ flex: 1 }} />
                  {canWrite && sisa > 0 && <PrimaryButton label="Terima pelunasan" onPress={() => payFull(current)} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <StatTile label="Total nota" value={rp(total)} sub={`${current.items.length} jenis item`} />
                  <StatTile label="Sudah diterima" value={rp(current.dibayar)} valueClass={'text-green'} sub={current.dibayar <= 0 ? 'Belum ada pembayaran' : current.dibayar >= total ? 'Nota lunas' : 'Sebagian dari total'} />
                  <StatTile label="Sisa piutang" value={rp(sisa)} valueClass={sisa <= 0 ? 'text-foreground' : overdue ? 'text-danger' : 'text-foreground'}
                    sub={sisa <= 0 ? 'Tidak ada piutang' : j ? (overdue ? `Lewat tempo ${tanggal(j)}` : `Jatuh tempo ${tanggal(j)}`) : 'Tunai — bayar di tempat'}
                    subClass={overdue ? 'text-danger' : 'text-faint'} />
                </View>
                <Card>
                  <CardHead title={c ? c.nama : '—'} right={<Text style={{ fontSize: 13.5, color: C.muted3 }}>Nota {tanggal(current.tanggal)} · tempo {c && c.tempo > 0 ? `${c.tempo} hari` : 'tunai'}</Text>} />
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
                    <Text style={{ fontSize: 14, color: C.muted3 }}>Total nota</Text>
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
            <Text style={[styles.detailNo, { fontFamily: undefined, fontWeight: '800' }]}>Nota penjualan baru</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 13.5, color: C.muted2 }}>Nomor nota dibuat otomatis saat disimpan</Text>
          </View>

          <Card className="flex-row flex-wrap gap-3.5 p-4">
            <View style={{ flex: 2, minWidth: 240 }}>
              <Field label="Pelanggan">
                <OptionPicker options={CUSTOMERS.map((c) => ({ value: String(c.id), label: c.id === 0 ? c.nama : `${c.kode} · ${c.nama}` }))} value={draft.custId || null} onChange={(v) => setDraft({ ...draft, custId: v, err: '' })} />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label="Tanggal nota">
                <TextField value={draft.tanggal} onChangeText={(v) => setDraft({ ...draft, tanggal: v })} placeholder="YYYY-MM-DD" />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Field label="Tempo & limit">
                <View style={styles.readout}>
                  <Text style={styles.readoutText}>
                    {draft.custId
                      ? (() => {
                          const c = cust(parseInt(draft.custId, 10));
                          if (!c) return '';
                          let t = c.tempo > 0 ? `${c.tempo} hari → jatuh ${tanggal(addDays(draft.tanggal, c.tempo))}` : 'Tunai — bayar di tempat';
                          if (c.limit > 0) {
                            const dipakai = piutangCust(c.id, null);
                            t += `\nSisa limit ${rp(Math.max(0, c.limit - dipakai))} / ${rp(c.limit)}`;
                          }
                          return t;
                        })()
                      : 'Pilih pelanggan dulu'}
                  </Text>
                </View>
              </Field>
            </View>
          </Card>

          <Card>
            <CardHead title="Item penjualan" />
            <View style={styles.addRow}>
              <View style={{ flex: 2, minWidth: 180 }}>
                <Field label="PRODUK">
                  <OptionPicker options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))} value={draft.rowKode || null}
                    onChange={(v) => {
                      const p = prod(v);
                      const satuan = p ? p.satuan[0].u : null;
                      const harga = p ? String(p.satuan[0].harga) : '';
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
                      const harga = sf ? String(sf.harga) : draft.rowHarga;
                      setDraft({ ...draft, rowSatuan: v, rowHarga: harga });
                    }} />
                </Field>
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Field label="HARGA JUAL / SATUAN">
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
            {draft.items.length === 0 && <EmptyState title="Belum ada item" sub="Pilih produk, isi qty dan harga jual, lalu klik Tambah." />}
          </Card>

          {(() => {
            const total = draft.items.reduce((a, it) => a + it.qty * it.harga, 0);
            const dibayarNum = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
            const sisa = total - dibayarNum;
            return (
              <View style={{ alignItems: 'flex-end' }}>
                <Card className="w-[380px] max-w-full gap-3 p-4">
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total nota</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800' }}>{rp(total)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={{ fontSize: 14.5, color: C.dark2 }}>Terima pembayaran</Text>
                    <View style={{ width: 170 }}>
                      <TextField value={draft.dibayar} onChangeText={(v) => setDraft({ ...draft, dibayar: v, err: '' })} keyboardType="numeric" placeholder="0" />
                    </View>
                  </View>
                  <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
                    <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Sisa piutang</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: sisa > 0 ? C.red : C.green }}>{rp(Math.max(0, sisa))}</Text>
                  </View>
                  <ErrorBanner message={draft.err} />
                  <PrimaryButton label="Simpan nota" onPress={save} />
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
  tableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20,
    paddingRight: 36, height: 48, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  thText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20,
    paddingRight: 36, minHeight: 74, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  namaText: { fontSize: 17, fontWeight: '500' },
  metaText: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  itemsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 40, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  itemsFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20, padding: 14, backgroundColor: C.tableHeaderBg, borderTopWidth: 1, borderTopColor: C.borderLight },
  readout: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: C.borderLight, backgroundColor: '#F7FBFE' },
  readoutText: { fontSize: 13, color: C.dark2, lineHeight: 18 },
  addRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
