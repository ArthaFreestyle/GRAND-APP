/**
 * The `/api/v1/ruang` group — **the list read only**.
 *
 * A ruang is the destination of every document that moves stock, so a picker
 * for one is the first thing any of those screens needs. That is all this
 * module answers today; `unit-kerja-ruang.tsx` still runs on seeded rows and
 * owns the writes when it is wired.
 *
 * `GET /ruang` already filters to the ruang inside the session's active unit
 * kerja — rooms outside it are skipped silently, with no error — which is
 * exactly the set `POST /pembelian` will accept for `id_ruang`. So the picker
 * needs no filtering of its own: whatever comes back is what may be chosen.
 */
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList } from '@/services/client';
import type { components } from '@/types/api';

type ApiRuang = components['schemas']['Ruang'];

export interface RuangRow {
  id: number;
  /** Optional and unique case-insensitively; several ruang may share the empty one. */
  kode: string;
  nama: string;
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
    namaUnitKerja: r.nama_unit_kerja ?? '',
    aktif: r.is_aktif ?? true,
    nomorOpnameBeku: r.nomor_opname_beku ?? null,
  };
}

/** `search` matches part of the kode or the nama; `%` and `_` are plain text. */
export async function listRuang(query: ListQuery = {}): Promise<Paged<RuangRow>> {
  const page = await authedList<ApiRuang>(`/api/v1/ruang${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}
