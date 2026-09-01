/**
 * The `/api/v1/pembelian` group.
 *
 * A pembelian is **a document with a workflow**, not an editable invoice row:
 * `DRAFT → DIAJUKAN → POSTED`, plus `BATAL`, and each hop is its own endpoint
 * with its own role. Nothing about it can be modelled as "save the record" —
 * the header PATCH and the detail PUT are refused outright once the document
 * leaves `DRAFT`, and posting is the only thing that moves stock.
 *
 * Two shapes come back, and they are not the same object. `PembelianRow` is
 * what the list reports; `PembelianDoc` adds the header fields and `lines`, and
 * only the detail endpoint carries those — on the list the `detail` key is
 * **absent**, not empty, because filling it would mean one query per row.
 *
 * **Every write answers with the whole document**, including the four workflow
 * transitions, so a mutation and a refresh are one round trip: callers replace
 * their state with what comes back rather than patching locally and hoping the
 * two agree.
 *
 * ### What is deliberately not modelled here
 *
 * - **There is no `dibayar` column.** The screen this replaces kept one and
 *   derived lunas/belum from it. Money out is its own document group,
 *   `/api/v1/pembayaran-utang`, with allocations to invoices, its own posting,
 *   and giro handling on top. What a pembelian itself knows is
 *   `status_pembayaran` — a server-side cache recomputed from POSTED
 *   allocations and POSTED returns, never set from a form — and the rupiah
 *   behind it comes from `GET /supplier/{id}/utang`. See `services/supplier.ts`.
 * - **There is no due date.** Neither `Pembelian` nor `UtangSupplier` carries
 *   one, and `tempo` is not a supplier column either, so the old "jatuh tempo"
 *   chips were computing a date the server would never agree with. `TUNAI` vs
 *   `KREDIT` and BELUM / SEBAGIAN / LUNAS is the whole of what is known.
 * - **`biaya_angkut` is not part of `total`.** The carrier bills that, not the
 *   supplier; it reaches the books through each line's `alokasi_biaya`. Adding
 *   the two together anywhere overstates the debt.
 *
 * `penerimaan-susulan` and `retur-pembelian` — the two documents that keep
 * moving after a pembelian is posted — are their own modules and their own
 * sections. What *this* one carries is their effect on the invoice they hang
 * off: `qtySusulanDasar`, `sisaDasar`, `qtyReturDasar`, and `qtyDapatDiretur`
 * on every line. Those four are the caps both of them are written against, so
 * they are read from here rather than recomputed there.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { RoleName } from '@/services/permissions';
import type { components } from '@/types/api';

type ApiPembelian = components['schemas']['Pembelian'];
type ApiPembelianDetail = components['schemas']['PembelianDetail'];

export type StatusDokumen = NonNullable<ApiPembelian['status']>;
export type JenisPembayaran = NonNullable<ApiPembelian['jenis_pembayaran']>;
export type StatusPembayaran = NonNullable<ApiPembelian['status_pembayaran']>;
export type StatusPenerimaan = NonNullable<ApiPembelian['status_penerimaan']>;
export type MetodeAlokasiAngkut = NonNullable<ApiPembelian['metode_alokasi_angkut']>;

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
  /** `KURANG` when any line received less than it was invoiced for. A cache, recomputed. */
  statusTerima: StatusPenerimaan;
  status: StatusDokumen;
}

/**
 * One invoice line, with **four quantities in two pairs**.
 *
 * `qtyFaktur` / `qtyDasar` is what the paper says and what drives the debt;
 * `qtyDiterima` / `qtyDiterimaDasar` is what was counted off the truck and what
 * drives stock. Everything ending in `Dasar` is in the product's base unit.
 */
export interface PembelianLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyFaktur: string;
  qtyDiterima: string;
  idSatuanInput: number;
  namaSatuan: string;
  /** Snapshot of `product_satuan` when the line was written; the master may move, this does not. */
  faktor: number;
  qtyDasar: number;
  qtyDiterimaDasar: number;
  /** Sum of **POSTED** penerimaan susulan against this line. Drafts are not deliveries. */
  qtySusulanDasar: number;
  /** `qtyDasar - qtyDiterimaDasar`: what the first delivery was short. Frozen at posting. */
  selisihDasar: number;
  /** `selisihDasar - qtySusulanDasar`: what the supplier still owes today. */
  sisaDasar: number;
  qtyReturDasar: number;
  /**
   * `qtyDiterimaDasar + qtySusulanDasar - qtyReturDasar`.
   *
   * A different axis from the three above, and mixing them is the mistake to
   * avoid: returned goods were still received, so a return neither makes the
   * supplier owe goods again nor earns a right to a follow-up delivery.
   * `sisaDasar` and `qtyDapatDiretur` can both be non-zero on the same line.
   */
  qtyDapatDiretur: number;
  namaSatuanDasar: string;
  hargaSatuanInput: string;
  diskonBaris: string;
  subtotal: string;
  /** Decimal: one line may occupy part of a carton. Usually 0 until the goods are unpacked. */
  jumlahKoli: string;
  /** This line's share of `biaya_angkut`. The lines sum to it exactly. */
  alokasiBiaya: string;
  /** `null` until the document is posted — not yet known, rather than missing. */
  hppDasar: string | null;
  keteranganSelisih: string | null;
}

/** The header fields the list does not carry, plus the lines. */
export interface PembelianDoc extends PembelianRow {
  idRuang: number;
  namaRuang: string;
  subtotal: string;
  diskonNota: string;
  ppn: string;
  ppnDikreditkan: boolean;
  pembulatan: string;
  idEkspedisi: number | null;
  noResi: string;
  totalKoli: string;
  tarifPerKoli: string;
  /** `totalKoli x tarifPerKoli`, or `0.00` when the supplier is covering it. */
  biayaAngkut: string;
  ditanggungSupplier: boolean;
  metodeAlokasi: MetodeAlokasiAngkut;
  lines: PembelianLine[];
  createdAt: string;
  diajukanPada: string | null;
  disetujuiPada: string | null;
  postedAt: string | null;
  alasanTolak: string | null;
  alasanBatal: string | null;
}

export type SisaPembelian = components['schemas']['SisaPembelian'];

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
    statusTerima: p.status_penerimaan ?? 'LENGKAP',
    status: p.status ?? 'DRAFT',
  };
}

function toLine(d: ApiPembelianDetail): PembelianLine {
  return {
    id: d.id ?? 0,
    idProduct: d.id_product ?? 0,
    kode: d.kode_barang ?? '',
    nama: d.nama_product ?? '',
    qtyFaktur: d.qty_faktur ?? '0',
    qtyDiterima: d.qty_diterima ?? '0',
    idSatuanInput: d.id_satuan_input ?? 0,
    namaSatuan: d.nama_satuan ?? '',
    faktor: d.faktor_konversi ?? 1,
    qtyDasar: d.qty_dasar ?? 0,
    qtyDiterimaDasar: d.qty_diterima_dasar ?? 0,
    qtySusulanDasar: d.qty_susulan_dasar ?? 0,
    selisihDasar: d.selisih_dasar ?? 0,
    sisaDasar: d.sisa_dasar ?? 0,
    qtyReturDasar: d.qty_retur_dasar ?? 0,
    qtyDapatDiretur: d.qty_dapat_diretur ?? 0,
    namaSatuanDasar: d.nama_satuan_dasar ?? '',
    hargaSatuanInput: d.harga_satuan_input ?? '0.00',
    diskonBaris: d.diskon_baris ?? '0.00',
    subtotal: d.subtotal ?? '0.00',
    jumlahKoli: d.jumlah_koli ?? '0.00',
    alokasiBiaya: d.alokasi_biaya ?? '0.00',
    hppDasar: d.harga_pokok_satuan_dasar ?? null,
    keteranganSelisih: d.keterangan_selisih ?? null,
  };
}

function toDoc(p: ApiPembelian): PembelianDoc {
  return {
    ...toRow(p),
    idRuang: p.id_ruang ?? 0,
    namaRuang: p.nama_ruang ?? '',
    subtotal: p.subtotal ?? '0.00',
    diskonNota: p.diskon_nota ?? '0.00',
    ppn: p.ppn ?? '0.00',
    ppnDikreditkan: p.ppn_dikreditkan ?? false,
    pembulatan: p.pembulatan ?? '0.00',
    idEkspedisi: p.id_ekspedisi ?? null,
    noResi: p.no_resi ?? '',
    totalKoli: p.total_koli ?? '0.00',
    tarifPerKoli: p.tarif_per_koli ?? '0.00',
    biayaAngkut: p.biaya_angkut ?? '0.00',
    ditanggungSupplier: p.ditanggung_supplier ?? false,
    metodeAlokasi: p.metode_alokasi_angkut ?? 'KOLI',
    // Absent on the list by contract; a document genuinely without lines cannot
    // be submitted, so an empty array here means "the list endpoint answered".
    lines: (p.detail ?? []).map(toLine),
    createdAt: p.created_at ?? '',
    diajukanPada: p.diajukan_pada ?? null,
    disetujuiPada: p.disetujui_pada ?? null,
    postedAt: p.posted_at ?? null,
    alasanTolak: p.alasan_tolak ?? null,
    alasanBatal: p.alasan_batal ?? null,
  };
}

/**
 * Document changes announced to whichever pembelian screens are mounted — the
 * detail posts, the list sitting underneath it patches the row it already has.
 * See `hooks/use-record-bus.ts`.
 */
export const pembelianBus = createRecordBus<PembelianRow>();

/**
 * Narrows a `PembelianDoc` back to the row shape the list holds. Copied field by
 * field rather than spread: a list row that quietly carried the whole document,
 * lines included, would keep every visited detail alive for as long as the list
 * is mounted.
 */
export function rowOf(doc: PembelianDoc): PembelianRow {
  return {
    id: doc.id,
    nomor: doc.nomor,
    tanggal: doc.tanggal,
    idSupplier: doc.idSupplier,
    namaSupplier: doc.namaSupplier,
    noFakturSupplier: doc.noFakturSupplier,
    tanggalFaktur: doc.tanggalFaktur,
    total: doc.total,
    jenis: doc.jenis,
    statusBayar: doc.statusBayar,
    statusTerima: doc.statusTerima,
    status: doc.status,
  };
}

// ---- reads ----

export interface PembelianQuery {
  page?: number;
  size?: number;
  /** Partial match on the document number **or** the supplier's invoice number. */
  search?: string;
  status?: StatusDokumen;
  statusPenerimaan?: StatusPenerimaan;
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
  const { idSupplier, statusPenerimaan, tanggalDari, tanggalSampai, ...rest } = query;
  const page = await authedList<ApiPembelian>(
    `/api/v1/pembelian${buildQuery({
      ...rest,
      id_supplier: idSupplier,
      status_penerimaan: statusPenerimaan,
      tanggal_dari: tanggalDari,
      tanggal_sampai: tanggalSampai,
    })}`
  );
  return { data: page.data.map(toRow), paging: page.paging };
}

/** The header **and** its lines. A document in another unit kerja answers 404, like an unknown id. */
export async function getPembelian(id: number): Promise<PembelianDoc> {
  return toDoc(await authedRequest<ApiPembelian>(`/api/v1/pembelian/${id}`));
}

/**
 * Only the lines still short — the ones whose `qty_diterima_dasar` is under
 * `qty_dasar`. Lines that arrived complete are absent by design: this is the
 * chase-up list for a follow-up delivery, and a complete line is not on it.
 */
export function getSisaPembelian(id: number): Promise<SisaPembelian> {
  return authedRequest<SisaPembelian>(`/api/v1/pembelian/${id}/sisa`);
}

// ---- writes ----

export interface PembelianLineInput {
  id_product: number;
  /** Must already be registered in that product's `product_satuan`, or 400. */
  id_satuan_input: number;
  qty_faktur: string;
  /**
   * Omitted means "the same as `qty_faktur`" — the ordinary case where
   * everything on the paper was in the box. Filling it is how a short delivery
   * is recorded, and when it differs `keterangan_selisih` becomes required.
   *
   * It may never exceed `qty_faktur`: goods that were not invoiced have no
   * value, so their proportional `nilai_masuk` would overshoot the invoice and
   * corrupt the moving average permanently.
   */
  qty_diterima?: string | null;
  harga_satuan_input: string;
  diskon_baris?: string;
  jumlah_koli?: string;
  keterangan_selisih?: string | null;
}

/**
 * The header fields `PATCH /pembelian/{id}` accepts.
 *
 * `nomor`, `id_supplier`, and `id_ruang` are missing on purpose: the number
 * identifies the document, the supplier decides whose debt it is, and the ruang
 * decides which stock balance every line touches. Getting one of those wrong is
 * a cancel-and-retype, not an edit.
 */
export interface PembelianHeaderBody {
  tanggal?: string;
  no_faktur_supplier?: string | null;
  tanggal_faktur?: string | null;
  diskon_nota?: string;
  ppn?: string;
  ppn_dikreditkan?: boolean;
  pembulatan?: string;
  id_ekspedisi?: number | null;
  no_resi?: string | null;
  total_koli?: string | null;
  tarif_per_koli?: string | null;
  ditanggung_supplier?: boolean;
  metode_alokasi_angkut?: MetodeAlokasiAngkut;
  jenis_pembayaran?: JenisPembayaran;
}

export interface CreatePembelianBody extends PembelianHeaderBody {
  tanggal: string;
  id_supplier: number;
  /** One ruang for every line; a document cannot land in two. */
  id_ruang: number;
  detail: PembelianLineInput[];
}

/**
 * Always creates a `DRAFT` — `status` is not in the body at all, and stock moves
 * at posting and only at posting.
 *
 * The number is generated server-side (`BL/KODE/2026/08/0001`, reset monthly by
 * the document's own `tanggal`), so a July invoice typed in August still gets a
 * July number. `subtotal`, `total`, `biaya_angkut`, and `status_penerimaan` are
 * recomputed from the lines; sending them achieves nothing.
 */
export async function createPembelian(body: CreatePembelianBody): Promise<PembelianDoc> {
  return toDoc(await authedRequest<ApiPembelian>('/api/v1/pembelian', { method: 'POST', body }));
}

/** **`DRAFT` only** — any other status answers 409. That is what submitting is for. */
export async function updatePembelian(
  id: number,
  body: PembelianHeaderBody
): Promise<PembelianDoc> {
  return toDoc(
    await authedRequest<ApiPembelian>(`/api/v1/pembelian/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Replaces **every** line at once — `PUT`, not `PATCH`.
 *
 * The lines of one document are a single unit retyped from a single sheet of
 * paper, and a partial edit would leave the header totals disagreeing with the
 * lines between requests. `DRAFT` only: posted lines are what
 * `retur_pembelian_detail` points at and the cost source of every reversal.
 */
export async function replacePembelianDetail(
  id: number,
  detail: PembelianLineInput[]
): Promise<PembelianDoc> {
  return toDoc(
    await authedRequest<ApiPembelian>(`/api/v1/pembelian/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

/**
 * Splits `total_koli` across the lines in proportion to `qty_dasar`, summing to
 * **exactly** `total_koli`.
 *
 * It exists because posting refuses a document whose line cartons do not add up
 * to the header's, and typing each line's share by hand is precisely the
 * arithmetic that produces a document out by 0.01. Needs `total_koli` filled in,
 * and `DRAFT` only.
 */
export async function bagiRataKoli(id: number): Promise<PembelianDoc> {
  return toDoc(
    await authedRequest<ApiPembelian>(`/api/v1/pembelian/${id}/bagi-rata-koli`, { method: 'POST' })
  );
}

// ---- the workflow ----

/**
 * The workflow vocabulary is `services/alur-dokumen.ts` — the three document
 * groups that write `kartu_stok` run the same four transitions with the same
 * role split, and one description of that is enough. Re-exported here so a
 * screen that already imports this module does not need a second import for the
 * type of the table it is rendering.
 */
export type { AksiDokumen, AksiKey } from '@/services/alur-dokumen';

/**
 * The four transitions, with who may run each.
 *
 * **The split is along the workflow, not along the data.** `INVENTARIS` types
 * the invoice and submits it; `SUPERADMIN` posts, rejects, or cancels. The
 * reason is that posting is not an edit — it appends rows to `kartu_stok`,
 * which is append-only, so a wrong posting cannot be corrected, only reversed.
 * Requiring a second person is the control.
 *
 * `services/permissions.ts` deliberately stops at the entry permission for the
 * screen (`useCanWrite('pembelian')`, which is INVENTARIS or SUPERADMIN); this
 * table is the per-transition half it points at.
 *
 * The screen hides what the active grant may not run rather than letting the
 * button fail: an operator pressing "Posting" and being told `role tidak
 * mencukupi` learns nothing about who to ask.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan faktur ini?',
    penjelasan:
      'Setelah diajukan, header dan barisnya terkunci. Jalan keluarnya hanya diposting atau ditolak.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Tolak',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan',
    contoh: 'Harga baris 3 tidak cocok dengan nota supplier',
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
      'Menambah baris kartu stok untuk setiap baris yang benar-benar menerima barang, dinilai sebanding dengan yang datang — bukan nilai faktur penuh. Kartu stok append-only: posting yang salah tidak bisa diperbaiki, hanya dibalik.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Faktur salah supplier, seluruh barang dikembalikan',
    judul: 'Batalkan dokumen POSTED',
    penjelasan:
      'Menulis baris pembalik bertanggal hari ini — bukan tanggal dokumen — jadi periode yang sudah ditutup tidak bergeser. Pembaliknya dinilai pada rata-rata bergerak yang berlaku sekarang, bukan harga pokok baris aslinya.',
    danger: true,
  },
];

/** The transitions this status and this role can actually run right now. */
export function aksiTersedia(status: StatusDokumen, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/**
 * Runs one transition. Each answers with the whole document, so the caller
 * replaces its state rather than guessing at the new status — `tolak` also
 * clears the submitter and fills `alasan_tolak`, which no local patch would know
 * to do.
 */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<PembelianDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiPembelian>(`/api/v1/pembelian/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
