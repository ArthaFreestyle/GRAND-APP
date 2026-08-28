/**
 * Purchase invoices, in memory.
 *
 * There is no `/pembelian` endpoint in the contract yet, so this screen has
 * always run on seeded rows. They live here rather than in the screen because
 * the list, the invoice detail, and the entry form are three routes now and all
 * three read the same records — see `hooks/use-local-store.ts`.
 *
 * The reference lists (`SUPPLIERS`, `PRODS`) are what the entry form picks
 * from; when the endpoints land they become reads, not constants.
 */
import type { ToneName } from '@/components/shell/ui';
import { addDays, todayISO } from '@/constants/theme-erp';
import { createLocalStore } from '@/hooks/use-local-store';

export interface SupplierRef {
  id: number;
  kode: string;
  nama: string;
  tempo: number;
}
export interface ProdRef {
  kode: string;
  nama: string;
  hargaBeli: number;
  satuan: { u: string; f: number }[];
}
export interface FakturItem {
  kode: string;
  qty: number;
  satuan: string;
  harga: number;
}
export interface Faktur {
  id: number;
  no: string;
  supId: number;
  tanggal: string;
  dibayar: number;
  items: FakturItem[];
}

/** Read once at module load: "today" moving mid-session would restyle rows under the reader. */
export const TODAY = todayISO();

export const SUPPLIERS: SupplierRef[] = [
  { id: 1, kode: 'SUP-001', nama: 'PT Sinar Dunia Distribusi', tempo: 30 },
  { id: 2, kode: 'SUP-002', nama: 'CV Tiga Roda ATK', tempo: 21 },
  { id: 3, kode: 'SUP-003', nama: 'PT Faber-Castell Indonesia', tempo: 45 },
  { id: 5, kode: 'SUP-005', nama: 'PT Standardpen Industries', tempo: 30 },
  { id: 8, kode: 'SUP-008', nama: 'CV Lakban Sejahtera', tempo: 21 },
];

export const PRODS: ProdRef[] = [
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

export const pembelianStore = createLocalStore<Faktur[]>(INITIAL);

let seq = 100;
/** The running invoice-number counter; the server owns this once it exists. */
let noSeq = 61;

export function addFaktur(input: Omit<Faktur, 'id' | 'no'>): Faktur {
  seq += 1;
  noSeq += 1;
  const ym = input.tanggal.slice(2, 4) + input.tanggal.slice(5, 7);
  const created: Faktur = { ...input, id: seq, no: `FB-${ym}-${String(noSeq).padStart(4, '0')}` };
  pembelianStore.set((list) => [...list, created]);
  return created;
}

/** Settles the whole balance. Partial payments are the `pembayaran-utang` module's. */
export function lunasiFaktur(id: number) {
  pembelianStore.set((list) => list.map((x) => (x.id === id ? { ...x, dibayar: totalOf(x) } : x)));
}

// ---- derived figures, shared by the list, the detail, and the form ----

export function sup(id: number) {
  return SUPPLIERS.find((x) => x.id === id);
}
export function prod(kode: string) {
  return PRODS.find((x) => x.kode === kode);
}
export function prodNama(kode: string) {
  return prod(kode)?.nama ?? kode;
}
export function totalOf(f: Faktur) {
  return f.items.reduce((s, it) => s + it.qty * it.harga, 0);
}
/** `null` for a cash supplier: nothing falls due when it was paid on the spot. */
export function jatuhOf(f: Faktur) {
  const s = sup(f.supId);
  return s && s.tempo > 0 ? addDays(f.tanggal, s.tempo) : null;
}
export function statusOf(f: Faktur): { key: string; label: string; tone: ToneName } {
  const sisa = totalOf(f) - f.dibayar;
  if (sisa <= 0) return { key: 'lunas', label: 'Lunas', tone: 'green' };
  const j = jatuhOf(f);
  if (j && j < TODAY) return { key: 'telat', label: 'Jatuh tempo', tone: 'red' };
  if (f.dibayar > 0) return { key: 'sebagian', label: 'Bayar sebagian', tone: 'primary' };
  return { key: 'belum', label: 'Belum dibayar', tone: 'amber' };
}
