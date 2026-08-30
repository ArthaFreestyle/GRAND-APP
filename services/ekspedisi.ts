/**
 * The `/api/v1/ekspedisi` group — **reads only**.
 *
 * The carrier on a pembelian is a label, not a calculation: `biaya_angkut` is
 * `total_koli x tarif_per_koli` and never looks at who carried the goods. So a
 * picker and a name lookup are all the purchase screen needs, and there is no
 * screen that owns ekspedisi writes yet.
 */
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiEkspedisi = components['schemas']['Ekspedisi'];

export interface EkspedisiRow {
  id: number;
  nama: string;
  telepon: string;
  aktif: boolean;
}

/** `search` matches part of the nama **or the telepon** — unusual, and useful. */
export async function listEkspedisi(query: ListQuery = {}): Promise<Paged<EkspedisiRow>> {
  const page = await authedList<ApiEkspedisi>(`/api/v1/ekspedisi${buildQuery({ ...query })}`);
  return {
    data: page.data.map((e) => ({
      id: e.id ?? 0,
      nama: e.nama ?? '',
      telepon: e.telepon ?? '',
      aktif: e.is_aktif ?? true,
    })),
    paging: page.paging,
  };
}

/**
 * One carrier by id.
 *
 * `Pembelian` carries `id_ekspedisi` and no name — so a document that names a
 * carrier needs this one call to say who it is. Worth it over inventing a
 * placeholder: "Ekspedisi #4" tells a reader nothing they could act on.
 */
export async function getEkspedisi(id: number): Promise<EkspedisiRow> {
  const e = await authedRequest<ApiEkspedisi>(`/api/v1/ekspedisi/${id}`);
  return {
    id: e.id ?? 0,
    nama: e.nama ?? '',
    telepon: e.telepon ?? '',
    aktif: e.is_aktif ?? true,
  };
}
