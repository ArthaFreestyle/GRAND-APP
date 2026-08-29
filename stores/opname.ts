/**
 * Stock-take sessions, in memory.
 *
 * No endpoint for these yet, so the screen has always run on seeded rows plus a
 * module-level `STOK` map standing in for the stock ledger — posting a session
 * writes the counted figures back into it, which is the whole point of a stock
 * take. All of it lives here rather than in the screen because the list, the
 * document, and the new-count form are three routes now and all three read it.
 */
import { todayISO } from '@/constants/theme-erp';
import { createLocalStore } from '@/hooks/use-local-store';

export interface RuangRef {
  id: number;
  nama: string;
}
export interface ProdRef {
  kode: string;
  nama: string;
  unit: string;
}
/** `fisik === null` means "not counted yet", which is not the same as counted zero. */
export interface OpItem {
  kode: string;
  sistem: number;
  fisik: number | null;
}
export interface Session {
  id: number;
  no: string;
  ruang: number;
  tanggal: string;
  status: 'draft' | 'selesai';
  petugas: string;
  catatan: string;
  items: OpItem[];
}

/** Read once at module load: "today" moving mid-session would restyle rows under the reader. */
export const TODAY = todayISO();

export const RUANG: RuangRef[] = [
  { id: 1, nama: 'Ruang Toko Depan' },
  { id: 2, nama: 'Gudang Belakang' },
  { id: 3, nama: 'Cabang Bekasi' },
];

export const PRODS: ProdRef[] = [
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

export const opnameStore = createLocalStore<Session[]>(INITIAL);

let seq = 300;
let soSeq = 4;

/** Every product, at what the ledger currently believes this room holds. */
export function snapshot(ruangId: number): OpItem[] {
  return PRODS.map((p) => ({ kode: p.kode, sistem: STOK[p.kode]?.[ruangId] ?? 0, fisik: null }));
}

export interface OpnameInput {
  /** The draft being continued, or `null` for a session that does not exist yet. */
  id: number | null;
  ruang: number;
  tanggal: string;
  catatan: string;
  items: OpItem[];
}

/**
 * Writes the session, and — when posting — the counted figures back into the
 * stock ledger. Posting is what makes a stock take mean anything: after it, the
 * system's number *is* the number that was counted.
 */
export function saveOpname(input: OpnameInput, post: boolean): Session {
  const existing = input.id !== null ? opnameStore.get().find((s) => s.id === input.id) : undefined;
  let id: number;
  let no: string;
  if (existing) {
    id = existing.id;
    no = existing.no;
  } else {
    seq += 1;
    soSeq += 1;
    const ym = input.tanggal.slice(2, 4) + input.tanggal.slice(5, 7);
    id = seq;
    no = `SO-${ym}-${String(soSeq).padStart(4, '0')}`;
  }

  const saved: Session = {
    id,
    no,
    ruang: input.ruang,
    tanggal: input.tanggal,
    status: post ? 'selesai' : 'draft',
    // The server stamps the counter from the session once this is an endpoint.
    petugas: existing?.petugas ?? 'admin.rina',
    catatan: input.catatan,
    items: input.items,
  };

  if (post) {
    for (const it of input.items) {
      if (it.fisik === null) continue;
      if (!STOK[it.kode]) STOK[it.kode] = {};
      STOK[it.kode][input.ruang] = it.fisik;
    }
  }

  opnameStore.set((list) =>
    list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? saved : x)) : [...list, saved]
  );
  return saved;
}

// ---- derived, shared by the list, the document, and the worksheet ----

export function ruangNama(id: number) {
  return RUANG.find((r) => r.id === id)?.nama ?? '—';
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
export function countedItems(items: OpItem[]) {
  return items.filter((it) => it.fisik !== null);
}
export function varianceItems(items: OpItem[]) {
  return countedItems(items).filter((it) => (it.fisik as number) - it.sistem !== 0);
}
export function netSelisih(items: OpItem[]) {
  return countedItems(items).reduce((s, it) => s + ((it.fisik as number) - it.sistem), 0);
}
