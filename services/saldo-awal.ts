/**
 * Saldo awal — the eighth document that writes `kartu_stok`, and the only one
 * whose inventory value is born from a number somebody typed.
 *
 * There is no supplier, no debt, no invoice and no counterparty of any kind: the
 * one money figure is what goes into inventory. So what shapes this module is not
 * its flow — that is `pembelian`'s, exactly, on purpose — but its **fence**:
 *
 * **One `(barang, ruang)` for life.** A product that already has *any*
 * `kartu_stok` row in that room is refused 409, including rows this module wrote
 * itself and the reversal rows that undo them. Cancelling from `POSTED` closes
 * that door forever; the correction is a `stok_opname`. That is the fence
 * working, not a side effect to smooth over in the client, and the screens say so
 * *before* the button is pressed rather than after a 409 arrives.
 *
 * ## What is typed, and what is read back
 *
 * `harga_satuan_input` is the typed cost per input unit; `nilai_masuk` is
 * `qty_input × harga_satuan_input` rounded **once**, by the server — not
 * `qty_dasar × harga_pokok_satuan_dasar`, which differs by a cent (300.00, not
 * 299.99). `previewNilai` below exists so a line can show what it is about to be
 * worth while it is being typed; what is shown after saving is the server's
 * number, never this one.
 *
 * `total_nilai` is **null until `POSTED`** and stays null here — drawn as no
 * figure, not as "Rp 0".
 */
import type { components } from '@/types/api';

import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import { pilihAksi, type AksiDokumen } from '@/services/alur-dokumen';
import { createRecordBus } from '@/hooks/use-record-bus';
import type { RoleName } from '@/services/permissions';

type ApiSaldoAwal = components['schemas']['SaldoAwal'];
type ApiSaldoAwalDetail = components['schemas']['SaldoAwalDetail'];

export type SaldoAwalDetailInput = components['schemas']['SaldoAwalDetailInput'];
export type StatusSaldoAwal = NonNullable<ApiSaldoAwal['status']>;

/** A list row. `detail` is absent on the list endpoint — the key is gone, not empty. */
export interface SaldoAwalRow {
  id: number;
  nomor: string;
  tanggal: string;
  idRuang: number;
  namaRuang: string;
  alasan: string;
  status: StatusSaldoAwal;
  /** `null` until `POSTED`. Never coalesced to `'0'`: no figure is not zero rupiah. */
  totalNilai: string | null;
}

export interface SaldoAwalLine {
  id: number;
  idProduct: number;
  kode: string;
  nama: string;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
  qtyDasar: number;
  namaSatuanDasar: string;
  hargaSatuanInput: string;
  hargaPokokSatuanDasar: string;
  /** The server's figure. Read, never recomputed for display after a save. */
  nilaiMasuk: string;
  /** Null until the document is posted. */
  idKartuStok: number | null;
}

export interface SaldoAwalDoc extends SaldoAwalRow {
  /**
   * `undefined` is "not read yet" and `[]` is "read, and there are none". A list
   * row is never a `SaldoAwalDoc`, so this is only ever `undefined` if a caller
   * builds one by hand — which is what keeps the two facts apart.
   */
  lines: SaldoAwalLine[];
  createdAt: string;
  diajukanPada: string | null;
  disetujuiPada: string | null;
  postedAt: string | null;
  alasanTolak: string | null;
  alasanBatal: string | null;
}

function toRow(d: ApiSaldoAwal): SaldoAwalRow {
  return {
    id: d.id ?? 0,
    nomor: d.nomor ?? '',
    tanggal: d.tanggal ?? '',
    idRuang: d.id_ruang ?? 0,
    namaRuang: d.nama_ruang ?? '',
    alasan: d.alasan ?? '',
    status: d.status ?? 'DRAFT',
    totalNilai: d.total_nilai ?? null,
  };
}

function toLine(l: ApiSaldoAwalDetail): SaldoAwalLine {
  return {
    id: l.id ?? 0,
    idProduct: l.id_product ?? 0,
    kode: l.kode_barang ?? '',
    nama: l.nama_product ?? '',
    qtyInput: l.qty_input ?? '0',
    idSatuanInput: l.id_satuan_input ?? 0,
    namaSatuan: l.nama_satuan ?? '',
    faktor: l.faktor_konversi ?? 1,
    qtyDasar: l.qty_dasar ?? 0,
    namaSatuanDasar: l.nama_satuan_dasar ?? '',
    hargaSatuanInput: l.harga_satuan_input ?? '0',
    hargaPokokSatuanDasar: l.harga_pokok_satuan_dasar ?? '0',
    nilaiMasuk: l.nilai_masuk ?? '0',
    idKartuStok: l.id_kartu_stok ?? null,
  };
}

function toDoc(d: ApiSaldoAwal): SaldoAwalDoc {
  return {
    ...toRow(d),
    lines: (d.detail ?? []).map(toLine),
    createdAt: d.created_at ?? '',
    diajukanPada: d.diajukan_pada ?? null,
    disetujuiPada: d.disetujui_pada ?? null,
    postedAt: d.posted_at ?? null,
    alasanTolak: d.alasan_tolak ?? null,
    alasanBatal: d.alasan_batal ?? null,
  };
}

/** The columns the list draws — field by field so the lines are not retained. */
export function saldoAwalRowOf(doc: SaldoAwalDoc): SaldoAwalRow {
  const { id, nomor, tanggal, idRuang, namaRuang, alasan, status, totalNilai } = doc;
  return { id, nomor, tanggal, idRuang, namaRuang, alasan, status, totalNilai };
}

export const saldoAwalBus = createRecordBus<SaldoAwalRow>();

export interface SaldoAwalQuery {
  page?: number;
  size?: number;
  /** Matches the number **and** the reason. */
  search?: string;
  status?: StatusSaldoAwal;
  id_ruang?: number;
  tanggal_dari?: string;
  tanggal_sampai?: string;
}

/** Documents in a room outside the active unit kerja vanish from the page; never a 404. */
export async function listSaldoAwal(query: SaldoAwalQuery = {}): Promise<Paged<SaldoAwalRow>> {
  const page = await authedList<ApiSaldoAwal>(`/api/v1/saldo_awal${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

export async function getSaldoAwal(id: number): Promise<SaldoAwalDoc> {
  return toDoc(await authedRequest<ApiSaldoAwal>(`/api/v1/saldo_awal/${id}`));
}

/**
 * Creates a draft. `tanggal`, `id_ruang` and `alasan` are required; `detail` may
 * be empty here but `ajukan` refuses a document with no lines.
 *
 * A 409 here is the early check of the fence: it names the `kode_barang`, the
 * room, and `stok_opname` as the way out. Its sentence is shown as it came.
 */
export async function createSaldoAwal(body: {
  tanggal: string;
  id_ruang: number;
  alasan: string;
  detail?: SaldoAwalDetailInput[];
}): Promise<SaldoAwalDoc> {
  return toDoc(await authedRequest<ApiSaldoAwal>('/api/v1/saldo_awal', { method: 'POST', body }));
}

/**
 * Header only, `DRAFT` only. All three columns are `NOT NULL`: they may change
 * and may not be emptied, so a blank `alasan` is refused before it is sent.
 */
export async function updateSaldoAwal(
  id: number,
  body: { tanggal?: string; id_ruang?: number; alasan?: string }
): Promise<SaldoAwalDoc> {
  return toDoc(
    await authedRequest<ApiSaldoAwal>(`/api/v1/saldo_awal/${id}`, { method: 'PATCH', body })
  );
}

/** Replaces **every** line: at least one, at most 500. */
export async function replaceSaldoAwalDetail(
  id: number,
  detail: SaldoAwalDetailInput[]
): Promise<SaldoAwalDoc> {
  return toDoc(
    await authedRequest<ApiSaldoAwal>(`/api/v1/saldo_awal/${id}/detail`, {
      method: 'PUT',
      body: { detail },
    })
  );
}

export type { AksiDokumen, AksiKey } from '@/services/alur-dokumen';

/**
 * The transitions, in flow order — **not** button order. The detail screen
 * stably sorts the destructive ones to the end, as `penerimaan-susulan` does, so
 * a supervisor on a `DIAJUKAN` document does not get *reject* as the green pill.
 *
 * Two of the sentences are the reason this module exists:
 *
 * - **posting** writes inventory value from a typed number with no document
 *   behind it;
 * - **batal from `POSTED`** closes the `(barang, ruang)` pair for good. It is
 *   the most important sentence in the module and is written to be read
 *   *before* the confirm, not discovered after.
 */
export const AKSI: readonly AksiDokumen[] = [
  {
    key: 'ajukan',
    label: 'Ajukan',
    dari: 'DRAFT',
    roles: ['INVENTARIS', 'SUPERADMIN'],
    alasanField: null,
    judul: 'Ajukan saldo awal ini?',
    penjelasan:
      'Tanggal, gudang dan barisnya terkunci menunggu supervisor. Belum ada yang masuk kartu stok.',
    danger: false,
  },
  {
    key: 'tolak',
    label: 'Tolak',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    // Follows `pembelian`, not `pemakaian`: this is "hitung ulang, angkanya tidak
    // cocok" — a paper correction, and the reason is the only way back to the typist.
    alasanField: 'alasan',
    contoh: 'Harga rak B tidak cocok dengan kertas hitungan',
    judul: 'Tolak pengajuan',
    penjelasan:
      'Dokumen kembali ke DRAFT untuk dihitung ulang. Alasannya wajib — itu satu-satunya jalur balik ke yang mengetik.',
    danger: true,
  },
  {
    key: 'posting',
    label: 'Posting',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: null,
    judul: 'Posting saldo awal?',
    penjelasan:
      'Menulis nilai persediaan dari angka yang diketik, tanpa faktur atau dokumen lain di belakangnya. Barang yang sudah punya baris kartu stok apa pun di gudang ini akan ditolak. Kartu stok append-only: yang salah tidak bisa diedit, hanya dibatalkan.',
    danger: false,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'DRAFT',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Migrasi ditunda, hitungan belum final',
    judul: 'Batalkan draf saldo awal?',
    penjelasan:
      'Belum ada baris kartu stok, jadi hanya statusnya yang berubah. Barang-barangnya tetap bisa diberi saldo awal lewat dokumen lain.',
    danger: true,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'DIAJUKAN',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Angkanya salah, dibuat ulang dari awal',
    judul: 'Batalkan pengajuan saldo awal?',
    penjelasan:
      'Belum ada baris kartu stok, jadi hanya statusnya yang berubah. Barang-barangnya tetap bisa diberi saldo awal lewat dokumen lain.',
    danger: true,
  },
  {
    key: 'batal',
    label: 'Batalkan',
    dari: 'POSTED',
    roles: ['SUPERADMIN'],
    alasanField: 'alasan_batal',
    contoh: 'Salah ketik harga, dikoreksi lewat stok opname',
    judul: 'Batalkan saldo awal yang sudah diposting?',
    penjelasan:
      'Ini tidak bisa diulang. Baris pembalik menjadi riwayat, sehingga barang-barang ini tidak akan pernah bisa diberi saldo awal lagi di gudang ini — koreksinya lewat stok opname. Ditolak bila barangnya sudah keluar dari gudang; catat pengeluarannya lewat pemakaian, penjualan atau mutasi.',
    danger: true,
  },
];

export function aksiTersedia(status: StatusSaldoAwal, role: RoleName | null): AksiDokumen[] {
  return pilihAksi(AKSI, status, role);
}

/** Runs one transition. Each answers with the whole document. */
export async function jalankanAksi(
  id: number,
  aksi: AksiDokumen,
  alasan: string
): Promise<SaldoAwalDoc> {
  const body = aksi.alasanField ? { [aksi.alasanField]: alasan } : undefined;
  return toDoc(
    await authedRequest<ApiSaldoAwal>(`/api/v1/saldo_awal/${id}/${aksi.key}`, {
      method: 'POST',
      body,
    })
  );
}
