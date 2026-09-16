/**
 * Laporan — the three reads that are reports rather than modules.
 *
 * The contract calls them that itself: no tables, no migrations, nothing stored.
 * Every figure here is derived at read time from `kartu_stok` or from posted
 * documents, which is why none of them can be stale and why none of them can be
 * corrected — the only way to change a report is to change the documents behind
 * it.
 *
 * ## Three shapes to know before drawing any of them
 *
 * **None of the three is paged.** There is no `page` or `size` on any of them,
 * so what comes back is the whole answer for the parameters given. That is
 * harmless for two of them and is the governing constraint on the third: a
 * `pergerakan` over an unbounded date range across every product and every room
 * is one response holding a row per `(barang, ruang, jenis_transaksi)`, so the
 * caller narrows it rather than paging it.
 *
 * **Money is a decimal string, never a number.** `NUMERIC(20,2)` through a float
 * loses cents, and these are the figures somebody reconciles against a bank
 * statement. `services/decimal.ts` is the only place that boundary is crossed.
 *
 * **`pergerakan` filters on `kartu_stok.tanggal_transaksi`, not on document
 * status or document date.** That is deliberate and it makes a trap visible
 * rather than hiding it: a document posted in one period and cancelled in the
 * next writes its reversing row stamped `time.Now()`, so the reversal lands in
 * the range containing the cancellation, not the one containing the posting. A
 * month that looks out of balance against its documents is usually this.
 */
import type { components } from '@/types/api';

import { buildQuery } from '@/services/api';
import { authedRequest } from '@/services/client';

export type NilaiPersediaan = components['schemas']['NilaiPersediaan'];
export type LabaKotor = components['schemas']['LabaKotor'];
export type Pergerakan = components['schemas']['Pergerakan'];
export type KesehatanStok = components['schemas']['KesehatanStok'];

/**
 * What the stock is worth right now, one row per room.
 *
 * `ruang.is_aktif` is **never** a filter here, and the contract says so in as
 * many words: a retired room that still holds goods still holds their value,
 * and a report that hid it would lie about the balance sheet. So a room may
 * appear in this list that appears nowhere else in the app.
 */
export function laporanNilaiPersediaan(query: { id_ruang?: number } = {}): Promise<NilaiPersediaan[]> {
  return authedRequest<NilaiPersediaan[]>(
    `/api/v1/laporan/nilai-persediaan${buildQuery({ ...query })}`
  );
}

/**
 * Gross profit per calendar month, chronological.
 *
 * **`total_penjualan` is already net of PPN**, and that is the one thing to get
 * right when drawing it. Output VAT collected at the till is the state's money
 * passing through a receipt, not the shop's revenue; counting it as turnover
 * would overstate the margin every month by exactly the tax. It is still
 * reported separately as `total_ppn`, so `total_penjualan + total_ppn` still
 * equals the sum of the notas' own `total` — which means a screen must never add
 * the two together and call the result sales.
 *
 * Cancelled notas are excluded. There is no `retur_penjualan` module yet, so
 * nothing here is reduced for a sale that was later handed back; when that
 * module lands its credit joins this sum beside `total_hpp`.
 */
export function laporanLabaKotor(
  query: { dari?: string; sampai?: string } = {}
): Promise<LabaKotor[]> {
  return authedRequest<LabaKotor[]>(`/api/v1/laporan/laba-kotor${buildQuery({ ...query })}`);
}

/**
 * What moved, grouped by `(barang, ruang, jenis_transaksi)`.
 *
 * This is the read that answers "where did this go last month", and the one that
 * makes shrinkage found by a `stok_opname` show up as a monthly figure rather
 * than as a pile of individual documents.
 *
 * Quantities are integers in the product's **base** unit — `kartu_stok` knows
 * only base units and conversion is the client's business — so a figure here is
 * never labelled with the unit somebody typed on a nota.
 */
export function laporanPergerakan(
  query: { dari?: string; sampai?: string; id_ruang?: number; id_product?: number } = {}
): Promise<Pergerakan[]> {
  return authedRequest<Pergerakan[]>(`/api/v1/laporan/pergerakan${buildQuery({ ...query })}`);
}

/**
 * Issue #37 — the stock-health score Beranda used to derive from two counts
 * of its own (`docs/endpoint-api.md` #15, now closed). `skor` and `status` are
 * `null` when nothing in scope could be scored, never a fabricated 0; a caller
 * must check for that before drawing the score card. No `page`/`size` — like
 * the rest of this module, it is one answer, not a list.
 */
export function laporanKesehatanStok(query: { id_ruang?: number } = {}): Promise<KesehatanStok> {
  return authedRequest<KesehatanStok>(
    `/api/v1/laporan/kesehatan-stok${buildQuery({ ...query })}`
  );
}

/**
 * The first and last day of a month, as the `date` strings these endpoints take.
 *
 * Built from local parts rather than from `toISOString()`, which converts to UTC
 * first: east of Greenwich that turns the first of the month into the last day
 * of the previous one, and a report would quietly start a day early. `new
 * Date(y, m, 0)` is the last day of month `m` for the same reason it always is —
 * day zero of the next month.
 */
export function rentangBulan(tahun: number, bulan1: number): { dari: string; sampai: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const akhir = new Date(tahun, bulan1, 0).getDate();
  return {
    dari: `${tahun}-${pad(bulan1)}-01`,
    sampai: `${tahun}-${pad(bulan1)}-${pad(akhir)}`,
  };
}

/** `"2026-08"` as `"Agustus 2026"`. The wire format is not a label. */
const BULAN_PANJANG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function namaBulan(kode: string | undefined): string {
  if (!kode) return '—';
  const [tahun, bulan] = kode.split('-');
  const i = Number(bulan) - 1;
  if (!BULAN_PANJANG[i]) return kode;
  return `${BULAN_PANJANG[i]} ${tahun}`;
}
