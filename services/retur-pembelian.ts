/**
 * The `/api/v1/retur-pembelian` group — goods going back to the supplier.
 *
 * The mirror of `services/penerimaan-susulan.ts`: both hang off a POSTED
 * pembelian, both point at its `pembelian_detail` rows, both copy the harga
 * pokok fixed there. Only the direction of the goods differs.
 *
 * ### The cap is what arrived, not what was invoiced
 *
 * A line may be returned up to `qty_diterima_dasar + POSTED susulan - POSTED
 * retur` — `qtyDapatDiretur` in `services/pembelian.ts`. `qty_dasar` is
 * deliberately not in that sum: what was invoiced is what the supplier billed,
 * and goods that never turned up cannot be sent back. A short delivery is chased
 * with a susulan, never with a return, and the two caps are on different axes —
 * one line can be short *and* returnable at the same time.
 *
 * ### Three amounts, and none of them is the other
 *
 * - `total` — the inventory value leaving, at the harga pokok the invoice fixed.
 *   This is what makes a pembelian and its return cancel out.
 * - `nilaiKreditUtang` — what the supplier actually credits, `pembelian.total x
 *   nilai_faktur_retur / pembelian.subtotal`, so the nota discount and the PPN
 *   scale with it. It is **not** `total`, because harga pokok carries a share of
 *   the freight paid to the carrier and crediting that hands the supplier money
 *   they never received. Zero until POSTED, frozen at posting, and left standing
 *   on a `BATAL` document as a record of what was once claimed.
 * - What `kartu_stok` records, which is neither: an outgoing line is valued at
 *   the moving average in force at the time, because the goods mixed with older
 *   stock the moment they arrived. Both answers are right, to different
 *   questions — so this module models the first two and never pretends to know
 *   the third.
 *
 * `alasan` is nullable in the schema and mandatory in practice. It is the only
 * record of why goods that were already paid for went back, and it is what gets
 * read out to the supplier.
 *
 * Posting deliberately does **not** recompute `pembelian.status_penerimaan`:
 * sending goods back does not make a delivery incomplete, and does not put the
 * supplier back in debt of goods.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen, type StatusAlur } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiRetur = components['schemas']['ReturPembelian'];
type ApiReturDetail = components['schemas']['ReturPembelianDetail'];

export type { AksiDokumen } from '@/services/alur-dokumen';

/** One document as the list reports it — `detail` is absent on that endpoint. */
export interface ReturRow {
  id: number;
  nomor: string;
  /** Date-time. */
  tanggal: string;
  idPembelian: number;
  nomorPembelian: string;
  idSupplier: number;
  namaSupplier: string;
  alasan: string;
  /** Inventory value leaving, at the invoice's harga pokok. */
  total: string;
  /** What the supplier credits. `0.00` until POSTED. */
  nilaiKreditUtang: string;
  status: StatusAlur;
}

/** One line, pointing at the invoice line the goods came in through. */
export interface ReturLine {
  id: number;
  idPembelianDetail: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
  qtyDasar: number;
  namaSatuanDasar: string;
  /** Copied from the invoice line, not read from today's moving average. */
  hppDasar: string;
  /** `qtyDasar x hppDasar` — the goods' value per the invoice, not per `kartu_stok`. */
  nilai: string;
}

export interface ReturDoc extends ReturRow {
  idRuang: number;
  namaRuang: string;
  lines: ReturLine[];
  createdAt: string;
  diajukanPada: string | null;
  disetujuiPada: string | null;
  postedAt: string | null;
  alasanTolak: string | null;
  alasanBatal: string | null;
}

function toRow(d: ApiRetur): ReturRow {
  return {
    id: d.id ?? 0,
    nomor: d.nomor ?? '',
    tanggal: d.tanggal ?? '',
    idPembelian: d.id_pembelian ?? 0,
    nomorPembelian: d.nomor_pembelian ?? '',
    idSupplier: d.id_supplier ?? 0,
    namaSupplier: d.nama_supplier ?? '',
    alasan: d.alasan ?? '',
    total: d.total ?? '0.00',
    nilaiKreditUtang: d.nilai_kredit_utang ?? '0.00',
    status: d.status ?? 'DRAFT',
  };
}

function toLine(l: ApiReturDetail): ReturLine {
  return {
    id: l.id ?? 0,
    idPembelianDetail: l.id_pembelian_detail ?? 0,
    idProduct: l.id_product ?? 0,
    kode: l.kode_barang ?? '',
    nama: l.nama_product ?? '',
    qtyInput: l.qty_input ?? '0',
    idSatuanInput: l.id_satuan_input ?? 0,
    namaSatuan: l.nama_satuan ?? '',
    faktor: l.faktor_konversi ?? 1,
    qtyDasar: l.qty_dasar ?? 0,
    namaSatuanDasar: l.nama_satuan_dasar ?? '',
    hppDasar: l.harga_pokok_satuan_dasar ?? '0.0000',
    nilai: l.nilai ?? '0.00',
  };
}

function toDoc(d: ApiRetur): ReturDoc {
  return {
    ...toRow(d),
    idRuang: d.id_ruang ?? 0,
    namaRuang: d.nama_ruang ?? '',
    // Absent on the list by contract, so an empty array here means "the list
    // endpoint answered" rather than "this document has no lines".
    lines: (d.detail ?? []).map(toLine),
    createdAt: d.created_at ?? '',
    diajukanPada: d.diajukan_pada ?? null,
    disetujuiPada: d.disetujui_pada ?? null,
    postedAt: d.posted_at ?? null,
    alasanTolak: d.alasan_tolak ?? null,
    alasanBatal: d.alasan_batal ?? null,
  };
}

/** See `hooks/use-record-bus.ts` — the detail posts, the list underneath patches. */
export const returBus = createRecordBus<ReturRow>();

/** Narrows a document back to the row shape, field by field so the lines are not retained. */
export function rowOf(doc: ReturDoc): ReturRow {
  return {
    id: doc.id,
    nomor: doc.nomor,
    tanggal: doc.tanggal,
    idPembelian: doc.idPembelian,
    nomorPembelian: doc.nomorPembelian,
    idSupplier: doc.idSupplier,
    namaSupplier: doc.namaSupplier,
    alasan: doc.alasan,
    total: doc.total,
    nilaiKreditUtang: doc.nilaiKreditUtang,
    status: doc.status,
  };
}

// ---- reads ----

export interface ReturQuery {
  page?: number;
  size?: number;
  /** Matches this document's number **or** the source pembelian's. */
  search?: string;
  status?: StatusAlur;
  idPembelian?: number;
  idSupplier?: number;
  tanggalDari?: string;
  tanggalSampai?: string;
}

/**
 * Documents whose source pembelian sits in a ruang outside the session's active
 * unit kerja are skipped silently, and the total is counted after that — so this
 * can look emptier than the server's own books.
 */
export async function listRetur(query: ReturQuery = {}): Promise<Paged<ReturRow>> {
  const { idPembelian, idSupplier, tanggalDari, tanggalSampai, ...rest } = query;
  const page = await authedList<ApiRetur>(
    `/api/v1/retur-pembelian${buildQuery({
      ...rest,
      id_pembelian: idPembelian,
      id_supplier: idSupplier,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

/** The header **and** its lines. Outside the session's unit kerja answers 404, like an unknown id. */
export async function getRetur(id: number): Promise<ReturDoc> {
  return toDoc(await authedRequest<ApiRetur>(`/api/v1/retur-pembelian/${id}`));
}

// ---- writes ----

export interface ReturLineInput {
  /** Must belong to the header's pembelian, and appear at most once per document. */
  id_pembelian_detail: number;
  /** Must be registered in that product's `product_satuan`; may differ from the invoice line's. */
  id_satuan_input: number;
  /** `qty x faktor` must be a whole number, and may not exceed what is returnable. */
  qty_input: string;
}

/**
 * The two fields that genuinely belong to the operator.
 *
 * `alasan: null` is refused 400 even though the column is nullable — create
 * demands one, so letting a patch clear it would produce a document that could
 * not have been created.
 */
export interface ReturHeaderBody {
  tanggal?: string;
  alasan?: string;
}

export interface CreateReturBody extends ReturHeaderBody {
  tanggal: string;
  alasan: string;
  id_pembelian: number;
  detail: ReturLineInput[];
}

/**
 * Always creates a `DRAFT`; the number is generated server-side on its own
 * series (`RB/KODE/2026/08/0001`) and `total` is recomputed from the lines.
 */
export async function createRetur(body: CreateReturBody): Promise<ReturDoc> {
  return toDoc(await authedRequest<ApiRetur>('/api/v1/retur-pembelian', { method: 'POST', body }));
}

/** **`DRAFT` only** — any other status answers 409. */
export async function updateRetur(id: number, body: ReturHeaderBody): Promise<ReturDoc> {
  return toDoc(
    await authedRequest<ApiRetur>(`/api/v1/retur-pembelian/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Replaces **every** line at once — `PUT`, not `PATCH`. The lines of one return
 * are packed and counted together, and `DRAFT` only.
 */
export async function replaceReturDetail(
  id: number,
  detail: ReturLineInput[]
): Promise<ReturDoc> {
  return toDoc(
    await authedRequest<ApiRetur>(`/api/v1/retur-pembelian/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

// ---- the workflow ----

/**
 * The four transitions, with who may run each. Same shape and same role split as
 * `AKSI` in `services/pembelian.ts` — see `services/alur-dokumen.ts` — but the
 * sentences are this document's own: this is the only one of the three whose
 * posting takes goods *out*, and whose stock value is not the number printed on
 * the document.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan retur ini?',
    penjelasan:
      'Setelah diajukan, tanggal, alasan, dan barisnya terkunci. Jalan keluarnya hanya diposting atau ditolak.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Tolak',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan',
    contoh: 'Barang masih bisa dijual, tidak perlu dikembalikan',
    judul: 'Tolak pengajuan',
    penjelasan:
      'Dokumen kembali ke DRAFT dan bisa diperbaiki. Alasannya wajib — itu satu-satunya jalur balik ke yang mengetik.',
    danger: true,
  },
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Posting: keluarkan barang dari kartu stok',
    penjelasan:
      'Mengeluarkan barangnya dari ruang faktur asal dan membekukan nilai kredit utangnya. Kartu stok menilai barang keluar pada rata-rata bergerak hari ini, jadi angkanya tidak selalu sama dengan total dokumen ini — keduanya benar untuk pertanyaan yang berbeda. Ditolak kalau saldo ruang tidak cukup atau periodenya sudah ditutup.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Supplier menolak menerima kiriman balik, barang kembali ke gudang',
    judul: 'Batalkan dokumen POSTED',
    penjelasan:
      'Barangnya masuk kembali, dinilai persis sebesar yang tercatat saat ia keluar — satu-satunya angka yang membuat pasangannya berjumlah nol. Baris pembaliknya bertanggal hari ini, jadi yang bisa menghalangi adalah periode berjalan yang sedang tutup, bukan periode dokumen.',
    danger: true,
  },
];

/** The transitions this status and this role can actually run right now. */
export function aksiTersedia(status: StatusAlur, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/** Runs one transition. Each answers with the whole document. */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<ReturDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiRetur>(`/api/v1/retur-pembelian/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
