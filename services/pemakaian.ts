/**
 * The `/api/v1/pemakaian` group — goods used by the shop itself.
 *
 * Repairs, the office, a sample: stock that leaves a room with no sales note, no
 * supplier and no destination room. The fifth document that writes `kartu_stok`,
 * and the first to take goods out with no counterparty at all.
 *
 * ## The flow has one more step than any other document
 *
 * `DRAFT → DIAJUKAN → DISETUJUI → POSTED`, with `DITOLAK` branching off
 * `DIAJUKAN` and `BATAL` off `POSTED`. Three things set it apart, and each one is
 * a trap for a screen copied from pembelian:
 *
 * 1. **`DITOLAK` is terminal.** It does not go back to `DRAFT` — a rejection here
 *    is a business decision ("you are not getting these goods"), not a typo to
 *    fix. Someone who still wants the goods files a new request.
 * 2. **Approval and posting are separate.** `setujui` decides *how much* may
 *    leave, per line; `posting` records that it actually left. A `DISETUJUI`
 *    document cannot be rejected or cancelled — its only way forward is posting —
 *    so an approval that zeroes every line would strand it forever (posting
 *    refuses a document with nothing to write). `setujuiPemakaian` is guarded
 *    against that in the screen, not here.
 * 3. **Posting reads `qty_disetujui_dasar`, never `qty_dasar`.** The requested
 *    quantity is planning data frozen when the line was written; the approved one
 *    is what moves. A line approved at zero is skipped entirely.
 *
 * ## The requester is not the typist, and cannot be the approver
 *
 * `id_pemohon` is who wants the goods; `created_by` is who typed it.
 * `pemakaian_penyetuju_check` refuses an approval — **or a rejection**, which is
 * written to the same `disetujui_oleh` column — by the requester. So
 * `aksiTersedia` takes the reader's user id and drops `setujui` and `tolak` when
 * the reader is the one asking, rather than drawing buttons the server refuses.
 *
 * Picking a requester other than yourself needs `GET /user`, which the contract
 * makes `SUPERADMIN`-only even for reading. So an `INVENTARIS` grant requests as
 * itself and a superadmin may request on somebody's behalf — see
 * `services/user.ts`.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiPemakaian = components['schemas']['Pemakaian'];
type ApiPemakaianDetail = components['schemas']['PemakaianDetail'];

export type StatusPemakaian = NonNullable<ApiPemakaian['status']>;

export type { AksiDokumen } from '@/services/alur-dokumen';

/** One request as the list reports it — `detail` is absent on that endpoint. */
export interface PemakaianRow {
  id: number;
  nomor: string;
  /** Date-time. */
  tanggal: string;
  idRuang: number;
  namaRuang: string;
  idPemohon: number;
  namaPemohon: string;
  keperluan: string;
  status: StatusPemakaian;
  /** Decimal string, **`null` until `POSTED`**. */
  totalHpp: string | null;
}

export interface PemakaianLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
  /** What was asked for, in base units. Never changes, including after approval. */
  qtyDasar: number;
  namaSatuanDasar: string;
  /** `null` until approved. What posting actually writes; `0` is a line refused on its own. */
  qtyDisetujuiDasar: number | null;
  hppDasar: string | null;
  hppTotal: string | null;
  keterangan: string;
}

export interface PemakaianDoc extends PemakaianRow {
  lines: PemakaianLine[];
  disetujuiOleh: number | null;
  tsDisetujui: string | null;
  /** The approval note **and** the rejection reason — one column holds both. */
  catatanPersetujuan: string | null;
  createdAt: string;
  postedAt: string | null;
  alasanBatal: string | null;
}

function toRow(p: ApiPemakaian): PemakaianRow {
  return {
    id: p.id ?? 0,
    nomor: p.nomor ?? '',
    tanggal: p.tanggal ?? '',
    idRuang: p.id_ruang ?? 0,
    namaRuang: p.nama_ruang ?? '',
    idPemohon: p.id_pemohon ?? 0,
    namaPemohon: p.nama_pemohon ?? '',
    keperluan: p.keperluan ?? '',
    status: p.status ?? 'DRAFT',
    totalHpp: p.total_hpp ?? null,
  };
}

function toLine(d: ApiPemakaianDetail): PemakaianLine {
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
    // `?? null` and never `?? 0`: zero is "this line refused", null is "not
    // decided yet", and posting treats them completely differently.
    qtyDisetujuiDasar: d.qty_disetujui_dasar ?? null,
    hppDasar: d.hpp_satuan_dasar ?? null,
    hppTotal: d.hpp_total ?? null,
    keterangan: d.keterangan ?? '',
  };
}

function toDoc(p: ApiPemakaian): PemakaianDoc {
  return {
    ...toRow(p),
    lines: (p.detail ?? []).map(toLine),
    disetujuiOleh: p.disetujui_oleh ?? null,
    tsDisetujui: p.ts_disetujui ?? null,
    catatanPersetujuan: p.catatan_persetujuan ?? null,
    createdAt: p.created_at ?? '',
    postedAt: p.posted_at ?? null,
    alasanBatal: p.alasan_batal ?? null,
  };
}

/** See `hooks/use-record-bus.ts`. */
export const pemakaianBus = createRecordBus<PemakaianRow>();

export function pemakaianRowOf(doc: PemakaianDoc): PemakaianRow {
  const {
    id,
    nomor,
    tanggal,
    idRuang,
    namaRuang,
    idPemohon,
    namaPemohon,
    keperluan,
    status,
    totalHpp,
  } = doc;
  return {
    id,
    nomor,
    tanggal,
    idRuang,
    namaRuang,
    idPemohon,
    namaPemohon,
    keperluan,
    status,
    totalHpp,
  };
}

// ---- reads ----

export interface PemakaianQuery {
  page?: number;
  size?: number;
  /** Matches the document number or its `keperluan`. */
  search?: string;
  status?: StatusPemakaian;
  idRuang?: number;
  idPemohon?: number;
  tanggalDari?: string;
  tanggalSampai?: string;
  /** Oldest first. With `status: 'DIAJUKAN'` this is the approval queue. */
  terlamaDulu?: boolean;
}

export async function listPemakaian(query: PemakaianQuery = {}): Promise<Paged<PemakaianRow>> {
  const { idRuang, idPemohon, tanggalDari, tanggalSampai, terlamaDulu, ...rest } = query;
  const page = await authedList<ApiPemakaian>(
    `/api/v1/pemakaian${buildQuery({
      ...rest,
      id_ruang: idRuang,
      id_pemohon: idPemohon,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
      terlama_dulu: terlamaDulu ? true : undefined,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

export async function getPemakaian(id: number): Promise<PemakaianDoc> {
  return toDoc(await authedRequest<ApiPemakaian>(`/api/v1/pemakaian/${id}`));
}

// ---- writes ----

export interface PemakaianLineInput {
  /** May repeat — 1 DUS for the workshop and 3 PCS for the office are two lines. */
  id_product: number;
  id_satuan_input: number;
  qty_input: string;
  keterangan?: string | null;
}

export interface CreatePemakaianBody {
  tanggal: string;
  id_ruang: number;
  id_pemohon: number;
  keperluan: string;
  /** May be empty here; `ajukan` refuses a document with no lines. */
  detail?: PemakaianLineInput[];
}

/** Always a `DRAFT`, numbered server-side on its own `PM` series. */
export async function createPemakaian(body: CreatePemakaianBody): Promise<PemakaianDoc> {
  return toDoc(await authedRequest<ApiPemakaian>('/api/v1/pemakaian', { method: 'POST', body }));
}

/**
 * **`DRAFT` only.** All four columns are `NOT NULL` — they can change but not be
 * cleared, and an explicit `null` answers 400, which is why the type has none.
 */
export interface PemakaianHeaderBody {
  tanggal?: string;
  id_ruang?: number;
  id_pemohon?: number;
  keperluan?: string;
}

export async function updatePemakaian(
  id: number,
  body: PemakaianHeaderBody
): Promise<PemakaianDoc> {
  return toDoc(
    await authedRequest<ApiPemakaian>(`/api/v1/pemakaian/${id}`, { method: 'PATCH', body })
  );
}

/** Replaces **every** line, `DRAFT` only, and at least one is required. */
export async function replacePemakaianDetail(
  id: number,
  detail: PemakaianLineInput[]
): Promise<PemakaianDoc> {
  return toDoc(
    await authedRequest<ApiPemakaian>(`/api/v1/pemakaian/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

/**
 * `DIAJUKAN → DISETUJUI`.
 *
 * `detail` is how an approver **trims**: a line left out gets its full
 * `qty_dasar`, which is the ordinary case. So only the lines whose approved
 * quantity differs from what was asked are sent, and `0` refuses one line while
 * approving the document. Each figure is in base units and may not exceed that
 * line's own `qty_dasar`.
 */
export async function setujuiPemakaian(
  id: number,
  body: { catatan?: string; detail?: { id_detail: number; qty_disetujui_dasar: number }[] }
): Promise<PemakaianDoc> {
  return toDoc(
    await authedRequest<ApiPemakaian>(`/api/v1/pemakaian/${id}/setujui`, {
      method: 'POST',
      body,
    })
  );
}

// ---- the workflow ----

/**
 * Five transitions. `setujui` is listed so the table stays the one place that
 * says who may run what and what it does, but it is not confirmed through
 * `AksiDialog`: it carries a quantity per line, so `app/pemakaian/[id].tsx`
 * opens its own sheet off this row's `judul` and `penjelasan`.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan permintaan ini?',
    penjelasan:
      'Setelah diajukan, isinya terkunci dan menunggu persetujuan. Penyetujunya harus orang lain selain pemohon.',
    danger: false,
  },
  {
    key: 'setujui',
    label: 'Setujui',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Setujui permintaan',
    penjelasan:
      'Tentukan berapa yang boleh keluar per baris. Setelah disetujui, jalan keluarnya hanya diposting — tidak bisa ditolak atau dibatalkan lagi.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Tolak',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan',
    contoh: 'Stok dicadangkan untuk pesanan pelanggan',
    judul: 'Tolak permintaan',
    penjelasan:
      'Penolakan bersifat final dan tidak kembali ke draf. Kalau barangnya masih dibutuhkan, pemohon membuat permintaan baru.',
    danger: true,
  },
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DISETUJUI',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Posting ke kartu stok?',
    penjelasan:
      'Yang keluar dari gudang adalah jumlah yang disetujui, bukan yang diminta, dinilai pada rata-rata bergerak gudang itu. Baris yang disetujui nol dilewati.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Barang dikembalikan utuh ke gudang',
    judul: 'Batalkan pemakaian POSTED',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini: barangnya masuk lagi ke gudang. Karena hanya menambah stok, pembatalan ini tidak pernah ditolak karena saldo.',
    danger: true,
  },
];

/**
 * The transitions this status, grant **and person** can run.
 *
 * `idUser` is the reader's own user id. The same column records who approved
 * and who rejected, and the check that it is never the requester applies to
 * both — so both buttons go when the reader is the requester.
 */
export function aksiTersedia(
  doc: Pick<PemakaianRow, 'status' | 'idPemohon'>,
  role: RoleName | null,
  idUser: number | null
): AksiDokumen[] {
  const semua = pilihAksi(AKSI, doc.status, role);
  if (idUser === null || idUser !== doc.idPemohon) return semua;
  return semua.filter((a) => a.key !== 'setujui' && a.key !== 'tolak');
}

/** Whether the reader would be approving their own request — the one reason `setujui` is withheld. */
export function pemohonSendiri(doc: Pick<PemakaianRow, 'idPemohon'>, idUser: number | null) {
  return idUser !== null && idUser === doc.idPemohon;
}

/** Runs `ajukan`, `tolak`, `posting` or `batal`. `setujui` has its own function above. */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<PemakaianDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiPemakaian>(`/api/v1/pemakaian/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
