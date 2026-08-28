import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { useCanWrite } from '@/services/permissions';
import {
  BackButton,
  Badge,
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
  TextField,
  TinyButton,
  Toast,
} from '@/components/shell/ui';
import { Colors as C, num, tanggal, todayISO } from '@/constants/theme-erp';

const PAGE_SIZE = 8;
const TODAY = todayISO();

interface RuangRef { id: number; nama: string }
interface UnitRef { id: number; nama: string }
interface ProdRef { kode: string; nama: string; unit: string }
interface TrxItem { kode: string; qty: number }
type Jenis = 'mutasi' | 'pemakaian';
interface Trx {
  id: number;
  no: string;
  jenis: Jenis;
  tanggal: string;
  dari: number;
  ke?: number; // ruang, for mutasi
  unit?: number; // unit kerja, for pemakaian
  status: 'transit' | 'selesai';
  catatan: string;
  items: TrxItem[];
}

const RUANG: RuangRef[] = [
  { id: 1, nama: 'Ruang Toko Depan' },
  { id: 2, nama: 'Gudang Belakang' },
  { id: 3, nama: 'Cabang Bekasi' },
];
const UNITS: UnitRef[] = [
  { id: 1, nama: 'Administrasi' },
  { id: 2, nama: 'Kasir' },
  { id: 3, nama: 'Gudang' },
  { id: 4, nama: 'Marketing' },
];
const PRODS: ProdRef[] = [
  { kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', unit: 'pcs' },
  { kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', unit: 'rim' },
  { kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', unit: 'pcs' },
  { kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', unit: 'pcs' },
  { kode: 'BRG-080', nama: 'Lakban Bening 2 inch', unit: 'pcs' },
  { kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', unit: 'pcs' },
];

const INITIAL: Trx[] = [
  { id: 1, no: 'MT-2608-0018', jenis: 'mutasi', tanggal: '2026-08-18', dari: 2, ke: 3, status: 'transit', catatan: 'Pengiriman rutin ke cabang', items: [{ kode: 'BRG-010', qty: 30 }] },
  { id: 2, no: 'MT-2608-0015', jenis: 'mutasi', tanggal: '2026-08-17', dari: 2, ke: 3, status: 'transit', catatan: '', items: [{ kode: 'BRG-020', qty: 300 }, { kode: 'BRG-030', qty: 240 }] },
  { id: 3, no: 'PK-2608-0031', jenis: 'pemakaian', tanggal: '2026-08-16', dari: 1, unit: 1, status: 'selesai', catatan: 'Kebutuhan kantor administrasi Agustus', items: [{ kode: 'BRG-010', qty: 5 }, { kode: 'BRG-001', qty: 12 }, { kode: 'BRG-071', qty: 2 }] },
  { id: 4, no: 'MT-2608-0012', jenis: 'mutasi', tanggal: '2026-08-15', dari: 2, ke: 1, status: 'selesai', catatan: 'Isi ulang display toko', items: [{ kode: 'BRG-010', qty: 50 }, { kode: 'BRG-001', qty: 200 }] },
  { id: 5, no: 'PK-2608-0029', jenis: 'pemakaian', tanggal: '2026-08-12', dari: 2, unit: 3, status: 'selesai', catatan: '', items: [{ kode: 'BRG-080', qty: 6 }] },
  { id: 6, no: 'MT-2608-0009', jenis: 'mutasi', tanggal: '2026-08-08', dari: 1, ke: 2, status: 'selesai', catatan: 'Retur stok berlebih ke gudang', items: [{ kode: 'BRG-071', qty: 10 }] },
  { id: 7, no: 'PK-2607-0025', jenis: 'pemakaian', tanggal: '2026-07-28', dari: 1, unit: 2, status: 'selesai', catatan: 'Perlengkapan meja kasir', items: [{ kode: 'BRG-020', qty: 20 }, { kode: 'BRG-001', qty: 24 }] },
];

interface Draft {
  jenis: Jenis;
  tanggal: string;
  dari: string;
  tujuan: string;
  catatan: string;
  items: TrxItem[];
  rowKode: string;
  rowQty: string;
  err: string;
}
function freshDraft(jenis: Jenis): Draft {
  return {
    jenis,
    tanggal: TODAY,
    dari: String(RUANG[jenis === 'mutasi' ? 1 : 0].id),
    tujuan: String(jenis === 'mutasi' ? RUANG[0].id : UNITS[0].id),
    catatan: '',
    items: [],
    rowKode: '',
    rowQty: '',
    err: '',
  };
}

function ruangNama(id: number) { return RUANG.find((r) => r.id === id)?.nama ?? '—'; }
function unitNama(id: number) { return UNITS.find((u) => u.id === id)?.nama ?? '—'; }
function prod(kode: string) { return PRODS.find((p) => p.kode === kode); }
function prodNama(kode: string) { return prod(kode)?.nama ?? kode; }
function prodUnit(kode: string) { return prod(kode)?.unit ?? ''; }
function totalQty(t: Trx) { return t.items.reduce((s, it) => s + it.qty, 0); }
function jenisMeta(j: Jenis) {
  return j === 'mutasi'
    ? { label: 'Mutasi', color: C.primaryDark, bg: C.primaryTintBg, border: C.primaryTintBorder }
    : { label: 'Pemakaian', color: C.amber, bg: C.amberBg, border: C.amberBorder };
}
function statusMeta(t: Trx) {
  if (t.jenis === 'pemakaian') return { label: 'Tercatat', color: C.green, bg: C.greenBg, border: C.greenBorder };
  if (t.status === 'transit') return { label: 'Dalam perjalanan', color: C.amber, bg: C.amberBg, border: C.amberBorder };
  return { label: 'Diterima', color: C.green, bg: C.greenBg, border: C.greenBorder };
}

export default function MutasiPemakaianScreen() {
  const [trx, setTrx] = useState<Trx[]>(INITIAL);
  const [seq, setSeq] = useState(100);
  const [mtSeq, setMtSeq] = useState(18);
  const [pkSeq, setPkSeq] = useState(31);
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [jenisFilter, setJenisFilter] = useState<'semua' | Jenis>('semua');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canWrite = useCanWrite('mutasi');

  function toast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  const mutasiCount = trx.filter((t) => t.jenis === 'mutasi').length;
  const pemakaianCount = trx.filter((t) => t.jenis === 'pemakaian').length;
  const transitCount = trx.filter((t) => t.jenis === 'mutasi' && t.status === 'transit').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trx
      .filter((t) => {
        if (jenisFilter !== 'semua' && t.jenis !== jenisFilter) return false;
        if (!q) return true;
        const tuj = t.jenis === 'mutasi' ? ruangNama(t.ke ?? 0) : unitNama(t.unit ?? 0);
        return t.no.toLowerCase().includes(q) || ruangNama(t.dari).toLowerCase().includes(q) || tuj.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));
  }, [trx, query, jenisFilter]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const current = trx.find((t) => t.id === openId) ?? null;

  function addRow() {
    if (!draft) return;
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    const exist = draft.items.find((it) => it.kode === draft.rowKode);
    const items = exist
      ? draft.items.map((it) => (it.kode === draft.rowKode ? { kode: it.kode, qty: it.qty + qty } : it))
      : [...draft.items, { kode: draft.rowKode, qty }];
    setDraft({ ...draft, items, rowKode: '', rowQty: '', err: '' });
  }

  function save() {
    if (!draft) return;
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    if (draft.jenis === 'mutasi' && draft.dari === draft.tujuan) {
      return setDraft({ ...draft, err: '400 — ruang asal dan tujuan tidak boleh sama.' });
    }
    const ym = draft.tanggal.slice(2, 4) + draft.tanggal.slice(5, 7);
    const id = seq + 1;
    const dari = parseInt(draft.dari, 10);
    const tujuan = parseInt(draft.tujuan, 10);
    if (draft.jenis === 'mutasi') {
      const newMtSeq = mtSeq + 1;
      const no = `MT-${ym}-${String(newMtSeq).padStart(4, '0')}`;
      const status: Trx['status'] = tujuan === 3 || dari === 3 ? 'transit' : 'selesai';
      const rec: Trx = { id, no, jenis: 'mutasi', tanggal: draft.tanggal, dari, ke: tujuan, status, catatan: draft.catatan.trim(), items: draft.items };
      setTrx((l) => [...l, rec]);
      setSeq(id);
      setMtSeq(newMtSeq);
      setDraft(null);
      setView('detail');
      setOpenId(id);
      toast(`Mutasi ${no} disimpan · ${status === 'transit' ? `menunggu diterima di ${ruangNama(tujuan)}` : `stok dipindah ke ${ruangNama(tujuan)}`}`);
    } else {
      const newPkSeq = pkSeq + 1;
      const no = `PK-${ym}-${String(newPkSeq).padStart(4, '0')}`;
      const rec: Trx = { id, no, jenis: 'pemakaian', tanggal: draft.tanggal, dari, unit: tujuan, status: 'selesai', catatan: draft.catatan.trim(), items: draft.items };
      setTrx((l) => [...l, rec]);
      setSeq(id);
      setPkSeq(newPkSeq);
      setDraft(null);
      setView('detail');
      setOpenId(id);
      toast(`Pemakaian ${no} dicatat · stok dikeluarkan untuk ${unitNama(tujuan)}`);
    }
  }

  function receive(t: Trx) {
    setTrx((l) => l.map((x) => (x.id === t.id ? { ...x, status: 'selesai' } : x)));
    toast(`Mutasi ${t.no} diterima di ${ruangNama(t.ke ?? 0)}`);
  }

  const isMutasiDraft = draft?.jenis === 'mutasi';

  return (
    <AppShell title="Mutasi & Pemakaian">
      {view === 'list' && (
        <View style={styles.wrap}>
          <View style={styles.toolbar}>
            <SearchBar value={query} onChangeText={(t) => { setQuery(t); setPage(1); }} placeholder="Cari nomor, ruang, atau unit" />
            <FilterPills
              options={[{ key: 'semua', label: 'Semua' }, { key: 'mutasi', label: 'Mutasi' }, { key: 'pemakaian', label: 'Pemakaian' }]}
              active={jenisFilter}
              onPick={(k) => { setJenisFilter(k); setPage(1); }}
            />
            <View style={{ flex: 1 }} />
            <Text style={styles.countLabel}>{filtered.length} transaksi</Text>
            {canWrite && <PrimaryButton label="Transaksi baru" onPress={() => { setDraft(freshDraft('mutasi')); setView('new'); }} />}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <KpiCard label="Mutasi antar ruang" value={num(mutasiCount)} sub="transaksi tercatat" />
            <KpiCard label="Pemakaian internal" value={num(pemakaianCount)} sub="transaksi tercatat" />
            <KpiCard label="Mutasi dalam perjalanan" value={num(transitCount)} color={transitCount > 0 ? C.amber : C.text} sub="menunggu diterima" />
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1 }]}>RUTE & DOKUMEN</Text>
              <Text style={[styles.thText, { width: 176 }]}>STATUS</Text>
              <Text style={[styles.thText, { width: 130, textAlign: 'right' }]}>ITEM</Text>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {slice.map((t) => {
                const jm = jenisMeta(t.jenis);
                const st = statusMeta(t);
                const rute = t.jenis === 'mutasi' ? `${ruangNama(t.dari)} → ${ruangNama(t.ke ?? 0)}` : `${ruangNama(t.dari)} → ${unitNama(t.unit ?? 0)}`;
                return (
                  <Pressable key={t.id} onPress={() => { setView('detail'); setOpenId(t.id); }} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Badge label={jm.label} color={jm.color} bg={jm.bg} border={jm.border} small />
                        <Text style={styles.namaText} numberOfLines={1}>{rute}</Text>
                      </View>
                      <Text style={styles.metaText} numberOfLines={1}>{t.no} · {tanggal(t.tanggal)}</Text>
                    </View>
                    <View style={{ width: 176 }}>
                      <Badge label={st.label} color={st.color} bg={st.bg} border={st.border} small />
                    </View>
                    <View style={{ width: 130, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>{t.items.length} item</Text>
                      <Text style={{ fontSize: 12, color: C.muted }}>{num(totalQty(t))} unit</Text>
                    </View>
                  </Pressable>
                );
              })}
              {slice.length === 0 && <EmptyState title="Tidak ada transaksi yang cocok" sub="Coba kata kunci lain atau ubah filter jenis." />}
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
          {(() => {
            const jm = jenisMeta(current.jenis);
            const st = statusMeta(current);
            const isMutasi = current.jenis === 'mutasi';
            const canReceive = canWrite && isMutasi && current.status === 'transit';
            return (
              <>
                <View style={styles.detailHead}>
                  <BackButton onPress={() => { setView('list'); setOpenId(null); }} />
                  <Text style={styles.detailNo}>{current.no}</Text>
                  <Badge label={jm.label} color={jm.color} bg={jm.bg} border={jm.border} />
                  <Badge label={st.label} color={st.color} bg={st.bg} border={st.border} />
                  <View style={{ flex: 1 }} />
                  {canReceive && <PrimaryButton label="Terima di tujuan" onPress={() => receive(current)} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <KpiCard label="Dari ruang" value={ruangNama(current.dari)} sub="stok berkurang di sini" />
                  <KpiCard
                    label={isMutasi ? 'Ke ruang' : 'Unit pemakai'}
                    value={isMutasi ? ruangNama(current.ke ?? 0) : unitNama(current.unit ?? 0)}
                    color={isMutasi ? C.text : C.amber}
                    sub={isMutasi ? (current.status === 'transit' ? 'stok belum ditambahkan' : 'stok bertambah di sini') : 'stok keluar / dikonsumsi'}
                  />
                  <KpiCard label="Tanggal" value={tanggal(current.tanggal)} sub={`${current.items.length} jenis · ${num(totalQty(current))} unit`} />
                </View>
                {!!current.catatan && (
                  <Card style={{ padding: 14 }}>
                    <Text style={{ fontSize: 12.5, color: C.muted2 }}>Catatan</Text>
                    <Text style={{ fontSize: 15, color: C.text, marginTop: 3, lineHeight: 20 }}>{current.catatan}</Text>
                  </Card>
                )}
                <Card>
                  <CardHead title="Rincian item" />
                  <View style={styles.itemsHeadRow}>
                    <Text style={{ flex: 1 }}>PRODUK</Text>
                    <Text style={{ width: 180, textAlign: 'right' }}>QTY</Text>
                  </View>
                  {current.items.map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={{ fontSize: 15.5, fontWeight: '500' }}>{prodNama(it.kode)}</Text>
                        <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>{it.kode}</Text>
                      </View>
                      <Text style={{ width: 180, textAlign: 'right', fontSize: 17, fontWeight: '600' }}>{it.qty.toLocaleString('id-ID')} {prodUnit(it.kode)}</Text>
                    </View>
                  ))}
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
            <Text style={styles.newTitle}>Transaksi stok baru</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 13.5, color: C.muted2 }}>Nomor dokumen dibuat otomatis saat disimpan</Text>
          </View>

          <Card style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['mutasi', 'pemakaian'] as Jenis[]).map((j) => {
                const on = draft.jenis === j;
                return (
                  <Pressable
                    key={j}
                    onPress={() => setDraft(freshDraft(j))}
                    style={[styles.jenisToggle, { borderColor: on ? C.primaryTintBorder : C.border, backgroundColor: on ? 'rgba(23,69,126,0.08)' : '#fff' }]}>
                    <Text style={{ fontSize: 15.5, fontWeight: '600', color: on ? C.primaryDark : C.dark2 }}>
                      {j === 'mutasi' ? 'Mutasi antar ruang' : 'Pemakaian internal'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: on ? '#4C6591' : C.muted }}>
                      {j === 'mutasi' ? 'Pindah stok antar lokasi' : 'Konsumsi oleh unit kerja'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Field label="Dari ruang">
                  <OptionPicker options={RUANG.map((r) => ({ value: String(r.id), label: r.nama }))} value={draft.dari} onChange={(v) => setDraft({ ...draft, dari: v, err: '' })} />
                </Field>
              </View>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Field label={isMutasiDraft ? 'Ke ruang' : 'Unit pemakai'}>
                  <OptionPicker
                    options={(isMutasiDraft ? RUANG : UNITS).map((r) => ({ value: String(r.id), label: r.nama }))}
                    value={draft.tujuan}
                    onChange={(v) => setDraft({ ...draft, tujuan: v, err: '' })}
                  />
                </Field>
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Field label="Tanggal">
                  <TextField value={draft.tanggal} onChangeText={(v) => setDraft({ ...draft, tanggal: v })} placeholder="YYYY-MM-DD" />
                </Field>
              </View>
            </View>
            <Field label="Catatan (opsional)">
              <TextField value={draft.catatan} onChangeText={(v) => setDraft({ ...draft, catatan: v })} placeholder={isMutasiDraft ? 'mis. isi ulang display toko' : 'mis. kebutuhan kantor bulan ini'} />
            </Field>
          </Card>

          <Card>
            <CardHead title="Item" />
            <View style={styles.addRow}>
              <View style={{ flex: 2, minWidth: 180 }}>
                <Field label="PRODUK">
                  <OptionPicker options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))} value={draft.rowKode || null} onChange={(v) => setDraft({ ...draft, rowKode: v, err: '' })} />
                </Field>
              </View>
              <View style={{ width: 140 }}>
                <Field label={`QTY (${draft.rowKode ? prodUnit(draft.rowKode) : 'unit'})`}>
                  <TextField value={draft.rowQty} onChangeText={(v) => setDraft({ ...draft, rowQty: v, err: '' })} keyboardType="numeric" placeholder="0" />
                </Field>
              </View>
              <PrimaryButton label="Tambah" onPress={addRow} />
            </View>
            <View style={styles.itemsHeadRow}>
              <Text style={{ flex: 1 }}>PRODUK</Text>
              <Text style={{ width: 180, textAlign: 'right' }}>QTY</Text>
              <View style={{ width: 80 }} />
            </View>
            {draft.items.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{prodNama(it.kode)}</Text>
                <Text style={{ width: 180, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>{it.qty.toLocaleString('id-ID')} {prodUnit(it.kode)}</Text>
                <View style={{ width: 80, alignItems: 'flex-end' }}>
                  <TinyButton label="Hapus" danger onPress={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} />
                </View>
              </View>
            ))}
            {draft.items.length === 0 && <EmptyState title="Belum ada item" sub="Pilih produk, isi qty, lalu klik Tambah." />}
          </Card>

          <View style={{ alignItems: 'flex-end' }}>
            <Card style={{ width: 380, maxWidth: '100%', padding: 16, gap: 12 }}>
              <View style={styles.summaryRow}>
                <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total baris item</Text>
                <Text style={{ fontSize: 22, fontWeight: '800' }}>{draft.items.length}</Text>
              </View>
              <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Efek stok</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.dark2, textAlign: 'right' }}>
                  {isMutasiDraft
                    ? `− ${ruangNama(parseInt(draft.dari, 10))}\n+ ${ruangNama(parseInt(draft.tujuan, 10))}`
                    : `− ${ruangNama(parseInt(draft.dari, 10))}\nkeluar untuk unit`}
                </Text>
              </View>
              <ErrorBanner message={draft.err} />
              <PrimaryButton label={isMutasiDraft ? 'Simpan mutasi' : 'Catat pemakaian'} onPress={save} />
            </Card>
          </View>
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
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  newTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  itemsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 38, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 54, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  jenisToggle: { flex: 1, minHeight: 56, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 16, justifyContent: 'center', gap: 2 },
  addRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, backgroundColor: C.tableHeaderBg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
