/**
 * Supplier data, in memory.
 *
 * The contract has no `/supplier` endpoint yet, so this screen has always run
 * on seeded rows. They used to live in the screen's `useState`; they live here
 * because the list, the detail, and the create form are three routes now and
 * all three read the same records. Replace this file with a `services/supplier.ts`
 * the day the endpoint exists — the screens only ever touch the four functions
 * at the bottom.
 */
import { createLocalStore } from '@/hooks/use-local-store';
import type { ToneName } from '@/components/shell/ui';
import { todayISO } from '@/constants/theme-erp';

export type Tipe = 'distributor' | 'pabrik' | 'perorangan';

export const TIPE_META: Record<Tipe, { label: string; tone: ToneName }> = {
  distributor: { label: 'Distributor', tone: 'primary' as const },
  pabrik: { label: 'Pabrik', tone: 'green' as const },
  perorangan: { label: 'Perorangan', tone: 'neutral' as const },
};

export interface Faktur {
  no: string;
  tanggal: string;
  total: number;
  sisa: number;
  jatuh: string | null;
}

export interface Supplier {
  id: number;
  kode: string;
  nama: string;
  tipe: Tipe;
  narahubung: string;
  telepon: string;
  email: string;
  npwp: string;
  kota: string;
  alamat: string;
  aktif: boolean;
  tempo: number;
  faktur: Faktur[];
}

/** Read once at module load: "today" moving mid-session would restyle rows under the reader. */
export const TODAY = todayISO();

const INITIAL: Supplier[] = [
  { id: 1, kode: 'SUP-001', nama: 'PT Sinar Dunia Distribusi', tipe: 'distributor', narahubung: 'Bpk. Hendra', telepon: '021-5567-8890', email: 'order@sinardunia.co.id', npwp: '01.234.567.8-021.000', kota: 'Jakarta Pusat', alamat: 'Jl. Industri Raya No. 12, Kemayoran', aktif: true, tempo: 30,
    faktur: [
      { no: 'FB-2608-0044', tanggal: '2026-08-13', total: 18500000, sisa: 18500000, jatuh: '2026-09-12' },
      { no: 'FB-2607-0091', tanggal: '2026-07-28', total: 12400000, sisa: 6000000, jatuh: '2026-08-27' },
      { no: 'FB-2607-0033', tanggal: '2026-07-10', total: 15200000, sisa: 0, jatuh: '2026-08-09' },
    ] },
  { id: 2, kode: 'SUP-002', nama: 'CV Tiga Roda ATK', tipe: 'distributor', narahubung: 'Ibu Sinta', telepon: '021-8890-2211', email: 'cs@tigaroda-atk.com', npwp: '02.345.678.9-014.000', kota: 'Bekasi', alamat: 'Ruko Grand Galaxy Blok B No. 7', aktif: true, tempo: 21,
    faktur: [
      { no: 'FB-2608-0051', tanggal: '2026-08-16', total: 8600000, sisa: 8600000, jatuh: '2026-09-06' },
      { no: 'FB-2606-0140', tanggal: '2026-06-25', total: 7300000, sisa: 3200000, jatuh: '2026-07-16' },
    ] },
  { id: 3, kode: 'SUP-003', nama: 'PT Faber-Castell Indonesia', tipe: 'pabrik', narahubung: 'Bpk. Wawan', telepon: '021-4602-1100', email: 'sales.id@faber-castell.com', npwp: '03.456.789.0-092.000', kota: 'Bekasi', alamat: 'Kawasan Industri Jababeka II, Cikarang', aktif: true, tempo: 45,
    faktur: [
      { no: 'FB-2608-0060', tanggal: '2026-08-05', total: 22000000, sisa: 22000000, jatuh: '2026-09-19' },
      { no: 'FB-2605-0210', tanggal: '2026-05-30', total: 19800000, sisa: 0, jatuh: '2026-07-14' },
    ] },
  { id: 4, kode: 'SUP-004', nama: 'Toko Grosir Pena Jaya', tipe: 'distributor', narahubung: 'Bpk. Anton', telepon: '0812-9087-6655', email: '', npwp: '', kota: 'Jakarta Barat', alamat: 'Pasar Asemka Lt. 1 Blok C No. 44', aktif: true, tempo: 14,
    faktur: [{ no: 'FB-2608-0038', tanggal: '2026-08-11', total: 4200000, sisa: 4200000, jatuh: '2026-08-25' }] },
  { id: 5, kode: 'SUP-005', nama: 'PT Standardpen Industries', tipe: 'pabrik', narahubung: 'Ibu Melati', telepon: '021-6905-3344', email: 'b2b@standardpen.co.id', npwp: '04.567.890.1-073.000', kota: 'Tangerang', alamat: 'Jl. Raya Serang Km 12, Cikupa', aktif: true, tempo: 30,
    faktur: [{ no: 'FB-2607-0122', tanggal: '2026-07-18', total: 14500000, sisa: 0, jatuh: '2026-08-17' }] },
  { id: 6, kode: 'SUP-006', nama: 'UD Amplop Makmur', tipe: 'perorangan', narahubung: 'Bpk. Sutrisno', telepon: '0857-7788-1234', email: '', npwp: '', kota: 'Bogor', alamat: 'Jl. Suryakencana No. 88', aktif: true, tempo: 0,
    faktur: [{ no: 'FB-2608-0029', tanggal: '2026-08-14', total: 1850000, sisa: 0, jatuh: null }] },
  { id: 7, kode: 'SUP-007', nama: 'PT Casio Electronics Indonesia', tipe: 'pabrik', narahubung: 'Bpk. Ferry', telepon: '021-2988-7700', email: 'trade@casio.co.id', npwp: '05.678.901.2-088.000', kota: 'Jakarta Selatan', alamat: 'Gedung Casio Tower Lt. 8, Jl. TB Simatupang', aktif: false, tempo: 30,
    faktur: [{ no: 'FB-2604-0301', tanggal: '2026-04-20', total: 9600000, sisa: 0, jatuh: '2026-05-20' }] },
  { id: 8, kode: 'SUP-008', nama: 'CV Lakban Sejahtera', tipe: 'distributor', narahubung: 'Ibu Ratna', telepon: '0821-1234-9988', email: 'lakbansejahtera@gmail.com', npwp: '', kota: 'Bekasi', alamat: 'Jl. Cakung Cilincing Km 3 No. 21', aktif: true, tempo: 21, faktur: [] },
];

export const supplierStore = createLocalStore<Supplier[]>(INITIAL);

/** Ids the seed rows will never reach, so a created supplier cannot collide with one. */
let seq = 900;

export function addSupplier(s: Omit<Supplier, 'id' | 'faktur' | 'aktif'>): Supplier {
  seq += 1;
  const created: Supplier = { ...s, id: seq, aktif: true, faktur: [] };
  supplierStore.set((list) => [...list, created]);
  return created;
}

export function patchSupplier(id: number, patch: Partial<Supplier>) {
  supplierStore.set((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function kodeTaken(kode: string): boolean {
  return supplierStore.get().some((c) => c.kode.toLowerCase() === kode.toLowerCase());
}

// ---- derived figures, shared by the list and the detail ----

export const hutangOf = (c: Supplier) => c.faktur.reduce((s, n) => s + n.sisa, 0);
export const totalBeliOf = (c: Supplier) => c.faktur.reduce((s, n) => s + n.total, 0);
export const belumLunasOf = (c: Supplier) => c.faktur.filter((n) => n.sisa > 0).length;
export const adaJatuhTempo = (c: Supplier) =>
  c.faktur.some((n) => n.sisa > 0 && n.jatuh !== null && n.jatuh < TODAY);
