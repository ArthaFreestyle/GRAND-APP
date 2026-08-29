/**
 * The `/api/v1/supplier` group.
 *
 * Writing here belongs to `INVENTARIS` (or `SUPERADMIN`): the contract splits
 * master data by who owns it, and supplier sits on the purchasing side next to
 * barang, satuan, ruang, and ekspedisi — not next to pelanggan, which is the
 * sales side's record.
 *
 * **Five fields the mock screen had are not in the contract**, and none of them
 * are faked here:
 *
 * - `tipe` (distributor / pabrik / perorangan) — no column, and nothing else in
 *   the API branches on it. Its filter pills are replaced by `is_aktif`, which
 *   the list endpoint really does accept.
 * - `narahubung` and `email` — no column. A PIC name can be typed into
 *   `alamat`, which is 1000 characters, but it cannot be searched or shown as
 *   its own field.
 * - `kota` — no column; it is part of `alamat`. `search` matches kode and nama
 *   only, so a city filter was never going to work server-side anyway.
 * - `tempo` (payment terms in days) — no column here, **and no consumer
 *   anywhere**: `Pembelian` has no `tanggal_jatuh_tempo`, and neither does
 *   `UtangSupplier`. Storing it would only let the client invent a due date the
 *   server would never agree with. Layar Pembelian (isu #8) computes its
 *   "jatuh tempo" chips from exactly this invented number today; they have to
 *   go the same way. `UtangSupplier.status_pembayaran` is what the server
 *   actually knows about a bill: BELUM / SEBAGIAN / LUNAS, no date.
 *
 * There is also no per-row utang on the list: `GET /supplier` carries kode,
 * nama, telepon, alamat, npwp, is_aktif and audit columns, nothing else. A
 * "hutang" column would mean one `GET /supplier/{id}/utang` per visible row —
 * the same N+1 the contract warns about for product stock — so the balance
 * lives on the detail screen, where one supplier means one call.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiSupplier = components['schemas']['Supplier'];

/** One still-open purchase invoice, as `GET /supplier/{id}/utang` reports it. */
export type UtangFaktur = components['schemas']['UtangSupplier'];

export interface Supplier {
  id: number;
  /** Optional and unique case-insensitively; several suppliers may share the empty one. */
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  npwp: string;
  aktif: boolean;
}

function toSupplier(s: ApiSupplier): Supplier {
  return {
    id: s.id ?? 0,
    kode: s.kode ?? '',
    nama: s.nama ?? '',
    telepon: s.telepon ?? '',
    alamat: s.alamat ?? '',
    npwp: s.npwp ?? '',
    aktif: s.is_aktif ?? true,
  };
}

/**
 * Supplier writes announced to whichever supplier screens are mounted — the
 * detail saves, the list underneath it patches the row it already has. See
 * `hooks/use-record-bus.ts`.
 */
export const supplierBus = createRecordBus<Supplier>();

/** `search` matches part of the kode or the nama — not the address, not the NPWP. */
export async function listSupplier(query: ListQuery): Promise<Paged<Supplier>> {
  const page = await authedList<ApiSupplier>(`/api/v1/supplier${buildQuery({ ...query })}`);
  return { data: page.data.map(toSupplier), paging: page.paging };
}

export async function getSupplier(id: number): Promise<Supplier> {
  return toSupplier(await authedRequest<ApiSupplier>(`/api/v1/supplier/${id}`));
}

export interface SupplierBody {
  /**
   * `null` clears the column, `undefined` leaves it alone — the PATCH is a true
   * partial update, so the two are not interchangeable.
   */
  kode?: string | null;
  nama?: string;
  telepon?: string | null;
  alamat?: string | null;
  npwp?: string | null;
  is_aktif?: boolean;
}

/** Only `nama` is required. A duplicate `kode` answers 409, and the server names it. */
export async function createSupplier(body: SupplierBody): Promise<Supplier> {
  return toSupplier(
    await authedRequest<ApiSupplier>('/api/v1/supplier', { method: 'POST', body })
  );
}

/**
 * `PATCH`, not `PUT` — the contract has no `PUT` here, and no `DELETE` either.
 * Retiring a supplier is `is_aktif: false`, which is why the screen offers it
 * as a reversible toggle rather than a destructive confirm.
 */
export async function updateSupplier(id: number, body: SupplierBody): Promise<Supplier> {
  return toSupplier(
    await authedRequest<ApiSupplier>(`/api/v1/supplier/${id}`, { method: 'PATCH', body })
  );
}

export interface UtangQuery {
  page?: number;
  size?: number;
  /**
   * Bring settled invoices along too. Off by default on the server, because the
   * point of the list is the ones still open.
   */
  termasukLunas?: boolean;
}

/**
 * The bills this supplier is still owed money on, **oldest first** — the one
 * list in the whole API sorted that way, because it is a work queue and the
 * invoice that has waited longest is the one paid next. Do not re-sort it.
 *
 * An unknown supplier answers 404; a supplier with no debt answers an empty
 * page. Those are two different facts and the screen keeps them apart.
 */
export async function listUtang(id: number, query: UtangQuery = {}): Promise<Paged<UtangFaktur>> {
  const { termasukLunas, ...paging } = query;
  return authedList<UtangFaktur>(
    `/api/v1/supplier/${id}/utang${buildQuery({ ...paging, termasuk_lunas: termasukLunas })}`
  );
}
