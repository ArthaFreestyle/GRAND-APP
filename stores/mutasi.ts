/**
 * Stock movements — transfers between rooms and internal consumption — in memory.
 *
 * There is no endpoint for either yet, so this screen has always run on seeded
 * rows. They live here rather than in the screen because the list, the document
 * detail, and the entry form are three routes now and all three read the same
 * records — see `hooks/use-local-store.ts`.
 */
import type { ToneName } from '@/components/shell/ui';
import { todayISO } from '@/constants/theme-erp';
import { createLocalStore } from '@/hooks/use-local-store';

export interface RuangRef {
  id: number;
  nama: string;
}
export interface UnitRef {
  id: number;
  nama: string;
}
export interface ProdRef {
  kode: string;
  nama: string;
  unit: string;
}
export interface TrxItem {
  kode: string;
  qty: number;
}
export type Jenis = 'mutasi' | 'pemakaian';

export interface Trx {
  id: number;
  no: string;
  jenis: Jenis;
  tanggal: string;
  dari: number;
  /** Destination room — `mutasi` only. */
  ke?: number;
  /** Consuming unit — `pemakaian` only. */
  unit?: number;
  status: 'transit' | 'selesai';
  catatan: string;
  items: TrxItem[];
}

/** Read once at module load: "today" moving mid-session would restyle rows under the reader. */
export const TODAY = todayISO();

export const RUANG: RuangRef[] = [
  { id: 1, nama: 'Ruang Toko Depan' },
  { id: 2, nama: 'Gudang Belakang' },
  { id: 3, nama: 'Cabang Bekasi' },
];
export const UNITS: UnitRef[] = [
  { id: 1, nama: 'Administrasi' },
  { id: 2, nama: 'Kasir' },
  { id: 3, nama: 'Gudang' },
  { id: 4, nama: 'Marketing' },
];
export const PRODS: ProdRef[] = [
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

export const mutasiStore = createLocalStore<Trx[]>(INITIAL);

let seq = 100;
/** Transfers and consumptions are numbered in separate series. */
let mtSeq = 18;
let pkSeq = 31;

export interface NewTrx {
  jenis: Jenis;
  tanggal: string;
  dari: number;
  tujuan: number;
  catatan: string;
  items: TrxItem[];
}

export function addTrx(input: NewTrx): Trx {
  seq += 1;
  const ym = input.tanggal.slice(2, 4) + input.tanggal.slice(5, 7);
  let created: Trx;
  if (input.jenis === 'mutasi') {
    mtSeq += 1;
    // Room 3 is the branch: anything crossing to or from it travels, so it is
    // in transit until someone at the other end confirms arrival. A move
    // between two rooms on one site takes effect immediately.
    const status: Trx['status'] = input.tujuan === 3 || input.dari === 3 ? 'transit' : 'selesai';
    created = {
      id: seq,
      no: `MT-${ym}-${String(mtSeq).padStart(4, '0')}`,
      jenis: 'mutasi',
      tanggal: input.tanggal,
      dari: input.dari,
      ke: input.tujuan,
      status,
      catatan: input.catatan,
      items: input.items,
    };
  } else {
    pkSeq += 1;
    created = {
      id: seq,
      no: `PK-${ym}-${String(pkSeq).padStart(4, '0')}`,
      jenis: 'pemakaian',
      tanggal: input.tanggal,
      dari: input.dari,
      unit: input.tujuan,
      // Consumption is recorded, not shipped: it is done the moment it is written.
      status: 'selesai',
      catatan: input.catatan,
      items: input.items,
    };
  }
  mutasiStore.set((list) => [...list, created]);
  return created;
}

export function terimaTrx(id: number) {
  mutasiStore.set((list) => list.map((x) => (x.id === id ? { ...x, status: 'selesai' } : x)));
}

// ---- derived, shared by the list, the detail, and the form ----

export function ruangNama(id: number) {
  return RUANG.find((r) => r.id === id)?.nama ?? '—';
}
export function unitNama(id: number) {
  return UNITS.find((u) => u.id === id)?.nama ?? '—';
}
export function prod(kode: string) {
  return PRODS.find((p) => p.kode === kode);
}
export function prodNama(kode: string) {
  return prod(kode)?.nama ?? kode;
}
export function prodUnit(kode: string) {
  return prod(kode)?.unit ?? '';
}
export function totalQty(t: Trx) {
  return t.items.reduce((s, it) => s + it.qty, 0);
}
export function jenisMeta(j: Jenis): { label: string; tone: ToneName } {
  return j === 'mutasi' ? { label: 'Mutasi', tone: 'primary' } : { label: 'Pemakaian', tone: 'amber' };
}
export function statusMeta(t: Trx): { label: string; tone: ToneName } {
  if (t.jenis === 'pemakaian') return { label: 'Tercatat', tone: 'green' };
  if (t.status === 'transit') return { label: 'Dalam perjalanan', tone: 'amber' };
  return { label: 'Diterima', tone: 'green' };
}
