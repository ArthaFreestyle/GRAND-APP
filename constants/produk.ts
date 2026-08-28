// Domain types and seed data for the Master Produk screen (app/produk.tsx).
// Field shapes intentionally mirror components["schemas"]["Product"] /
// ProductSatuan / ProductHargaJual in types/api.ts so this local state can be
// swapped for real GET/POST calls against /api/v1/product later without a
// reshape — only the fetching layer needs to change.

export const ProdukColors = {
  bg: '#EDEFF2',
  card: '#fff',
  text: '#16181C',
  border: '#D6DAE0',
  borderCard: '#DFE2E7',
  borderLight: '#EBEDF0',
  borderLighter: '#F2F3F5',
  muted: '#9AA0A8',
  muted2: '#8A9099',
  muted3: '#6B7280',
  dark2: '#3A3F47',
  primary: '#17457E',
  primaryDark: '#123A69',
  primaryTintBg: 'rgba(23,69,126,0.1)',
  primaryTintBorder: '#A9C0DC',
  badgeBg: '#F1F3F6',
  green: '#2E7D4F',
  greenBg: 'rgba(46,125,79,0.12)',
  greenBorder: '#B7DBC4',
  red: '#C8322B',
  redBg: '#FDF2F1',
  redBorder: '#F1D6D3',
  redBorder2: '#E4C9C7',
  tableHeaderBg: '#FBFBFC',
  toastBg: '#16181C',
} as const;


export interface SatuanMasterItem {
  id: number;
  nama: string;
}

export interface RuangItem {
  id: number;
  nama: string;
}

export interface ProductSatuanRow {
  id: number;
  idSatuan: number;
  faktor: number;
  def: boolean;
}

export interface ProductHargaRow {
  id: number;
  idSatuan: number;
  harga: number;
  dari: string;
  sampai: string | null;
  dipakai: number;
}

export interface ProductItem {
  id: number;
  kode: string;
  nama: string;
  idDasar: number;
  stokMin: number;
  aktif: boolean;
  updatedAt: string;
  updatedBy: string;
  satuan: ProductSatuanRow[];
  harga: ProductHargaRow[];
  stok: Record<number, number>;
}

export const SATUAN_MASTER: SatuanMasterItem[] = [
  { id: 11, nama: 'pcs' },
  { id: 12, nama: 'lusin' },
  { id: 13, nama: 'rim' },
  { id: 14, nama: 'dus' },
  { id: 15, nama: 'pak' },
  { id: 16, nama: 'box' },
  { id: 20, nama: 'lbr' },
  { id: 21, nama: 'kg' },
];

export const RUANG_LIST: RuangItem[] = [
  { id: 1, nama: 'Ruang Toko Depan' },
  { id: 2, nama: 'Gudang Belakang' },
  { id: 3, nama: 'Cabang Bekasi' },
];

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 1, kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', idDasar: 11, stokMin: 24, aktif: true,
    updatedAt: '2026-08-14 09:12', updatedBy: 'admin.rina',
    satuan: [{ id: 1, idSatuan: 11, faktor: 1, def: true }, { id: 2, idSatuan: 12, faktor: 12, def: false }],
    harga: [
      { id: 502, idSatuan: 12, harga: 38000, dari: '2026-07-01', sampai: null, dipakai: 4 },
      { id: 501, idSatuan: 11, harga: 3500, dari: '2026-07-01', sampai: null, dipakai: 61 },
      { id: 499, idSatuan: 11, harga: 3200, dari: '2026-01-01', sampai: '2026-07-01', dipakai: 240 },
    ],
    stok: { 1: 148, 2: 620, 3: 96 },
  },
  {
    id: 2, kode: 'BRG-002', nama: 'Pulpen Standard AE8 Biru 0,7', idDasar: 11, stokMin: 24, aktif: true,
    updatedAt: '2026-08-12 16:40', updatedBy: 'admin.rina',
    satuan: [{ id: 3, idSatuan: 11, faktor: 1, def: true }, { id: 4, idSatuan: 12, faktor: 12, def: false }],
    harga: [{ id: 503, idSatuan: 11, harga: 3500, dari: '2026-07-01', sampai: null, dipakai: 18 }],
    stok: { 1: 96, 2: 410, 3: 0 },
  },
  {
    id: 3, kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', idDasar: 13, stokMin: 10, aktif: true,
    updatedAt: '2026-08-16 08:05', updatedBy: 'owner.hadi',
    satuan: [{ id: 5, idSatuan: 13, faktor: 1, def: true }, { id: 6, idSatuan: 14, faktor: 5, def: false }],
    harga: [
      { id: 511, idSatuan: 14, harga: 250000, dari: '2026-08-01', sampai: null, dipakai: 0 },
      { id: 510, idSatuan: 13, harga: 52000, dari: '2026-08-01', sampai: null, dipakai: 9 },
      { id: 508, idSatuan: 13, harga: 49000, dari: '2026-03-01', sampai: '2026-08-01', dipakai: 132 },
    ],
    stok: { 1: 170, 2: 340, 3: 40 },
  },
  {
    id: 4, kode: 'BRG-011', nama: 'HVS Sinar Dunia A4 80gr', idDasar: 13, stokMin: 10, aktif: true,
    updatedAt: '2026-08-16 08:06', updatedBy: 'owner.hadi',
    satuan: [{ id: 7, idSatuan: 13, faktor: 1, def: true }],
    harga: [{ id: 512, idSatuan: 13, harga: 61000, dari: '2026-08-01', sampai: null, dipakai: 3 }],
    stok: { 1: 6, 2: 22, 3: 0 },
  },
  {
    id: 5, kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', idDasar: 11, stokMin: 40, aktif: true,
    updatedAt: '2026-08-09 11:22', updatedBy: 'admin.rina',
    satuan: [{ id: 8, idSatuan: 11, faktor: 1, def: true }, { id: 9, idSatuan: 15, faktor: 10, def: false }],
    harga: [
      { id: 521, idSatuan: 15, harga: 39000, dari: '2026-06-01', sampai: null, dipakai: 7 },
      { id: 520, idSatuan: 11, harga: 4200, dari: '2026-06-01', sampai: null, dipakai: 88 },
    ],
    stok: { 1: 210, 2: 1200, 3: 150 },
  },
  {
    id: 6, kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', idDasar: 11, stokMin: 50, aktif: true,
    updatedAt: '2026-08-02 14:31', updatedBy: 'admin.rina',
    satuan: [{ id: 10, idSatuan: 11, faktor: 1, def: true }, { id: 11, idSatuan: 12, faktor: 12, def: false }],
    harga: [{ id: 530, idSatuan: 11, harga: 2800, dari: '2026-05-01', sampai: null, dipakai: 45 }],
    stok: { 1: 320, 2: 900, 3: 210 },
  },
  {
    id: 7, kode: 'BRG-040', nama: 'Isi Staples No. 3 (kecil)', idDasar: 16, stokMin: 12, aktif: true,
    updatedAt: '2026-07-28 10:03', updatedBy: 'admin.rina',
    satuan: [{ id: 12, idSatuan: 16, faktor: 1, def: true }],
    harga: [{ id: 540, idSatuan: 16, harga: 3000, dari: '2026-01-01', sampai: null, dipakai: 22 }],
    stok: { 1: 3, 2: 14, 3: 0 },
  },
  {
    id: 8, kode: 'BRG-061', nama: 'Penggaris Besi 30cm', idDasar: 11, stokMin: 12, aktif: true,
    updatedAt: '2026-08-18 15:47', updatedBy: 'owner.hadi',
    satuan: [{ id: 13, idSatuan: 11, faktor: 1, def: true }],
    harga: [],
    stok: { 1: 40, 2: 60, 3: 0 },
  },
  {
    id: 9, kode: 'BRG-062', nama: 'Amplop Coklat A4', idDasar: 11, stokMin: 20, aktif: true,
    updatedAt: '2026-08-18 15:48', updatedBy: 'owner.hadi',
    satuan: [{ id: 14, idSatuan: 11, faktor: 1, def: true }],
    harga: [],
    stok: { 1: 250, 2: 480, 3: 100 },
  },
  {
    id: 10, kode: 'BRG-070', nama: 'Kalkulator Casio MJ-12D', idDasar: 11, stokMin: 4, aktif: false,
    updatedAt: '2026-06-11 09:00', updatedBy: 'owner.hadi',
    satuan: [{ id: 15, idSatuan: 11, faktor: 1, def: true }],
    harga: [{ id: 570, idSatuan: 11, harga: 165000, dari: '2026-01-01', sampai: null, dipakai: 5 }],
    stok: { 1: 2, 2: 0, 3: 0 },
  },
  {
    id: 11, kode: 'BRG-071', nama: 'Tinta Printer Epson 003 Hitam', idDasar: 11, stokMin: 6, aktif: true,
    updatedAt: '2026-08-15 13:20', updatedBy: 'admin.rina',
    satuan: [{ id: 16, idSatuan: 11, faktor: 1, def: true }],
    harga: [{ id: 580, idSatuan: 11, harga: 82000, dari: '2026-04-01', sampai: null, dipakai: 12 }],
    stok: { 1: 11, 2: 26, 3: 4 },
  },
  {
    id: 12, kode: 'BRG-080', nama: 'Lakban Bening 2 inch', idDasar: 11, stokMin: 12, aktif: true,
    updatedAt: '2026-08-01 08:44', updatedBy: 'admin.rina',
    satuan: [{ id: 17, idSatuan: 11, faktor: 1, def: true }, { id: 18, idSatuan: 16, faktor: 24, def: false }],
    harga: [{ id: 590, idSatuan: 11, harga: 11500, dari: '2026-02-01', sampai: null, dipakai: 31 }],
    stok: { 1: 61, 2: 240, 3: 12 },
  },
];

export function satuanNama(id: number | null | undefined): string {
  const s = SATUAN_MASTER.find((x) => x.id === id);
  return s ? s.nama : '—';
}

export function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatTanggal(d: string | null | undefined): string {
  if (!d) return '—';
  const p = d.split('-');
  return `${parseInt(p[2], 10)} ${BULAN[parseInt(p[1], 10) - 1]} ${p[0]}`;
}

export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
