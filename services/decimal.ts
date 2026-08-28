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
