/**
 * The `/api/v1/pembelian` group — **the list read only**.
 *
 * Layar Pembelian (isu #8) owns this module properly: creating drafts, editing
 * lines, ajukan / posting / batal, and the detail read that carries `detail`.
 * What lives here is the one call the Supplier screen needs to answer "what have
 * we bought from this supplier", and it is deliberately the narrowest thing that
 * answers it. Extend it there rather than reaching past it from another screen.
 */
import { buildQuery, type Paged } from '@/services/api';
import { authedList } from '@/services/client';
import type { components } from '@/types/api';

type ApiPembelian = components['schemas']['Pembelian'];

export type StatusDokumen = NonNullable<ApiPembelian['status']>;
export type JenisPembayaran = NonNullable<ApiPembelian['jenis_pembayaran']>;
export type StatusPembayaran = NonNullable<ApiPembelian['status_pembayaran']>;

/**
 * One document as the list reports it. `detail` is **absent** on this endpoint,
 * not empty — fetching the lines is one query per row, so the contract leaves
 * the key off entirely and points at the detail endpoint instead.
 */
export interface PembelianRow {
  id: number;
  nomor: string;
  /** Date-time. The document's own date, which is not always the invoice's. */
  tanggal: string;
  idSupplier: number;
  namaSupplier: string;
  noFakturSupplier: string;
  /** Date, and nullable: a document may be typed before the paper arrives. */
  tanggalFaktur: string | null;
  /** Decimal string. Excludes `biaya_angkut` — that is the carrier's bill, not the supplier's. */
  total: string;
  jenis: JenisPembayaran;
  statusBayar: StatusPembayaran;
  status: StatusDokumen;
}

function toRow(p: ApiPembelian): PembelianRow {
  return {
    id: p.id ?? 0,
    nomor: p.nomor ?? '',
    tanggal: p.tanggal ?? '',
    idSupplier: p.id_supplier ?? 0,
    namaSupplier: p.nama_supplier ?? '',
    noFakturSupplier: p.no_faktur_supplier ?? '',
    tanggalFaktur: p.tanggal_faktur ?? null,
    total: p.total ?? '0.00',
    jenis: p.jenis_pembayaran ?? 'TUNAI',
    statusBayar: p.status_pembayaran ?? 'BELUM',
    status: p.status ?? 'DRAFT',
  };
}

export interface PembelianQuery {
  page?: number;
  size?: number;
  /** Partial match on the document number **or** the supplier's invoice number. */
  search?: string;
  status?: StatusDokumen;
  idSupplier?: number;
  /** Inclusive, whole days. */
  tanggalDari?: string;
  tanggalSampai?: string;
}

/**
 * Sorted `tanggal DESC, id DESC` — newest first, with a unique tiebreaker so a
 * row cannot appear on two pages while another never surfaces.
 *
 * Documents in a ruang outside the session's active unit kerja are skipped
 * silently, and `total_item` is counted after that filtering. A supplier can
 * therefore look emptier here than the server's own books are.
 */
export async function listPembelian(query: PembelianQuery = {}): Promise<Paged<PembelianRow>> {
  const { idSupplier, tanggalDari, tanggalSampai, ...rest } = query;
  const page = await authedList<ApiPembelian>(
    `/api/v1/pembelian${buildQuery({
      ...rest,
      id_supplier: idSupplier,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}
