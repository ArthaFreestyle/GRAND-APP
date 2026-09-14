/**
 * Stok opname — the seventh document that writes `kartu_stok`, and the only one
 * that does not move anything anywhere.
 *
 * What changes when one is posted is not where the goods are but **what the
 * system admits is on the shelf**. Everything unusual about this module follows
 * from that.
 *
 * ## Opening one freezes the room, immediately
 *
 * The moment `POST /stok-opname` returns, the `kartu_stok` trigger refuses every
 * posting into that `id_ruang` **from every module** — a purchase, a sale at the
 * till, a follow-up delivery, all of them — until the document reaches `POSTED`
 * or `BATAL`. That is not a side effect to mention in passing: it is the point
 * (you cannot count a shelf that is moving) and it is the single most
 * consequential thing any screen here has to say out loud before somebody taps
 * a button. `GET /ruang` carries `nomor_opname_beku` so every other ruang picker
 * in the app can name the document responsible.
 *
 * A room may hold only one unfinished opname: a second answers 409.
 *
 * ## `stok_so: null` means "not counted", and never zero
 *
 * A null line is skipped entirely at posting. Reading it as zero would post a
 * `SO_DEFISIT` for the product's whole recorded balance — it would erase the
 * stock of everything nobody got round to counting. Every function and every
 * screen in this module keeps `null` and `0` apart, and the type does too.
 *
 * A partial count is legitimate — one shelf, one category — so `ajukan` does
 * *not* refuse a document with nulls in it. It refuses one with **no** counted
 * line at all, which is an empty document rather than a count, and it reports
 * `jumlah_belum_dihitung` so the verifier decides knowingly.
 *
 * ## The one per-line write in the whole API
 *
 * `PATCH /stok-opname/{id}/detail/{id_detail}` is the single exception to this
 * contract's rule that lines are replaced as a set and never one at a time. The
 * reason is physical: these are filled in by somebody walking along a rack, not
 * retyped in one sitting from a sheet of paper. `PUT .../detail` still exists
 * and still replaces everything — and **resets every `stok_so` back to null** —
 * so it is for fixing *which products* are on the count, never for saving one.
 *
 * `stok_selisih_lebih` and `stok_selisih_kurang` are always recomputed by the
 * server from `stok_so` against the frozen `stok_awal`. They are never sent.
 */
import type { components } from '@/types/api';

import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { createRecordBus } from '@/hooks/use-record-bus';
import type { RoleName } from '@/services/permissions';

type ApiOpname = components['schemas']['StokOpname'];
type ApiOpnameDetail = components['schemas']['StokOpnameDetail'];

export type StatusOpname = NonNullable<ApiOpname['status']>;

/** A list row. `detail` is **absent** on the list endpoint — the key is gone, not empty. */
export interface OpnameRow {
  id: number;
  nomor: string;
  idRuang: number;
  namaRuang: string;
  tglBuka: string;
  tglTutup: string | null;
  uraian: string;
  status: StatusOpname;
}

export interface OpnameLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  namaSatuanDasar: string;
  /** Frozen at `tarik-saldo` and never touched again; the difference is always against this. */
  stokAwal: number;
  /** **`null` is "belum dihitung", never zero.** See the module header. */
  stokSo: number | null;
  selisihLebih: number;
  selisihKurang: number;
  keterangan: string;
  /** Null until posted, and null forever for a line whose difference was zero. */
  idKartuStokPenyesuaian: number | null;
}

export interface OpnameDoc extends OpnameRow {
  tsCutoff: string;
  jumlahBaris: number;
  jumlahBelumDihitung: number;
  lines: OpnameLine[];
  createdAt: string;
  postedAt: string | null;
  alasanBatal: string;
}

function toRow(o: ApiOpname): OpnameRow {
  return {
    id: o.id ?? 0,
    nomor: o.nomor ?? '',
    idRuang: o.id_ruang ?? 0,
    namaRuang: o.nama_ruang ?? '',
    tglBuka: o.tgl_buka ?? '',
    tglTutup: o.tgl_tutup ?? null,
    uraian: o.uraian_so ?? '',
    status: o.status ?? 'DRAFT',
  };
}

function toLine(d: ApiOpnameDetail): OpnameLine {
  return {
    id: d.id ?? 0,
    idProduct: d.id_product ?? 0,
    kode: d.kode_barang ?? '',
    nama: d.nama_product ?? '',
    namaSatuanDasar: d.nama_satuan_dasar ?? '',
    stokAwal: d.stok_awal ?? 0,
    // `?? null` and never `?? 0`: the whole module turns on this distinction,
    // and a coalesce to zero here would be invisible everywhere else.
    stokSo: d.stok_so ?? null,
    selisihLebih: d.stok_selisih_lebih ?? 0,
    selisihKurang: d.stok_selisih_kurang ?? 0,
    keterangan: d.keterangan ?? '',
    idKartuStokPenyesuaian: d.id_kartu_stok_penyesuaian ?? null,
  };
}

function toDoc(o: ApiOpname): OpnameDoc {
  return {
    ...toRow(o),
    tsCutoff: o.ts_cutoff ?? '',
    jumlahBaris: o.jumlah_baris ?? (o.detail ?? []).length,
    jumlahBelumDihitung:
      o.jumlah_belum_dihitung ?? (o.detail ?? []).filter((d) => d.stok_so == null).length,
    lines: (o.detail ?? []).map(toLine),
    createdAt: o.created_at ?? '',
    postedAt: o.posted_at ?? null,
    alasanBatal: o.alasan_batal ?? '',
  };
}

/** The columns of a document that the list actually draws. */
export function opnameRowOf(doc: OpnameDoc): OpnameRow {
  const { id, nomor, idRuang, namaRuang, tglBuka, tglTutup, uraian, status } = doc;
  return { id, nomor, idRuang, namaRuang, tglBuka, tglTutup, uraian, status };
}

export const opnameBus = createRecordBus<OpnameRow>();

export interface OpnameQuery {
  page?: number;
  size?: number;
  search?: string;
  status?: StatusOpname;
  id_ruang?: number;
  tanggal_dari?: string;
  tanggal_sampai?: string;
  /** Oldest first — how the approval queue is meant to be read. */
  terlama_dulu?: boolean;
}

/**
 * Documents whose `id_ruang` falls outside the session's active unit kerja are
 * **skipped silently** rather than erroring, so a short page is a fact about the
 * grant and not about the data.
 */
export async function listStokOpname(query: OpnameQuery = {}): Promise<Paged<OpnameRow>> {
  const page = await authedList<ApiOpname>(`/api/v1/stok-opname${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/** A document in a room outside the session's unit kerja answers 404, like one that never existed. */
export async function getStokOpname(id: number): Promise<OpnameDoc> {
  return toDoc(await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}`));
}

/**
 * Opens a counting session — **and freezes the room from this instant**.
 *
 * `ts_cutoff` is the server's `now()` and never comes from the body. A room that
 * already has an unfinished opname answers 409; a room outside the session's
 * active unit kerja answers 403.
 */
export async function createStokOpname(body: {
  id_ruang: number;
  uraian_so?: string | null;
}): Promise<OpnameDoc> {
  return toDoc(await authedRequest<ApiOpname>('/api/v1/stok-opname', { method: 'POST', body }));
}

/** `uraian_so` is the only header field that may change, and only while `DRAFT`. */
export async function updateStokOpname(
  id: number,
  body: { uraian_so: string | null }
): Promise<OpnameDoc> {
  return toDoc(
    await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Fills one line per product that has ever moved in this room, with `stok_awal`
 * frozen at the current balance and `stok_so` left null.
 *
 * Because the room has been frozen since the document was opened, "the balance
 * now" and "the balance at cutoff" are the same number — which is what makes
 * this safe to call at any point while `DRAFT`.
 *
 * **Once only.** A document that already has lines answers 409; a product that
 * `tarik-saldo` missed is added through `replaceOpnameDetail` instead.
 */
export async function tarikSaldo(id: number): Promise<OpnameDoc> {
  return toDoc(
    await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}/tarik-saldo`, { method: 'POST' })
  );
}

/**
 * Replaces **every** line, and **resets every `stok_so` to null**.
 *
 * That second half is why this is not an edit affordance on a counting screen:
 * it is how the *set of products* on the count is corrected, and running it
 * after somebody has walked the racks throws their work away. Every
 * `id_product` must already have a `kartu_stok` row for this room — a product
 * that has never moved here is a 400 for the whole request.
 */
export async function replaceOpnameDetail(
  id: number,
  idProducts: readonly number[]
): Promise<OpnameDoc> {
  return toDoc(
    await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}/detail`, {
      method: 'PUT',
      body: { detail: idProducts.map((id_product) => ({ id_product })) },
    })
  );
}

/**
 * Saves one counted line — the only per-line write in this API.
 *
 * `stokSo` of `null` is a real value meaning "un-count this", not an omission,
 * so it is sent explicitly. The two difference columns are recomputed by the
 * statement itself and are never in the body.
 */
export async function isiBarisOpname(
  id: number,
  idDetail: number,
  body: { stok_so?: number | null; keterangan?: string | null }
): Promise<OpnameDoc> {
  return toDoc(
    await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}/detail/${idDetail}`, {
      method: 'PATCH',
      body,
    })
  );
}

export type { AksiDokumen, AksiKey } from '@/services/alur-dokumen';

/**
 * The transitions, and two ways this table is unlike every other module's.
 *
 * **`tolak` takes no reason.** The schema has no rejection-reason column for
 * this document, and it is not a business decision anyway — sending a count back
 * is "go and count it again", a paper correction, which is also why `DIAJUKAN →
 * DRAFT` is not terminal here the way a rejected `pemakaian` is.
 *
 * **`batal` runs from any status**, the only transition in the whole API that
 * does, and the reason is the freeze: an opname abandoned in `DRAFT` would lock
 * its room out of every module forever. So it is listed three times, once per
 * origin — the table's grain is one row per `(transition, origin status)` and
 * spelling it out is what lets `pilihAksi` stay a filter.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan hasil hitung?',
    penjelasan:
      'Barisnya terkunci dan menunggu verifikasi. Ruang ini tetap beku sampai diposting atau dibatalkan. Baris yang belum dihitung boleh ikut — jumlahnya dilaporkan ke yang memverifikasi.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Kembalikan',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    // The endpoint takes no body at all — see above.
    alasanField: null,
    judul: 'Kembalikan untuk dihitung ulang?',
    penjelasan:
      'Dokumen kembali ke DRAFT dan barisnya bisa diisi lagi. Ruangnya tetap beku — DRAFT dan DIAJUKAN sama-sama membekukan.',
    danger: true,
  },
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Posting selisihnya?',
    penjelasan:
      'Menulis SO_SURPLUS atau SO_DEFISIT untuk setiap baris yang selisihnya tidak nol, bertanggal cutoff dan bukan hari ini. Baris yang belum dihitung dilewati sepenuhnya. Kartu stok append-only: yang salah hanya bisa dibalik. Ruang ini lepas beku setelahnya.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'DRAFT',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Hitung ulang minggu depan, rak belum selesai dirapikan',
    judul: 'Batalkan sesi hitung?',
    penjelasan:
      'Belum ada baris kartu stok, jadi hanya statusnya yang berubah — dan ruang ini langsung lepas beku, sehingga pembelian dan penjualan bisa diposting lagi.',
    danger: true,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Hitungannya tidak bisa dipercaya, mulai dari awal',
    judul: 'Batalkan sesi hitung?',
    penjelasan:
      'Belum ada baris kartu stok, jadi hanya statusnya yang berubah — dan ruang ini langsung lepas beku, sehingga pembelian dan penjualan bisa diposting lagi.',
    danger: true,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Hitungan rak B ternyata dobel, seluruh penyesuaian dibalik',
    judul: 'Batalkan opname yang sudah diposting?',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini — bukan tanggal cutoff — untuk setiap penyesuaian yang sudah ditulis, dinilai pada rata-rata bergerak ruang itu sekarang. Periode yang sudah ditutup tidak bergeser.',
    danger: true,
  },
];

export function aksiTersedia(status: StatusOpname, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/** Runs one transition. Each answers with the whole document. */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<OpnameDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiOpname>(`/api/v1/stok-opname/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
