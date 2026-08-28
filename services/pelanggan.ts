/**
 * The `/api/v1/pelanggan` group.
 *
 * Writing here belongs to `CASHIER` (or `SUPERADMIN`), not `INVENTARIS` —
 * pelanggan is the one master record the contract hands to the sales side.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiPelanggan = components['schemas']['Pelanggan'];

export type PiutangNota = components['schemas']['PiutangPelanggan'];

export interface Pelanggan {
  id: number;
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
  aktif: boolean;
  /**
   * Decimal string, or `null` for **no limit at all**. `null` and `"0.00"` are
   * opposites here: the first never blocks a credit sale, the second blocks
   * every one of them.
   */
  plafon: string | null;
}

function toPelanggan(p: ApiPelanggan): Pelanggan {
  return {
    id: p.id ?? 0,
    kode: p.kode ?? '',
    nama: p.nama ?? '',
    telepon: p.telepon ?? '',
    alamat: p.alamat ?? '',
    npwp: p.npwp ?? '',
    aktif: p.is_aktif ?? true,
    plafon: p.plafon_kredit ?? null,
  };
}

/**
 * Customer writes announced to whichever pelanggan screens are mounted — the
 * detail saves, the list underneath it patches the row it already has. See
 * `hooks/use-record-bus.ts`.
 */
export const pelangganBus = createRecordBus<Pelanggan>();

export async function listPelanggan(query: ListQuery): Promise<Paged<Pelanggan>> {
  const page = await authedList<ApiPelanggan>(`/api/v1/pelanggan${buildQuery({ ...query })}`);
  return { data: page.data.map(toPelanggan), paging: page.paging };
}

export async function getPelanggan(id: number): Promise<Pelanggan> {
  return toPelanggan(await authedRequest<ApiPelanggan>(`/api/v1/pelanggan/${id}`));
}

export interface PelangganBody {
  kode?: string | null;
  nama?: string;
  telepon?: string | null;
  alamat?: string | null;
  npwp?: string | null;
  plafon_kredit?: string | null;
  is_aktif?: boolean;
}

/** `kode` is optional and unique case-insensitively; a duplicate answers 409. */
export async function createPelanggan(body: PelangganBody): Promise<Pelanggan> {
  return toPelanggan(
    await authedRequest<ApiPelanggan>('/api/v1/pelanggan', { method: 'POST', body })
  );
}

/**
 * Unlike produk, `kode` **is** editable here. There is no DELETE in this group:
 * retiring a customer is `is_aktif: false`.
 */
export async function updatePelanggan(id: number, body: PelangganBody): Promise<Pelanggan> {
  return toPelanggan(
    await authedRequest<ApiPelanggan>(`/api/v1/pelanggan/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Open `KREDIT` notes, oldest first — a collection queue, not a history. Cash
 * notes never appear: they are `LUNAS` the moment they are posted.
 *
 * `sisa_piutang` currently equals `total`, because nothing that could reduce it
 * exists yet (`retur-penjualan`, `penerimaan-pembayaran`). The shape will not
 * change when they arrive.
 */
export async function listPiutang(id: number, query: ListQuery = {}): Promise<Paged<PiutangNota>> {
  return authedList<PiutangNota>(`/api/v1/pelanggan/${id}/piutang${buildQuery({ ...query })}`);
}
