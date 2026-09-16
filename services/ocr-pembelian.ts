/**
 * `POST /pembelian/ocr/faktur-kedatangan` and `POST /pembelian/ocr/nota` — isu
 * #39 on the server, isu #36 here. Both close the gap `components/pembelian/
 * foto-nota.tsx`, `services/dokumen.ts` and `components/pembelian/
 * pilih-barang.tsx` used to name as "not in the contract yet" — read those
 * files' own headers for what changed once it landed.
 *
 * ## The shape that actually arrived, versus `Papan Layar OCR.dc.html`
 *
 * The board was drawn before the endpoint existed and assumes a queue: submit
 * a photo, get a job id back, poll it. **What shipped is synchronous** — one
 * multipart call that blocks until Gemini answers — and five other things
 * differ from the drawing too, all of which shape the screens in
 * `app/pembelian/baru.tsx`:
 *
 * 1. One file per call, and the endpoint **never stores it**. Not a list of
 *    already-uploaded `dokumen` ids — the picker's own local file. Attaching
 *    the photo to the nota afterward is the ordinary `POST /dokumen` →
 *    `tempel` path, run once the document exists.
 * 2. `id_supplier` and `id_ruang` are required **before** the file is even
 *    read, because `id_ruang` is checked against the active unit kerja first —
 *    so a 403 arrives before anyone has corrected a single line. The supplier
 *    step therefore comes *before* the photo in this flow, the reverse of the
 *    manual one.
 * 3. No confidence score. `OCRPembelianBaris.indeks_usulan` is `number | null`
 *    — recognised or not, nothing in between — so the review screen is two
 *    groups, not the three-tier badge the board draws.
 * 4. Not registered at all when `gemini.api_key` is empty: a 404, with no
 *    capability endpoint to check first. Every caller here has to treat that
 *    404 as "not turned on here" rather than a generic server error.
 * 5. `usulan` is already exactly the body `createPembelian()` sends — no
 *    second "confirm OCR" endpoint exists, and there should never be one built
 *    client-side either.
 *
 * Neither endpoint writes anything. The only side effect of calling either is
 * one request to Gemini.
 */
import type { components } from '@/types/api';

import type { UploadFile } from '@/services/api';
import { authedUpload } from '@/services/client';
import type { CreatePembelianBody, PembelianLineInput } from '@/services/pembelian';

type ApiOcrInfo = components['schemas']['OCRPembelianInfo'];
type ApiUsulan = components['schemas']['CreatePembelianRequest'];
type ApiDetailInput = components['schemas']['PembelianDetailInput'];

export type OcrBaris = components['schemas']['OCRPembelianBaris'];
export type OcrInfo = ApiOcrInfo;

export interface OcrPembelianResult {
  usulan: CreatePembelianBody;
  ocr: OcrInfo;
}

/** Which ticking convention the photographed document follows. */
export type JenisDokumenOcr = 'faktur-kedatangan' | 'nota';

/**
 * The Gemini call itself runs seconds to minutes, not the tens of milliseconds
 * every other read in this app takes. This is its own budget — never
 * `UPLOAD_TIMEOUT_MS` (sized for "send N megabytes", not "send, then wait on
 * Gemini, then receive") and never `REQUEST_TIMEOUT_MS` (15s is right for
 * every JSON call; raising it globally would make every screen hang a quarter
 * minute before failing).
 *
 * 180s is "Tier 1" from isu #36: a generous, honest budget with no backend
 * change, meant to be measured and revisited once a real p95 exists. See
 * CLAUDE.md's "Waktu tanggapan" section — Android has no timeout of its own
 * under RN 0.86 so this figure is the only clock running there, while iOS's
 * `NSURLSessionConfiguration` default (60s) can still cut a longer call short
 * regardless of what this says, and a production deployment behind a 60s
 * proxy idle timeout (nginx, an ALB) cuts it shorter still. None of that is
 * fixable from this file; it is named here so nobody re-derives it.
 */
export const OCR_TIMEOUT_MS = 180_000;

function mapDetail(d: ApiDetailInput): PembelianLineInput {
  return {
    id_product: d.id_product,
    id_satuan_input: d.id_satuan_input,
    qty_faktur: d.qty_faktur,
    qty_diterima: d.qty_diterima ?? null,
    harga_satuan_input: d.harga_satuan_input,
    diskon_baris: d.diskon_baris,
    jumlah_koli: d.jumlah_koli,
    keterangan_selisih: d.keterangan_selisih ?? null,
  };
}

function mapUsulan(u: ApiUsulan): CreatePembelianBody {
  return {
    tanggal: u.tanggal,
    id_supplier: u.id_supplier,
    id_ruang: u.id_ruang,
    no_faktur_supplier: u.no_faktur_supplier ?? null,
    tanggal_faktur: u.tanggal_faktur ?? null,
    diskon_nota: u.diskon_nota,
    ppn: u.ppn,
    ppn_dikreditkan: u.ppn_dikreditkan,
    pembulatan: u.pembulatan,
    id_ekspedisi: u.id_ekspedisi ?? null,
    no_resi: u.no_resi ?? null,
    total_koli: u.total_koli ?? null,
    tarif_per_koli: u.tarif_per_koli ?? null,
    ditanggung_supplier: u.ditanggung_supplier,
    metode_alokasi_angkut: u.metode_alokasi_angkut,
    jenis_pembayaran: u.jenis_pembayaran,
    detail: u.detail.map(mapDetail),
  };
}

export interface BacaArgs {
  file: UploadFile;
  idSupplier: number;
  idRuang: number;
  /** Default hari ini (WIB) di server bila dikosongkan. */
  tanggal?: string;
  /** Wired to the screen's "Batalkan" button — see `apiUpload`'s `UploadOptions.signal`. */
  signal?: AbortSignal;
}

async function baca(path: string, args: BacaArgs): Promise<OcrPembelianResult> {
  const fields: Record<string, string> = {
    id_supplier: String(args.idSupplier),
    id_ruang: String(args.idRuang),
  };
  if (args.tanggal) fields.tanggal = args.tanggal;

  const answer = await authedUpload<{ usulan: ApiUsulan; ocr: ApiOcrInfo }>(
    path,
    'file',
    args.file,
    {
      fields,
      timeoutMs: OCR_TIMEOUT_MS,
      // The renewal window has to cover the whole call, or the token either
      // refreshes proactively mid-Gemini-wait for nothing, or dies just past
      // its `expires_at` with no room left to renew before the request would
      // have timed out anyway.
      skewMs: OCR_TIMEOUT_MS + 60_000,
      // A retry re-sends the whole photo and bills Gemini a second time.
      retryOn401: false,
      signal: args.signal,
    }
  );

  return { usulan: mapUsulan(answer.usulan), ocr: answer.ocr };
}

/** H1→H2 for a faktur kedatangan already ticked by warehouse staff against the physical delivery. */
export function bacaFakturKedatangan(args: BacaArgs): Promise<OcrPembelianResult> {
  return baca('/api/v1/pembelian/ocr/faktur-kedatangan', args);
}

/** Same shape, for a vendor's own nota — no ticking convention at all, every recognised row reads as received in full. */
export function bacaNota(args: BacaArgs): Promise<OcrPembelianResult> {
  return baca('/api/v1/pembelian/ocr/nota', args);
}
