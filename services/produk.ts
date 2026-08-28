/**
 * The `/api/v1/product` group, mapped onto the shapes the Master Produk screen
 * renders.
 *
 * Every write here answers with the whole `Product`, so a mutation and a
 * refresh are one round trip: callers replace their detail state with what
 * comes back rather than patching it locally and hoping the two agree.
 */
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiProduct = components['schemas']['Product'];
type ApiSatuan = components['schemas']['Satuan'];

export type StokRuang = components['schemas']['StokRuang'];

/** One row of the product list. `GET /product` carries no satuan, harga, or stock. */
export interface ProductRow {
  id: number;
  kode: string;
  nama: string;
  namaSatuanDasar: string;
  stokMin: number;
  aktif: boolean;
  updatedAt: string;
}

export interface ProductSatuanRow {
  id: number;
  idSatuan: number;
  nama: string;
  faktor: number;
  /** `is_default_input` — at most one per product, moved rather than duplicated. */
  def: boolean;
}

export interface ProductHargaRow {
  id: number;
  idSatuan: number;
  nama: string;
  /** Decimal string, never a float: NUMERIC(20,2) must survive the trip unrounded. */
  harga: string;
  dari: string;
  /** **Exclusive**, and `null` means open-ended. */
  sampai: string | null;
}

export interface ProductDetail extends ProductRow {
  idDasar: number;
  satuan: ProductSatuanRow[];
  harga: ProductHargaRow[];
}

function toRow(p: ApiProduct): ProductRow {
  return {
    id: p.id ?? 0,
    kode: p.kode_barang ?? '',
    nama: p.nama ?? '',
    namaSatuanDasar: p.nama_satuan_dasar ?? '',
    stokMin: p.stok_minimum ?? 0,
    aktif: p.is_aktif ?? true,
    updatedAt: p.updated_at ?? p.created_at ?? '',
  };
}

function toDetail(p: ApiProduct): ProductDetail {
  return {
    ...toRow(p),
    idDasar: p.id_satuan_dasar ?? 0,
    // Already ordered by faktor server-side, so the base unit comes first.
    satuan: (p.satuan ?? []).map((s) => ({
      id: s.id ?? 0,
      idSatuan: s.id_satuan ?? 0,
      nama: s.nama_satuan ?? '',
      faktor: s.faktor ?? 1,
      def: s.is_default_input ?? false,
    })),
    // Already newest-first server-side.
    harga: (p.harga_jual ?? []).map((h) => ({
      id: h.id ?? 0,
      idSatuan: h.id_satuan ?? 0,
      nama: h.nama_satuan ?? '',
      harga: h.harga ?? '0',
      dari: h.berlaku_dari ?? '',
      sampai: h.berlaku_sampai ?? null,
    })),
  };
}

export async function listProducts(query: ListQuery): Promise<Paged<ProductRow>> {
  const page = await authedList<ApiProduct>(`/api/v1/product${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/**
 * One row of `GET /product/stok-minimum` - the reorder work list.
 *
 * A separate endpoint rather than a filter on `GET /product`, because the list
 * payload carries no stock at all: asking for it per row is the N+1 the
 * contract warns against. It answers only `is_aktif` products, never those with
 * `stok_minimum = 0` (that is the column default, meaning "not set" rather than
 * "may run out"), and it arrives sorted worst-first by `selisih`.
 */
export interface StokMinimumRow {
  id: number;
  kode: string;
  nama: string;
  stokMin: number;
  totalStok: number;
  /** `stok_minimum - total_stok`, never negative here. */
  selisih: number;
}

export async function listStokMinimum(
  query: { page?: number; size?: number; id_ruang?: number } = {}
): Promise<Paged<StokMinimumRow>> {
  const page = await authedList<components['schemas']['StokMinimum']>(
    `/api/v1/product/stok-minimum${buildQuery({ ...query })}`
  );
  return {
    data: page.data.map((r) => ({
      id: r.id_product ?? 0,
      kode: r.kode_barang ?? '',
      nama: r.nama_product ?? '',
      stokMin: r.stok_minimum ?? 0,
      totalStok: r.total_stok ?? 0,
      selisih: r.selisih ?? 0,
    })),
    paging: page.paging,
  };
}

export async function getProduct(id: number): Promise<ProductDetail> {
  return toDetail(await authedRequest<ApiProduct>(`/api/v1/product/${id}`));
}

export interface CreateProductBody {
  kode_barang: string;
  nama: string;
  id_satuan_dasar: number;
  stok_minimum?: number;
}

/**
 * The base unit is registered automatically with `faktor = 1`, so `satuan` is
 * left out here — the screen adds conversions afterwards.
 */
export async function createProduct(body: CreateProductBody): Promise<ProductDetail> {
  return toDetail(await authedRequest<ApiProduct>('/api/v1/product', { method: 'POST', body }));
}

/**
 * Only `nama`, `stok_minimum`, and `is_aktif` — `kode_barang` and
 * `id_satuan_dasar` are immutable by contract: the code names the item in every
 * document that references it, and changing the base unit would invalidate every
 * `faktor` and every quantity already posted to `kartu_stok`.
 */
export async function updateProduct(
  id: number,
  body: { nama?: string; stok_minimum?: number; is_aktif?: boolean }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Adds a conversion, or updates the `faktor` of one already registered — the
 * endpoint upserts rather than rejecting, so a success never means something
 * different from what was asked was stored. `is_default_input: true` *moves* the
 * marker; the previous holder is cleared in the same transaction.
 */
export async function upsertSatuan(
  id: number,
  body: { id_satuan: number; faktor: number; is_default_input: boolean }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/satuan`, { method: 'POST', body })
  );
}

/**
 * Opens a new price version. Any version still open for the same product and
 * unit is closed at `berlaku_dari` in the same transaction — the range is
 * half-open, so that leaves neither a gap nor an overlap. Overlaps answer 409,
 * enforced by an exclusion constraint that no client-side check can stand in for.
 */
export async function addHarga(
  id: number,
  body: { id_satuan: number; harga: string; berlaku_dari: string }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual`, { method: 'POST', body })
  );
}

/** Corrects the amount on an existing version. 409 once a nota references it. */
export async function updateHarga(
  id: number,
  idHarga: number,
  harga: string
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual/${idHarga}`, {
      method: 'PATCH',
      body: { harga },
    })
  );
}

/**
 * Removes a version and reopens the one before it, so deleting never leaves a
 * date range with no price at all. A hard delete, allowed only while no document
 * references the row — otherwise 409.
 */
export async function deleteHarga(id: number, idHarga: number): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual/${idHarga}`, {
      method: 'DELETE',
    })
  );
}

/**
 * Balance per ruang, straight off `kartu_stok`. Not paginated, unlike every
 * other list here. Rooms outside the session's active unit kerja are skipped
 * silently, and rooms the product never passed through never appear.
 *
 * **A reading, not a guarantee** — the figure can be stale before it is acted
 * on. Show it; do not decide on it.
 */
export function listStok(id: number): Promise<StokRuang[]> {
  return authedRequest<StokRuang[]>(`/api/v1/product/${id}/stok`);
}

/** Master satuan, for the unit dropdowns. */
export async function listSatuan(): Promise<ApiSatuan[]> {
  const page = await authedList<ApiSatuan>(
    `/api/v1/satuan${buildQuery({ size: 100, is_aktif: true })}`
  );
  return page.data;
}
