/**
 * The `/api/v1/penerimaan-susulan` group — the second delivery.
 *
 * A susulan is what arrives after the truck left something behind. It is a
 * document in its own right rather than a correction, and the reason is worth
 * keeping in view while reading anything below: the alternative — raising
 * `qty_diterima` on a line of a POSTED pembelian — would edit a document the
 * whole system treats as immutable, make its cancellation impossible to audit,
 * and erase any record of *when* the goods actually turned up.
 *
 * So it **adds stock and never adds debt**. The supplier's invoice was issued in
 * full with the first delivery and was booked in full there; there is no `total`
 * here, no `ppn`, and no `status_pembayaran`. `totalNilai` is the value of the
 * goods being brought into inventory, priced at the `harga_pokok_satuan_dasar`
 * the invoice line already fixed — which is exactly why a pembelian and all its
 * susulan sum to the invoice and not a rupiah more.
 *
 * Three fields are missing from every body on purpose. `id_supplier` and
 * `id_ruang` are copied from the pembelian — the supplier is settled and the
 * room was decided by the original document, and goods that need to move rooms
 * after arriving are a mutasi. And `id_pembelian` cannot be patched either: it
 * is what this document is a remainder *of*.
 *
 * **The source must be `POSTED`.** Before that its lines have no harga pokok to
 * copy and no settled remainder to draw down.
 *
 * The per-line cap is `qty_dasar - qty_diterima_dasar - the POSTED susulan so
 * far`, which `services/pembelian.ts` already exposes as `sisaDasar`. Checking
 * it in the form only buys a faster error: the check that decides runs at
 * posting, under a row lock on the pembelian, because another susulan for the
 * same invoice can consume the remainder between a draft being written and it
 * being posted.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen, type StatusAlur } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiSusulan = components['schemas']['PenerimaanSusulan'];
type ApiSusulanDetail = components['schemas']['PenerimaanSusulanDetail'];

export type { AksiDokumen } from '@/services/alur-dokumen';

/** One document as the list reports it — `detail` is absent on that endpoint. */
export interface SusulanRow {
  id: number;
  nomor: string;
  /** Date-time. */
  tanggal: string;
  idPembelian: number;
  nomorPembelian: string;
  idSupplier: number;
  namaSupplier: string;
  /** Value of the goods that arrived late. **Not** money owed. */
  totalNilai: string;
  status: StatusAlur;
}

/**
 * One line, pointing at the invoice line it completes.
 *
 * `faktor` is taken fresh from `product_satuan` rather than copied from the
 * invoice line, because this quantity is a new count and may legitimately be in
 * a different unit — five pcs short of a line typed in cartons is ordinary.
 */
export interface SusulanLine {
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
  /** Copied from the invoice line; never recomputed, never today's average. */
  hppDasar: string;
  /** `qtyDasar x hppDasar`. */
  nilai: string;
}

export interface SusulanDoc extends SusulanRow {
  idRuang: number;
  namaRuang: string;
  keterangan: string;
  lines: SusulanLine[];
  createdAt: string;
  diajukanPada: string | null;
  disetujuiPada: string | null;
  postedAt: string | null;
  alasanTolak: string | null;
  alasanBatal: string | null;
}

function toRow(d: ApiSusulan): SusulanRow {
  return {
    id: d.id ?? 0,
    nomor: d.nomor ?? '',
    tanggal: d.tanggal ?? '',
    idPembelian: d.id_pembelian ?? 0,
    nomorPembelian: d.nomor_pembelian ?? '',
    idSupplier: d.id_supplier ?? 0,
    namaSupplier: d.nama_supplier ?? '',
    totalNilai: d.total_nilai ?? '0.00',
    status: d.status ?? 'DRAFT',
  };
}

function toLine(l: ApiSusulanDetail): SusulanLine {
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

function toDoc(d: ApiSusulan): SusulanDoc {
  return {
    ...toRow(d),
    idRuang: d.id_ruang ?? 0,
    namaRuang: d.nama_ruang ?? '',
    keterangan: d.keterangan ?? '',
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
export const susulanBus = createRecordBus<SusulanRow>();

/** Narrows a document back to the row shape, field by field so the lines are not retained. */
export function rowOf(doc: SusulanDoc): SusulanRow {
  return {
    id: doc.id,
    nomor: doc.nomor,
    tanggal: doc.tanggal,
    idPembelian: doc.idPembelian,
    nomorPembelian: doc.nomorPembelian,
    idSupplier: doc.idSupplier,
    namaSupplier: doc.namaSupplier,
    totalNilai: doc.totalNilai,
    status: doc.status,
  };
}

// ---- reads ----

export interface SusulanQuery {
  page?: number;
  size?: number;
  /** Matches this document's number **or** the source pembelian's. */
  search?: string;
  status?: StatusAlur;
  idPembelian?: number;
  tanggalDari?: string;
  tanggalSampai?: string;
}

/**
 * Documents whose source pembelian sits in a ruang outside the session's active
 * unit kerja are skipped silently, and the total is counted after that — so this
 * can look emptier than the server's own books.
 */
export async function listSusulan(query: SusulanQuery = {}): Promise<Paged<SusulanRow>> {
  const { idPembelian, tanggalDari, tanggalSampai, ...rest } = query;
  const page = await authedList<ApiSusulan>(
    `/api/v1/penerimaan-susulan${buildQuery({
      ...rest,
      id_pembelian: idPembelian,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

/** The header **and** its lines. Outside the session's unit kerja answers 404, like an unknown id. */
export async function getSusulan(id: number): Promise<SusulanDoc> {
  return toDoc(await authedRequest<ApiSusulan>(`/api/v1/penerimaan-susulan/${id}`));
}

// ---- writes ----

export interface SusulanLineInput {
  /** Must belong to the header's pembelian, and appear at most once per document. */
  id_pembelian_detail: number;
  /** Must be registered in that product's `product_satuan`; may differ from the invoice line's. */
  id_satuan_input: number;
  /** `qty x faktor` must be a whole number, and may not exceed the line's remainder. */
  qty_input: string;
}

/** The two fields that genuinely belong to the operator. */
export interface SusulanHeaderBody {
  tanggal?: string;
  keterangan?: string | null;
}

export interface CreateSusulanBody extends SusulanHeaderBody {
  tanggal: string;
  id_pembelian: number;
  detail: SusulanLineInput[];
}

/**
 * Always creates a `DRAFT`; the number is generated server-side on its own
 * series (`PS/KODE/2026/08/0001`) and `total_nilai` is recomputed from the lines.
 */
export async function createSusulan(body: CreateSusulanBody): Promise<SusulanDoc> {
  return toDoc(
    await authedRequest<ApiSusulan>('/api/v1/penerimaan-susulan', { method: 'POST', body })
  );
}

/** **`DRAFT` only** — any other status answers 409. */
export async function updateSusulan(id: number, body: SusulanHeaderBody): Promise<SusulanDoc> {
  return toDoc(
    await authedRequest<ApiSusulan>(`/api/v1/penerimaan-susulan/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Replaces **every** line at once — `PUT`, not `PATCH`. The lines of one
 * delivery are counted together off one pallet, and `DRAFT` only.
 */
export async function replaceSusulanDetail(
  id: number,
  detail: SusulanLineInput[]
): Promise<SusulanDoc> {
  return toDoc(
    await authedRequest<ApiSusulan>(`/api/v1/penerimaan-susulan/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

// ---- the workflow ----

/**
 * The four transitions, with who may run each. Same shape and same role split as
 * `AKSI` in `services/pembelian.ts` — see `services/alur-dokumen.ts` — but the
 * sentences are this document's own, because what posting and cancelling *do*
 * here is not what they do to an invoice.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan kiriman susulan ini?',
    penjelasan:
      'Setelah diajukan, tanggal dan barisnya terkunci. Jalan keluarnya hanya diposting atau ditolak.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Tolak',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan',
    contoh: 'Qty tidak cocok dengan surat jalan kiriman kedua',
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
    judul: 'Posting ke kartu stok?',
    penjelasan:
      'Menambah stok tanpa menambah utang: nilainya disalin dari harga pokok baris fakturnya, bukan dari rata-rata bergerak hari ini, jadi faktur dan seluruh susulannya berjumlah persis nilai faktur. Sisa per baris diperiksa ulang di sini — susulan lain untuk faktur yang sama bisa lebih dulu menghabiskannya.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Barang ternyata tidak pernah datang, susulan salah input',
    judul: 'Batalkan dokumen POSTED',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini — bukan tanggal dokumen — lalu mengembalikan sisanya ke faktur asal. Pembaliknya dinilai pada rata-rata bergerak yang berlaku sekarang, bukan pada harga pokok baris aslinya.',
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
): Promise<SusulanDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiSusulan>(`/api/v1/penerimaan-susulan/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
