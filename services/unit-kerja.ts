/**
 * The `/api/v1/unit-kerja` group — the organizational location every `ruang`
 * belongs to, and the thing a grant can be scoped to.
 *
 * There was no service for this at all before issue #23: the app only ever
 * knew a unit kerja's *name* incidentally, off `ruang.nama_unit_kerja` and off
 * the grants in a session. `GET /unit-kerja` is not scoped to the caller's
 * active unit the way `GET /ruang` is — it lists every unit kerja that exists,
 * because this is the one screen whose whole job is managing units other than
 * the one you happen to be standing in.
 *
 * **Who may write here is a guess.** `services/permissions.ts` reads
 * `unit-kerja` as `SUPERADMIN`-only because the contract's role prose never
 * names it among barang/satuan/ruang/ekspedisi/supplier/pelanggan — the
 * stricter reading. If that guess is wrong, the fix is one line in
 * `permissions.ts`, not here.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiUnitKerja = components['schemas']['UnitKerja'];

export interface UnitKerjaRow {
  id: number;
  /** Optional and unique case-insensitively; several units may share the empty one. */
  kode: string;
  nama: string;
  aktif: boolean;
  createdAt: string;
  updatedAt: string;
  /** Null on the wire while a row predates the auth module; empty here. */
  namaPembuat: string;
}

function toRow(u: ApiUnitKerja): UnitKerjaRow {
  return {
    id: u.id ?? 0,
    kode: u.kode ?? '',
    nama: u.nama ?? '',
    aktif: u.is_aktif ?? true,
    createdAt: u.created_at ?? '',
    updatedAt: u.updated_at ?? u.created_at ?? '',
    namaPembuat: u.nama_pembuat ?? '',
  };
}

/**
 * The detail's writes, announced back to the list underneath it — the same
 * split `supplierBus` / `supplierDetailBus` make and for the same reason: a
 * retirement published on the detail's own bus would otherwise echo back to
 * itself as somebody else's change.
 */
export const unitKerjaBus = createRecordBus<UnitKerjaRow>();
export const unitKerjaDetailBus = createRecordBus<UnitKerjaRow>();

/** `search` matches part of the kode or the nama. */
export async function listUnitKerja(query: ListQuery = {}): Promise<Paged<UnitKerjaRow>> {
  const page = await authedList<ApiUnitKerja>(`/api/v1/unit-kerja${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

export async function getUnitKerja(id: number): Promise<UnitKerjaRow> {
  return toRow(await authedRequest<ApiUnitKerja>(`/api/v1/unit-kerja/${id}`));
}

export interface UnitKerjaBody {
  /** `null` clears the column, `undefined` leaves it alone on a `PATCH`. */
  kode?: string | null;
  nama?: string;
  is_aktif?: boolean;
}

/** Only `nama` is required. A duplicate `kode` answers 409, and the server names it. */
export async function createUnitKerja(body: UnitKerjaBody): Promise<UnitKerjaRow> {
  return toRow(
    await authedRequest<ApiUnitKerja>('/api/v1/unit-kerja', { method: 'POST', body })
  );
}

/**
 * `PATCH`, not `PUT` — the contract has no `PUT` and no `DELETE` here either.
 *
 * Deactivating a unit kerja is not a plain retirement toggle the way a supplier
 * or a ruang is: every grant that names this unit stops being usable and drops
 * out of its holder's `grants` on their next login. The screen that calls this
 * with `is_aktif: false` is the one place that effect has to be said out loud
 * *before* the request, because nothing in the response says it afterwards.
 */
export async function updateUnitKerja(id: number, body: UnitKerjaBody): Promise<UnitKerjaRow> {
  return toRow(
    await authedRequest<ApiUnitKerja>(`/api/v1/unit-kerja/${id}`, { method: 'PATCH', body })
  );
}
