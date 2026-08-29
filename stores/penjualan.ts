/**
 * Sales notes, in memory.
 *
 * The contract's `/penjualan` is the cashier's; this back-office view has always
 * run on seeded rows. They live here rather than in the screen because the
 * list, the note detail, and the entry form are three routes now and all three
 * read the same records — see `hooks/use-local-store.ts`.
 */
import type { ToneName } from '@/components/shell/ui';
import { addDays, todayISO } from '@/constants/theme-erp';
import { createLocalStore } from '@/hooks/use-local-store';

export interface CustRef {
  id: number;
  kode: string;
  nama: string;
  /** 0 means no credit at all — a walk-in pays on the spot. */
  limit: number;
  tempo: number;
}
export interface ProdRef {
  kode: string;
  nama: string;
  satuan: { u: string; harga: number }[];
}
export interface NotaItem {
  kode: string;
  qty: number;
  satuan: string;
  harga: number;
}
export interface Nota {
  id: number;
  no: string;
  custId: number;
  tanggal: string;
  dibayar: number;
  items: NotaItem[];
}

/** Read once at module load: "today" moving mid-session would restyle rows under the reader. */
export const TODAY = todayISO();

export const CUSTOMERS: CustRef[] = [
  { id: 0, kode: '—', nama: 'Pelanggan Umum (tunai)', limit: 0, tempo: 0 },
  { id: 1, kode: 'PLG-001', nama: 'CV Sinar Jaya', limit: 20000000, tempo: 30 },
  { id: 2, kode: 'PLG-002', nama: 'Toko Berkah ATK', limit: 15000000, tempo: 21 },
  { id: 3, kode: 'PLG-003', nama: 'Budi Santoso', limit: 0, tempo: 0 },
  { id: 4, kode: 'PLG-004', nama: 'SDN Menteng 01 Pagi', limit: 25000000, tempo: 45 },
  { id: 5, kode: 'PLG-005', nama: 'PT Maju Bersama Sentosa', limit: 30000000, tempo: 30 },
];

export const PRODS: ProdRef[] = [
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

export const penjualanStore = createLocalStore<Nota[]>(INITIAL);

let seq = 100;
/** The running note-number counter; the server owns this once it exists. */
let noSeq = 170;

export function addNota(input: Omit<Nota, 'id' | 'no'>): Nota {
  seq += 1;
  noSeq += 1;
  const ym = input.tanggal.slice(2, 4) + input.tanggal.slice(5, 7);
  const created: Nota = { ...input, id: seq, no: `INV-${ym}-${String(noSeq).padStart(4, '0')}` };
  penjualanStore.set((list) => [...list, created]);
  return created;
}

export function lunasiNota(id: number) {
  penjualanStore.set((list) => list.map((x) => (x.id === id ? { ...x, dibayar: totalOf(x) } : x)));
}

// ---- derived figures, shared by the list, the detail, and the form ----

export function cust(id: number) {
  return CUSTOMERS.find((x) => x.id === id);
}
export function prod(kode: string) {
  return PRODS.find((x) => x.kode === kode);
}
export function prodNama(kode: string) {
  return prod(kode)?.nama ?? kode;
}
export function totalOf(f: Nota) {
  return f.items.reduce((s, it) => s + it.qty * it.harga, 0);
}
/** `null` for a cash customer: nothing falls due when it was paid on the spot. */
export function jatuhOf(f: Nota) {
  const c = cust(f.custId);
  return c && c.tempo > 0 ? addDays(f.tanggal, c.tempo) : null;
}
export function statusOf(f: Nota): { key: string; label: string; tone: ToneName } {
  const sisa = totalOf(f) - f.dibayar;
  if (sisa <= 0) return { key: 'lunas', label: 'Lunas', tone: 'green' };
  const j = jatuhOf(f);
  if (j && j < TODAY) return { key: 'telat', label: 'Jatuh tempo', tone: 'red' };
  if (f.dibayar > 0) return { key: 'sebagian', label: 'Bayar sebagian', tone: 'primary' };
  return { key: 'belum', label: 'Belum dibayar', tone: 'amber' };
}

/**
 * What this customer already owes, so the entry form can refuse a note that
 * would push them past their credit limit. Reads the store rather than taking
 * the rows: the caller is a form, not a list, and has no reason to hold them.
 */
export function piutangCust(custId: number, exceptId: number | null): number {
  return penjualanStore
    .get()
    .filter((n) => n.custId === custId && n.id !== exceptId)
    .reduce((a, n) => a + (totalOf(n) - n.dibayar), 0);
}
