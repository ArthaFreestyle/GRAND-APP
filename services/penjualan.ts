/**
 * The `/api/v1/penjualan` group.
 *
 * A nota penjualan is **a document with a flow**, not an editable invoice row —
 * but a shorter flow than pembelian's, and the difference is the point of the
 * module. It runs `DRAFT → POSTED → BATAL` with **no `DIAJUKAN`**: there is no
 * `ajukan` endpoint and no `tolak` endpoint, because a cashier cannot make a
 * buyer standing at the counter wait for a supervisor to approve a cash note
 * typed in seconds.
 *
 * The two-person control did not disappear, it **moved to the cancel side**.
 * `CASHIER` creates the note, types its lines, and posts it; `SUPERADMIN` is
 * the only one who may cancel a posted one. So the person who wrote the note
 * cannot quietly unwrite it, which is the same guarantee pembelian gets by
 * splitting the posting.
 *
 * ### What is deliberately not modelled here
 *
 * - **There is no `dibayar` column.** The screen this replaces kept one and
 *   derived lunas/belum from it. Money in is its own document group,
 *   `/api/v1/penerimaan-pembayaran`, with allocations to notes, its own posting,
 *   and giro that only settles a receivable when it clears. What a nota knows
 *   about payment is `status_pembayaran` — a server-side cache, never set from
 *   a form — and the rupiah behind it comes from `GET /pelanggan/{id}/piutang`.
 *   See `services/pelanggan.ts`.
 * - **There is no due date, and no `tempo`.** `tempo` is not a column on
 *   `Pelanggan` at all, so the old "jatuh tempo" chips were computing a date the
 *   server would never agree with. `TUNAI` vs `KREDIT` and BELUM / SEBAGIAN /
 *   LUNAS is the whole of what is known. What *does* exist is `plafon_kredit`,
 *   and posting is the only place it is enforced.
 * - **`total_hpp` is not a client calculation.** It is `null` until posting and
 *   is then filled from what `kartu_stok` actually recorded — the moving average
 *   in that ruang at that moment, which no screen can reproduce.
 *
 * Two shapes come back and they are not the same object. `PenjualanRow` is what
 * the list reports; `PenjualanDoc` adds the header fields and `lines`, and only
 * the detail endpoint carries those — on the list the `detail` key is **absent**,
 * not empty, because filling it would mean one query per row.
 *
 * **Every write answers with the whole document**, the two transitions included,
 * so a mutation and a refresh are one round trip.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiPenjualan = components['schemas']['Penjualan'];
type ApiPenjualanDetail = components['schemas']['PenjualanDetail'];

/**
 * Three, not four. `DIAJUKAN` is absent from this document's enum entirely —
 * it is not a status a nota can be caught in, so nothing renders it.
 */
export type StatusDokumen = NonNullable<ApiPenjualan['status']>;
export type JenisPembayaran = NonNullable<ApiPenjualan['jenis_pembayaran']>;
export type StatusPembayaran = NonNullable<ApiPenjualan['status_pembayaran']>;

/**
 * One nota as the list reports it. `detail` is **absent** on this endpoint, not
 * empty — the contract leaves the key off rather than paying one query per row.
 */
export interface PenjualanRow {
  id: number;
  nomor: string;
  /** Date-time. */
  tanggal: string;
  idRuang: number;
  namaRuang: string;
  /**
   * `null` on a cash note typed at the counter. A walk-in is not a customer
   * record, and the contract only insists on one when the note is `KREDIT`.
   */
  idPelanggan: number | null;
  namaPelanggan: string;
  /** Decimal string. `subtotal - diskon_nota + pembulatan`. */
  total: string;
  jenis: JenisPembayaran;
  statusBayar: StatusPembayaran;
  status: StatusDokumen;
}

/**
 * One sold line.
 *
 * `idHargaJual` is the field this whole module exists to carry properly: it
 * names **which version of the price list** `hargaSatuanInput` came off, not the
 * amount. The amount is a snapshot and may be anything — haggling happens, and
 * what is written on the note is what is charged — but without the version there
 * is no way afterwards to tell a negotiated price from a stale one. It is
 * nullable because a product with no price at all may still be sold, with the
 * figure typed by hand.
 */
export interface PenjualanLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  /** Snapshot of `product_satuan` when the line was written; the master may move, this does not. */
  faktor: number;
  qtyDasar: number;
  namaSatuanDasar: string;
  idHargaJual: number | null;
  hargaSatuanInput: string;
  diskonBaris: string;
  /** `qty_input x harga_satuan_input - diskon_baris`. */
  subtotal: string;
  /** `null` until the nota is posted — not yet known, rather than missing. */
  hppDasar: string | null;
  hppTotal: string | null;
}

/** The header fields the list does not carry, plus the lines. */
export interface PenjualanDoc extends PenjualanRow {
  subtotal: string;
  diskonNota: string;
  /** May be negative — that is the note's rounding line, not an error. */
  pembulatan: string;
  /** `null` until POSTED. Once filled, the note's margin is `total - totalHpp`. */
  totalHpp: string | null;
  lines: PenjualanLine[];
  createdAt: string;
  postedAt: string | null;
  alasanBatal: string | null;
}

function toRow(p: ApiPenjualan): PenjualanRow {
  return {
    id: p.id ?? 0,
    nomor: p.nomor ?? '',
    tanggal: p.tanggal ?? '',
    idRuang: p.id_ruang ?? 0,
    namaRuang: p.nama_ruang ?? '',
    idPelanggan: p.id_pelanggan ?? null,
    namaPelanggan: p.nama_pelanggan ?? '',
    total: p.total ?? '0.00',
    jenis: p.jenis_pembayaran ?? 'TUNAI',
    statusBayar: p.status_pembayaran ?? 'BELUM',
    status: p.status ?? 'DRAFT',
  };
}

function toLine(d: ApiPenjualanDetail): PenjualanLine {
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
    idHargaJual: d.id_harga_jual ?? null,
    hargaSatuanInput: d.harga_satuan_input ?? '0.00',
    diskonBaris: d.diskon_baris ?? '0.00',
    subtotal: d.subtotal ?? '0.00',
    hppDasar: d.hpp_satuan_dasar ?? null,
    hppTotal: d.hpp_total ?? null,
  };
}

function toDoc(p: ApiPenjualan): PenjualanDoc {
  return {
    ...toRow(p),
    subtotal: p.subtotal ?? '0.00',
    diskonNota: p.diskon_nota ?? '0.00',
    pembulatan: p.pembulatan ?? '0.00',
    totalHpp: p.total_hpp ?? null,
    // Absent on the list by contract. A nota genuinely without lines cannot be
    // posted, so an empty array here means "the list endpoint answered".
    lines: (p.detail ?? []).map(toLine),
    createdAt: p.created_at ?? '',
    postedAt: p.posted_at ?? null,
    alasanBatal: p.alasan_batal ?? null,
  };
}

/**
 * Document changes announced to whichever penjualan screens are mounted — the
 * detail posts, the list sitting underneath it patches the row it already has.
 * See `hooks/use-record-bus.ts`.
 */
export const penjualanBus = createRecordBus<PenjualanRow>();

/**
 * Narrows a `PenjualanDoc` back to the row shape the list holds. Copied field by
 * field rather than spread: a list row that quietly carried the whole document,
 * lines included, would keep every visited detail alive for as long as the list
 * is mounted.
 */
export function rowOf(doc: PenjualanDoc): PenjualanRow {
  return {
    id: doc.id,
    nomor: doc.nomor,
    tanggal: doc.tanggal,
    idRuang: doc.idRuang,
    namaRuang: doc.namaRuang,
    idPelanggan: doc.idPelanggan,
    namaPelanggan: doc.namaPelanggan,
    total: doc.total,
    jenis: doc.jenis,
    statusBayar: doc.statusBayar,
    status: doc.status,
  };
}

// ---- reads ----

export interface PenjualanQuery {
  page?: number;
  size?: number;
  /** Matches the document number only — not the customer's name. */
  search?: string;
  status?: StatusDokumen;
  statusPembayaran?: StatusPembayaran;
  jenisPembayaran?: JenisPembayaran;
  idRuang?: number;
  idPelanggan?: number;
  /** Inclusive, whole days. */
  tanggalDari?: string;
  tanggalSampai?: string;
}

/**
 * Since isu #12 fase 6 the reads are filtered by the **active grant's unit
 * kerja**: a nota whose ruang sits outside it is skipped silently, and
 * `total_item` is counted after that filtering. The same list therefore differs
 * between two grants of the same user, which is why switching context
 * invalidates every list at once (`reloadAllRecords`).
 */
export async function listPenjualan(query: PenjualanQuery = {}): Promise<Paged<PenjualanRow>> {
  const {
    statusPembayaran,
    jenisPembayaran,
    idRuang,
    idPelanggan,
    tanggalDari,
    tanggalSampai,
    ...rest
  } = query;
  const page = await authedList<ApiPenjualan>(
    `/api/v1/penjualan${buildQuery({
      ...rest,
      status_pembayaran: statusPembayaran,
      jenis_pembayaran: jenisPembayaran,
      id_ruang: idRuang,
      id_pelanggan: idPelanggan,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

/**
 * The header **and** its lines — there is no separate `GET .../detail`, only the
 * `PUT` that replaces the set. A nota in another unit kerja answers 404, exactly
 * like an id that does not exist.
 */
export async function getPenjualan(id: number): Promise<PenjualanDoc> {
  return toDoc(await authedRequest<ApiPenjualan>(`/api/v1/penjualan/${id}`));
}

// ---- writes ----

export interface PenjualanLineInput {
  /**
   * May appear more than once in one document, following `mutasi`/`pemakaian`:
   * the quota is the ruang's balance, summed over every line against it.
   */
  id_product: number;
  /** Must already be registered in that product's `product_satuan`, or 400. */
  id_satuan_input: number;
  qty_input: string;
  /**
   * The price list version `harga_satuan_input` was taken from, or `null` when
   * it was typed by hand. Validated when sent: it must belong to this line's
   * product **and** unit, and be in force on the document's `tanggal` — which is
   * why changing the date after typing the lines can invalidate one that was
   * resolved against the old date.
   */
  id_harga_jual?: number | null;
  harga_satuan_input: string;
  diskon_baris?: string;
}

/**
 * The header fields `PATCH /penjualan/{id}` accepts.
 *
 * Unlike pembelian, **all three of `id_ruang`, `id_pelanggan`, and
 * `jenis_pembayaran` are editable**. No detail line points at any of them, so
 * nothing is left behind pointing at the wrong thing — and the contract says so
 * explicitly. `nomor`, `total_hpp`, and `status_pembayaran` are never here: the
 * first is identity, the other two are derived.
 */
export interface PenjualanHeaderBody {
  tanggal?: string;
  id_ruang?: number;
  id_pelanggan?: number | null;
  jenis_pembayaran?: JenisPembayaran;
  diskon_nota?: string;
  pembulatan?: string;
}

export interface CreatePenjualanBody extends PenjualanHeaderBody {
  tanggal: string;
  /** One ruang for every line; a nota cannot draw from two. */
  id_ruang: number;
  /**
   * Allowed to be empty here — a nota is usually opened while the goods are
   * still being scanned. Posting refuses a document with no lines.
   */
  detail?: PenjualanLineInput[];
}

/**
 * Always creates a `DRAFT` — `status` is not a field, and stock moves at posting
 * and only at posting.
 *
 * The number is generated server-side (`PJ/KODE/2026/08/0001`, reset monthly by
 * the document's own `tanggal`), so guessing at it here would show a number that
 * may not be the one stored. `subtotal` and `total` are recomputed from the
 * lines; sending them achieves nothing.
 *
 * `KREDIT` without `id_pelanggan` is refused by a check constraint, not by a
 * usecase — a walk-in cannot owe money to a name nobody wrote down.
 */
export async function createPenjualan(body: CreatePenjualanBody): Promise<PenjualanDoc> {
  return toDoc(await authedRequest<ApiPenjualan>('/api/v1/penjualan', { method: 'POST', body }));
}

/**
 * **`DRAFT` only** — any other status answers 409.
 *
 * The KREDIT-needs-a-customer rule is re-checked against the *effective* values
 * after the patch, not just the fields sent: switching to `KREDIT` while the
 * stored `id_pelanggan` is still empty is refused even though the request never
 * mentioned the customer.
 */
export async function updatePenjualan(
  id: number,
  body: PenjualanHeaderBody
): Promise<PenjualanDoc> {
  return toDoc(
    await authedRequest<ApiPenjualan>(`/api/v1/penjualan/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Replaces **every** line at once — `PUT`, not `PATCH`, and at least one line is
 * required here even though `POST` allows none.
 *
 * The lines of one nota are a single unit; a partial edit would leave the header
 * totals disagreeing with the lines between requests. `DRAFT` only: posted lines
 * are what `kartu_stok` was written from and what a reversal reads back.
 */
export async function replacePenjualanDetail(
  id: number,
  detail: PenjualanLineInput[]
): Promise<PenjualanDoc> {
  return toDoc(
    await authedRequest<ApiPenjualan>(`/api/v1/penjualan/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

// ---- the workflow ----

/**
 * Re-exported so a screen that already imports this module does not need a
 * second import for the type of the table it is rendering. See
 * `services/alur-dokumen.ts` for the vocabulary the document groups share.
 */
export type { AksiDokumen, AksiKey } from '@/services/alur-dokumen';

/**
 * **Two transitions, not four.** There is no `ajukan` and no `tolak` in this
 * group at all — the endpoints do not exist — so the table is the whole flow.
 *
 * The role split is the mirror image of pembelian's. There, `INVENTARIS` types
 * and `SUPERADMIN` posts, because posting is the irreversible act and it wanted
 * a second pair of eyes. Here posting is the sale itself, happening with a buyer
 * at the counter, so it stays with the person holding the money; the second pair
 * of eyes moved to the cancellation, which is the only thing that can undo it.
 *
 * `SUPERADMIN` is listed on `posting` because the contract's own authorization
 * rule is that `SUPERADMIN` may do anything; what it says it may *not* do is
 * override `plafon_kredit`, and that is a check inside posting rather than a
 * separate endpoint. The credit limit refuses a superadmin exactly as it refuses
 * a cashier.
 *
 * The screen renders only what the active grant can actually run: an operator
 * pressing "Batalkan" and being told `role tidak mencukupi` learns nothing about
 * who to ask.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DRAFT',
    roles: ['CASHIER', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Posting nota ini?',
    penjelasan:
      'Barang keluar dari ruangnya dan harga pokok setiap baris diisi dari kartu stok — bukan dihitung di layar ini. Nota TUNAI langsung lunas; nota KREDIT jadi piutang pelanggan dan di sinilah plafon kreditnya diperiksa. Kartu stok append-only: posting yang salah tidak bisa diperbaiki, hanya dibalik oleh atasan.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Nota salah pelanggan, seluruh barang dikembalikan ke rak',
    judul: 'Batalkan nota POSTED',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini — bukan tanggal nota — jadi periode yang sudah ditutup tidak bergeser, dan barangnya masuk lagi dinilai dengan rata-rata bergerak yang berlaku sekarang. Harga pokok yang sudah tercatat tidak dikosongkan: itu catatan apa yang benar-benar terjadi.',
    danger: true,
  },
];

/** The transitions this status and this role can actually run right now. */
export function aksiTersedia(status: StatusDokumen, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/**
 * Runs one transition. Both answer with the whole document, so the caller
 * replaces its state rather than guessing at the new status — posting also fills
 * every line's harga pokok and the note's `total_hpp`, which no local patch
 * would know how to do.
 */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<PenjualanDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiPenjualan>(`/api/v1/penjualan/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
