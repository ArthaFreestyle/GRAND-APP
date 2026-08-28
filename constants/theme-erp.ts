// Shared visual language for the GRAND-ERP back-office screens.
//
//   #005689 biru tua   — isian saat ditekan, teks penegas di atas terang (7,8:1)
//   #007CB9 biru sedang — isian utama, putih di atasnya 4,6:1 (lolos AA)
//   #F6C667 emas        — aksen dan tint peringatan; TIDAK pernah jadi teks
//                         (di atas putih cuma 1,6:1), teksnya #8A5A00
//   #F1F8FD putih biru  — latar halaman
//
// Netral dan warna status tidak ada di palet empat warna ini. Tangga border dan
// abu-abu teks diturunkan dengan rona biru supaya menyatu; hijau dan merah
// dipertahankan karena fungsional — "lunas" dan "jatuh tempo" harus bisa
// dibedakan, dan emas tidak bisa menggantikan keduanya.

export const Colors = {
  bg: '#F1F8FD',
  card: '#fff',
  text: '#0E2433',
  border: '#C7DBEA',
  borderCard: '#D5E6F2',
  borderLight: '#E4EFF8',
  borderLighter: '#EDF5FB',
  muted: '#93A8B8',
  muted2: '#7C93A5',
  muted3: '#5A7387',
  dark2: '#2E4557',
  primary: '#007CB9',
  primaryDark: '#005689',
  primaryTintBg: 'rgba(0,124,185,0.10)',
  primaryTintBorder: '#A9D0E7',
  badgeBg: '#E9F2F9',
  green: '#2E7D4F',
  greenBg: 'rgba(46,125,79,0.12)',
  greenBorder: '#B7DBC4',
  amber: '#8A5A00',
  amberBg: 'rgba(246,198,103,0.28)',
  amberBorder: '#F0D69B',
  red: '#C8322B',
  redBg: '#FDF2F1',
  redBorder: '#F1D6D3',
  redBorder2: '#E4C9C7',
  tableHeaderBg: '#F7FBFE',
  toastBg: '#0E2433',
} as const;

export function rp(n: number): string {
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function rpShort(n: number): string {
  if (n <= 0) return 'Rp 0';
  if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' jt';
  return 'Rp ' + num(Math.round(n / 1000)) + ' rb';
}

export function num(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function tanggal(d: string | null | undefined): string {
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

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
