// Presentation constants and formatters for the Master Produk screen. The
// domain types and the calls that fill them live in services/produk.ts.

export const ProdukColors = {
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
  red: '#C8322B',
  redBg: '#FDF2F1',
  redBorder: '#F1D6D3',
  redBorder2: '#E4C9C7',
  tableHeaderBg: '#F7FBFE',
  toastBg: '#0E2433',
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
