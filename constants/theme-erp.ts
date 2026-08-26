// Shared visual language for the GRAND-ERP back-office screens (ported from
// the Claude Design project "POS Main Page Design" — see app/produk.tsx for
// the first port and the rationale for local-state-only screens).

export const Colors = {
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
  amber: '#8A5A00',
  amberBg: 'rgba(180,120,0,0.1)',
  amberBorder: '#E6D3A3',
  red: '#C8322B',
  redBg: '#FDF2F1',
  redBorder: '#F1D6D3',
  redBorder2: '#E4C9C7',
  tableHeaderBg: '#FBFBFC',
  toastBg: '#16181C',
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
