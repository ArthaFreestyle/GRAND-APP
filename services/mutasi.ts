/**
 * The `/api/v1/mutasi` group — goods moving from one `ruang` to another.
 *
 * The fourth document that writes `kartu_stok`, and the first that writes in
 * **two directions at once**: posting turns every line into a `MUTASI_KELUAR` in
 * the source room and a `MUTASI_MASUK` in the destination, in one transaction.
 * The value that arrives is exactly the `nilai_keluar` the outgoing row reports —
 * the moving average of the source room, read by the trigger inside its advisory
 * lock — so the total value of inventory across all rooms does not move a rupiah.
 *
 * That is why there is **no money anywhere in the header** and why
 * `harga_pokok_satuan_dasar` on a line is null until posting: nothing the app
 * could type or compute beforehand is the number the trigger will use.
 *
 * ## The flow has no `DIAJUKAN`
 *
 * `DRAFT → POSTED → BATAL`, the only `kartu_stok` writer shaped that way besides
 * `penjualan`, and for a different reason: the two-person control lives entirely
 * in the roles. `INVENTARIS` can only ever get a document as far as `DRAFT`;
 * `SUPERADMIN` alone posts and cancels. So there is no signal that a draft is
 * *ready* — and the contract's answer is a list rather than a status:
 * `status=DRAFT&terlama_dulu=true` is the superadmin's work queue, oldest first,
 * because a queue is read to be worked through. `app/mutasi/index.tsx` opens on
 * it for that grant.
 *
 * ## Which room the grant is checked against
 *
 * Only `id_ruang_asal`. A document whose source room is outside the session's
 * unit kerja is skipped on the list and answers 404 on the detail, and writing
 * one answers 403. `id_ruang_tujuan` is **never** restricted — a mutasi between
 * units is allowed on purpose. What this app cannot do is *offer* such a room:
 * `GET /ruang` answers only the active unit's rooms (unless the grant is global),
 * and there is no other read that lists ruang. So a scoped grant picks a
 * destination inside its own unit, and a global grant can pick any.
 *
 * ## A room frozen by stok opname cannot take part
 *
 * The trigger refuses any posting into a room with an open opname, and a mutasi
 * posts into both of its rooms. The pickers read `nomorOpnameBeku` off `GET
 * /ruang` and refuse either end, and the detail says so if a room froze after the
 * draft was written.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiMutasi = components['schemas']['Mutasi'];
type ApiMutasiDetail = components['schemas']['MutasiDetail'];

export type StatusMutasi = NonNullable<ApiMutasi['status']>;

export type { AksiDokumen } from '@/services/alur-dokumen';

/** One document as the list reports it — `detail` is absent on that endpoint. */
export interface MutasiRow {
  id: number;
  nomor: string;
  /** Date-time. */
  tanggal: string;
  idRuangAsal: number;
  namaRuangAsal: string;
  idRuangTujuan: number;
  namaRuangTujuan: string;
  keterangan: string;
  status: StatusMutasi;
}

export interface MutasiLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  /** Snapshot of `product_satuan` when the line was written. */
  faktor: number;
  qtyDasar: number;
  namaSatuanDasar: string;
  /** **`null` until posted** — the source room's moving average at that moment. */
  hppDasar: string | null;
}

export interface MutasiDoc extends MutasiRow {
  lines: MutasiLine[];
  createdAt: string;
  postedAt: string | null;
  alasanBatal: string | null;
}

function toRow(m: ApiMutasi): MutasiRow {
  return {
    id: m.id ?? 0,
    nomor: m.nomor ?? '',
    tanggal: m.tanggal ?? '',
    idRuangAsal: m.id_ruang_asal ?? 0,
    namaRuangAsal: m.nama_ruang_asal ?? '',
    idRuangTujuan: m.id_ruang_tujuan ?? 0,
    namaRuangTujuan: m.nama_ruang_tujuan ?? '',
    keterangan: m.keterangan ?? '',
    status: m.status ?? 'DRAFT',
  };
}

function toLine(d: ApiMutasiDetail): MutasiLine {
  return {
    id: d.id ?? 0,
    idProduct: d.id_product ?? 0,
    kode: d.kode_barang ?? '',
    nama: d.nama_product ?? '',
    qtyInput: d.qty_input ?? '0',
    idSatuanInput: d.id_satuan_input ?? 0,
    namaSatuan: d.nama_satuan ?? '',
    faktor: d.faktor_konversi ?? 1,
    qtyDasar: d.qty_dasar ?? 0,
    namaSatuanDasar: d.nama_satuan_dasar ?? '',
    // `?? null`, never a zero: an unposted line has no cost yet, and a zero
    // would read as goods that moved for free.
    hppDasar: d.harga_pokok_satuan_dasar ?? null,
  };
}

function toDoc(m: ApiMutasi): MutasiDoc {
  return {
    ...toRow(m),
    lines: (m.detail ?? []).map(toLine),
    createdAt: m.created_at ?? '',
    postedAt: m.posted_at ?? null,
    alasanBatal: m.alasan_batal ?? null,
  };
}

/** See `hooks/use-record-bus.ts` — the detail writes, the list underneath patches. */
export const mutasiBus = createRecordBus<MutasiRow>();

/** Narrows a document back to the row shape, field by field so the lines are not retained. */
export function mutasiRowOf(doc: MutasiDoc): MutasiRow {
  const {
    id,
    nomor,
    tanggal,
    idRuangAsal,
    namaRuangAsal,
    idRuangTujuan,
    namaRuangTujuan,
    keterangan,
    status,
  } = doc;
  return {
    id,
    nomor,
    tanggal,
    idRuangAsal,
    namaRuangAsal,
    idRuangTujuan,
    namaRuangTujuan,
    keterangan,
    status,
  };
}

/**
 * The value that moved, once it is known: Σ `qty_dasar × harga_pokok`.
 *
 * `null` while any line still has no cost — a partial sum would be a number
 * that looks final and is not.
 */
export function nilaiMutasi(doc: MutasiDoc): number | null {
  let total = 0;
  for (const line of doc.lines) {
    if (line.hppDasar === null) return null;
    total += line.qtyDasar * Number(line.hppDasar);
  }
  return doc.lines.length === 0 ? null : total;
}

// ---- reads ----

export interface MutasiQuery {
  page?: number;
  size?: number;
  /** Matches the document number or its `keterangan`. */
  search?: string;
  status?: StatusMutasi;
  idRuangAsal?: number;
  idRuangTujuan?: number;
  tanggalDari?: string;
  tanggalSampai?: string;
  /** Oldest first. With `status: 'DRAFT'` this is the posting queue. */
  terlamaDulu?: boolean;
}

/** Documents whose source room is outside the session's unit kerja are skipped silently. */
export async function listMutasi(query: MutasiQuery = {}): Promise<Paged<MutasiRow>> {
  const { idRuangAsal, idRuangTujuan, tanggalDari, tanggalSampai, terlamaDulu, ...rest } = query;
  const page = await authedList<ApiMutasi>(
    `/api/v1/mutasi${buildQuery({
      ...rest,
      id_ruang_asal: idRuangAsal,
      id_ruang_tujuan: idRuangTujuan,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
      // Only sent when true: `false` is the server default, and a query string
      // carrying it on every page read is noise in every log line.
      terlama_dulu: terlamaDulu ? true : undefined,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

/** The header **and** its lines. A source room outside the unit kerja answers 404. */
export async function getMutasi(id: number): Promise<MutasiDoc> {
  return toDoc(await authedRequest<ApiMutasi>(`/api/v1/mutasi/${id}`));
}

// ---- writes ----

export interface MutasiLineInput {
  /** May repeat — 2 DUS and 3 PCS of one product are two valid lines. */
  id_product: number;
  /** Must be registered in that product's `product_satuan`. */
  id_satuan_input: number;
  /** `qty x faktor` must be whole; all lines of one product together may not exceed the source balance. */
  qty_input: string;
}

export interface MutasiHeaderBody {
  /** `YYYY-MM-DD`. */
  tanggal?: string;
  id_ruang_asal?: number;
  /** Must differ from `id_ruang_asal` (`mutasi_ruang_check`). */
  id_ruang_tujuan?: number;
  /** `null` clears it on a `PATCH`. */
  keterangan?: string | null;
}

export interface CreateMutasiBody {
  tanggal: string;
  id_ruang_asal: number;
  id_ruang_tujuan: number;
  keterangan?: string;
  /** May be empty here — a mutasi is often opened while the trolley is still being loaded. */
  detail?: MutasiLineInput[];
}

/** Always a `DRAFT`, numbered server-side on its own `MT` series. */
export async function createMutasi(body: CreateMutasiBody): Promise<MutasiDoc> {
  return toDoc(await authedRequest<ApiMutasi>('/api/v1/mutasi', { method: 'POST', body }));
}

/** **`DRAFT` only.** Both rooms may change; the pair is re-checked against what is stored. */
export async function updateMutasi(id: number, body: MutasiHeaderBody): Promise<MutasiDoc> {
  return toDoc(await authedRequest<ApiMutasi>(`/api/v1/mutasi/${id}`, { method: 'PATCH', body }));
}

/**
 * Replaces **every** line at once, `DRAFT` only — and unlike the create, at
 * least one line is required: emptying a document through the path that means
 * "these are its lines" is refused.
 */
export async function replaceMutasiDetail(
  id: number,
  detail: MutasiLineInput[]
): Promise<MutasiDoc> {
  return toDoc(
    await authedRequest<ApiMutasi>(`/api/v1/mutasi/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

// ---- the workflow ----

/**
 * Two transitions, both `SUPERADMIN`. There is no `ajukan` and no `tolak` row
 * because there is no endpoint for either — see the module header.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DRAFT',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Posting mutasi ini?',
    penjelasan:
      'Barang keluar dari gudang asal dan masuk ke gudang tujuan dalam satu transaksi, dinilai pada rata-rata bergerak gudang asal. Total nilai persediaan tidak berubah. Saldo gudang asal diperiksa di sini.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Barang ternyata tidak jadi dipindah',
    judul: 'Batalkan mutasi POSTED',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini: barang kembali ke gudang asal. Nilainya dihitung pada rata-rata gudang tujuan sekarang, jadi bisa berbeda dari nilai aslinya. Ditolak kalau barangnya sudah keluar lagi dari gudang tujuan.',
    danger: true,
  },
];

export function aksiTersedia(status: StatusMutasi, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/** Runs one transition. Each answers with the whole document. */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<MutasiDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiMutasi>(`/api/v1/mutasi/${id}/${aksi.key}`, { method: 'POST', body })
  );
}
