// Presentation constants and formatters for the Master Produk screen. The
// domain types and the calls that fill them live in services/produk.ts.

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


function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Money arrives from the API as a decimal string so NUMERIC(20,2) survives the
 * trip unrounded; parsing it to a float would undo exactly that, so the string
 * is split rather than parsed. Only the rupiah part is shown, as in the design.
 */
export function formatRupiah(n: number | string): string {
  const whole = typeof n === 'string' ? n.split('.')[0] : String(Math.round(n));
  return 'Rp ' + groupThousands(whole);
}

export function formatNumber(n: number): string {
  return groupThousands(String(Math.round(n)));
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Accepts a plain `YYYY-MM-DD` date and a full timestamp alike. */
export function formatTanggal(d: string | null | undefined): string {
  if (!d) return '—';
  const p = d.slice(0, 10).split('-');
  if (p.length < 3) return '—';
  return `${parseInt(p[2], 10)} ${BULAN[parseInt(p[1], 10) - 1]} ${p[0]}`;
}

export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
