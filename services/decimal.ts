/**
 * Money crosses the wire as a decimal string, never a float: the contract sends
 * `NUMERIC(20,2)` as text precisely so PostgreSQL's value reaches the client
 * without binary rounding. These two helpers are the only places that boundary
 * is crossed, in either direction.
 */

/**
 * Parses a decimal string for **display and comparison only** — summing a
 * column, deciding whether a limit is near. Never send the result back: round
 * -tripping through a float is exactly what the string encoding exists to
 * prevent. Rupiah amounts stay well inside the safe integer range even counted
 * in cents, so ordinary arithmetic on the result is sound.
 */
export function decimalToNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Builds the decimal string to send from whole rupiah typed into a form.
 * Non-digits are stripped, so a field the user formatted with separators still
 * produces a clean value.
 */
export function rupiahToDecimal(input: string | number): string {
  const digits = String(input).replace(/[^0-9]/g, '');
  return `${digits === '' ? '0' : digits}.00`;
}

/**
 * Parses a quantity or rate typed into a form into the decimal string to send.
 * Returns `null` when what was typed is not a number at all, so the caller can
 * say so instead of silently sending a zero.
 *
 * Both separators are accepted because both get typed: an Indonesian keyboard
 * offers a comma and a numeric keypad offers a dot, and a form that rejects one
 * of them is a form people fight with. A thousands separator is *not* accepted —
 * "1.500" is genuinely ambiguous between 1500 and 1,5 — so the field this feeds
 * takes plain digits.
 */
export function numericToDecimal(input: string): string | null {
  const trimmed = String(input).trim().replace(',', '.');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * A decimal string as it should read on screen: grouped in the Indonesian
 * style, with the trailing zeros the database pads to its scale removed.
 * `"100.0000"` is a hundred, and showing it as `100,0000` only invites someone
 * to wonder what the extra digits mean.
 */
export function formatDesimal(value: string | null | undefined): string {
  if (!value) return '0';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

/**
 * `rupiahToDecimal` for the one field that may be negative: `pembulatan` is the
 * invoice's rounding line, and rounding down is as ordinary as rounding up.
 * Everywhere else a minus sign is a typo, which is why stripping it is the
 * default rather than this.
 */
export function rupiahToDecimalSigned(input: string | number): string {
  const raw = String(input).trim();
  const negative = raw.startsWith('-');
  const magnitude = rupiahToDecimal(raw);
  return negative && magnitude !== '0.00' ? `-${magnitude}` : magnitude;
}
