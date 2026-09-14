/**
 * The `/api/v1/ruang` group.
 *
 * A ruang is the destination of every document that moves stock, so a picker
 * for one is the first thing any of those screens needs — that read is the
 * whole reason this module existed before issue #23. The writes below are
 * `app/pengaturan/`'s: creating a ruang, correcting its name, and retiring
 * one. `kode` is generated server-side and this app never types it.
 *
 * `GET /ruang` already filters to the ruang inside the session's active unit
 * kerja — rooms outside it are skipped silently, with no error — **except**
 * for a global context (a grant with no `id_unit_kerja` of its own), which
 * sees every ruang in every unit. That is exactly the set `POST /pembelian`
 * will accept for `id_ruang`, so a stock-movement picker needs no filtering of
 * its own. `app/pengaturan/[id]/index.tsx` is the one screen that has to
 * filter this list itself — down to one unit kerja's rooms — and say out loud
 * when the session cannot see the unit it is looking at.
 */
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import { createRecordBus } from '@/hooks/use-record-bus';
import type { components } from '@/types/api';

type ApiRuang = components['schemas']['Ruang'];

export interface RuangRow {
  id: number;
  /** Optional and unique case-insensitively; several ruang may share the empty one. */
  kode: string;
  nama: string;
  idUnitKerja: number;
  namaUnitKerja: string;
  aktif: boolean;
  /**
   * The `stok_opname` number currently freezing this ruang, or `null` when it
   * is free.
   *
   * Worth showing wherever a ruang is chosen: an open stock take freezes its
   * room and the `kartu_stok` trigger then refuses **every** posting into it,
   * from any module. A pembelian typed into a frozen room saves and submits
   * fine and only fails at posting, which is the worst place to find out.
   */
  nomorOpnameBeku: string | null;
}

function toRow(r: ApiRuang): RuangRow {
  return {
    id: r.id ?? 0,
    kode: r.kode ?? '',
    nama: r.nama_ruang ?? '',
    idUnitKerja: r.id_unit_kerja ?? 0,
    namaUnitKerja: r.nama_unit_kerja ?? '',
    aktif: r.is_aktif ?? true,
    nomorOpnameBeku: r.nomor_opname_beku ?? null,
  };
}

/**
 * Writes announced to whichever ruang screens are mounted: the unit kerja
 * detail's embedded room list patches its row, and the ruang detail patches
 * itself. One bus is enough here — unlike `supplierBus`/`supplierDetailBus`,
 * nothing on the ruang detail screen re-derives its own toggle message from
 * this subscription, so a screen receiving its own publish back is a harmless
 * no-op rather than an echo that overwrites something more specific.
 */
export const ruangBus = createRecordBus<RuangRow>();

/** `search` matches part of the kode or the nama; `%` and `_` are plain text. */
export async function listRuang(query: ListQuery = {}): Promise<Paged<RuangRow>> {
  const page = await authedList<ApiRuang>(`/api/v1/ruang${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/** A ruang outside the session's active unit kerja answers 404, like an id that never existed. */
export async function getRuang(id: number): Promise<RuangRow> {
  return toRow(await authedRequest<ApiRuang>(`/api/v1/ruang/${id}`));
}

export interface RuangCreateBody {
  kode?: string | null;
  nama_ruang: string;
  /** Must point at a unit kerja that is still `is_aktif`; cannot be changed after creation. */
  id_unit_kerja: number;
}

export async function createRuang(body: RuangCreateBody): Promise<RuangRow> {
  return toRow(await authedRequest<ApiRuang>('/api/v1/ruang', { method: 'POST', body }));
}

export interface RuangUpdateBody {
  /** `null` clears the column, `undefined` leaves it alone. `id_unit_kerja` is deliberately absent — the contract has no way to move a ruang once created. */
  kode?: string | null;
  nama_ruang?: string;
  /**
   * Retiring a ruang answers 409 while it still holds stock (`stok_akhir > 0`
   * on some product) or while a `stok_opname` has it frozen — the server names
   * which, the same way it names `nomor_opname_beku` on the row itself.
   */
  is_aktif?: boolean;
}

export async function updateRuang(id: number, body: RuangUpdateBody): Promise<RuangRow> {
  return toRow(await authedRequest<ApiRuang>(`/api/v1/ruang/${id}`, { method: 'PATCH', body }));
}
