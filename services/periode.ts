/**
 * Periode — tutup buku per bulan (issue #12).
 *
 * Closing a month makes every write to `kartu_stok` dated inside it fail with
 * **400**, from every module, enforced by a trigger — so a module written after
 * this one inherits the rule without a line of code. That is also why this
 * module matters beyond its own screen: without it a posting starts failing
 * and nothing in the app can say which month is closed or who closed it.
 *
 * ## Three shapes to know
 *
 * **A month with no row is open.** The table records closings, not a calendar:
 * `GET /periode` lists only months that were ever closed, while
 * `GET /periode/{tahun}/{bulan}` answers a synthetic `BUKA` for any month. A
 * screen drawing a year therefore draws twelve months and fills in the rows it
 * got, rather than drawing only what the list returned.
 *
 * **Identity is `(tahun, bulan)`.** `Periode` carries no `id`, on purpose, so a
 * never-closed month has exactly the same shape as a closed one.
 *
 * **Both transitions are `SUPERADMIN`, and both answer 409 when there is
 * nothing to change** — closing a closed month, opening a month that is not
 * closed (including one with no row). There is no `DELETE`: a month closed by
 * mistake is opened again, and the history of both stays on the row.
 */
import type { components } from '@/types/api';

import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';

export type Periode = components['schemas']['Periode'];
export type StatusPeriode = NonNullable<Periode['status']>;

export function listPeriode(
  query: { page?: number; size?: number; tahun?: number; status?: StatusPeriode } = {}
): Promise<Paged<Periode>> {
  return authedList<Periode>(`/api/v1/periode${buildQuery({ ...query })}`);
}

export function getPeriode(tahun: number, bulan: number): Promise<Periode> {
  return authedRequest<Periode>(`/api/v1/periode/${tahun}/${bulan}`);
}

/** No body: the month is the path, and who closed it comes from the token. */
export function tutupPeriode(tahun: number, bulan: number): Promise<Periode> {
  return authedRequest<Periode>(`/api/v1/periode/${tahun}/${bulan}/tutup`, { method: 'POST' });
}

export function bukaPeriode(tahun: number, bulan: number): Promise<Periode> {
  return authedRequest<Periode>(`/api/v1/periode/${tahun}/${bulan}/buka`, { method: 'POST' });
}

/**
 * The month a rejected posting names, when it was rejected for a closed period.
 *
 * The contract documents the message rather than a code: the Go side checks the
 * period before the trigger does precisely so the 400 can say "periode 2026-07
 * sudah TUTUP". A message is a weaker hook than an error code, so this answers
 * `null` for anything it does not recognise and the caller simply shows the
 * message as it came — the worst case of a reworded server message is the
 * behaviour before this function existed, never a wrong link.
 */
export function periodeTertutup(message: string): { tahun: number; bulan: number } | null {
  const m = /periode\s+(\d{4})-(\d{1,2})\s+sudah\s+TUTUP/i.exec(message);
  if (!m) return null;
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  return bulan >= 1 && bulan <= 12 ? { tahun, bulan } : null;
}
