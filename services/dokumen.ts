/**
 * Lampiran — the polymorphic attachment module, and the whole of the photo half
 * of the OCR board.
 *
 * ## Why this is one module and not a field on `pembelian`
 *
 * `Papan Layar OCR.dc.html` closes with a list of what the server still owes,
 * and one of its rows says the flow needs two new fields, `pembelian.lampiran[]`
 * and `pembelian.ocr_id`. **The first half of that is already wrong**: the
 * contract has carried attachments since before this board was drawn, and it
 * carries them *polymorphically* precisely so that no document type grows a
 * field for them. The contract's own prose gives the reason in the same words
 * the board uses — a photo of the faktur is taken before the purchase document
 * it belongs to exists, so a row is born **yatim** (`ref_table` and `ref_id`
 * null) and is stuck to its parent afterwards:
 *
 *   1. `POST /dokumen` — one file, one row, no parent yet.
 *   2. `POST /dokumen/{id}/tempel` — `{ ref_table, ref_id }`, once the nota exists.
 *   3. `GET /dokumen?ref_table=pembelian&ref_id=…` — that nota's attachments.
 *
 * The second half of the board's claim stands: `ocr_id` has nothing behind it,
 * because `POST /ocr/faktur` does not exist. That gap is named where it bites,
 * in `app/pembelian/baru.tsx`, not papered over here.
 *
 * ## The orphan tray is a real feature, not a leak
 *
 * `GET /dokumen` with **neither** reference answers the files *the caller*
 * uploaded and has not attached anywhere. The contract says outright that this
 * is what a receiving screen needs "to offer the photo taken a few minutes
 * ago", and it is what lets the photo step survive the app being killed
 * mid-flow: the pages are on the server already, so reopening the flow finds
 * them rather than asking for them again. Passing only one of the two
 * parameters is a 400 — half a reference names an entire table or nothing.
 *
 * Orphans are swept by a server-side worker eventually, so abandoning the flow
 * leaks nothing permanent; that is the contract's design, not this module
 * tolerating a mess.
 */
import type { components } from '@/types/api';

import { API_BASE_URL, type Paged, type UploadFile, buildQuery } from '@/services/api';
import { authedList, authedRequest, authedUpload } from '@/services/client';

type ApiDokumen = components['schemas']['Dokumen'];

/** Which document types may own an attachment. The server holds the same whitelist. */
export type RefTable = NonNullable<ApiDokumen['ref_table']>;

export interface DokumenRow {
  id: number;
  /** From the client, stored verbatim **for display only** — never a path. */
  namaAsli: string;
  /** Detected from the file's magic bytes, not from what the client claimed. */
  mime: NonNullable<ApiDokumen['mime']>;
  ukuranByte: number;
  /** Null while the row is still yatim; both reference halves fill together. */
  refTable: RefTable | null;
  refId: number | null;
  createdAt: string;
  namaPembuat: string;
  /**
   * Non-null when a live attachment with the same checksum already existed.
   *
   * It is a **warning, not a refusal** — the contract is explicit that one scan
   * may legitimately be attached to two different documents — so a screen shows
   * it and carries on rather than rejecting the page.
   */
  duplikatDariId: number | null;
}

function toRow(d: ApiDokumen): DokumenRow {
  return {
    id: d.id ?? 0,
    namaAsli: d.nama_asli ?? '',
    mime: d.mime ?? 'image/jpeg',
    ukuranByte: d.ukuran_byte ?? 0,
    refTable: d.ref_table ?? null,
    refId: d.ref_id ?? null,
    createdAt: d.created_at ?? '',
    namaPembuat: d.nama_pembuat ?? '',
    duplikatDariId: d.duplikat_dari_id ?? null,
  };
}

/** True for the two image types; a PDF page has no thumbnail to draw. */
export function isGambar(row: DokumenRow): boolean {
  return row.mime === 'image/jpeg' || row.mime === 'image/png';
}

/**
 * Uploads one file and returns the row it became, still yatim.
 *
 * Only JPEG, PNG and PDF are accepted, and **the server decides which from the
 * file's contents**, not from `file.type` or the extension — both of which the
 * caller controls entirely. So a wrong `type` here is harmless and a renamed
 * HTML file is a 400 no matter what this says.
 *
 * The size limit (`dokumen.max_size_mb`, 10 MB by default) is enforced as the
 * bytes stream, so an oversized photo is refused partway through rather than
 * after the whole thing has been buffered. A file only slightly over answers
 * 400 with an explanation; 413 means very much larger than that.
 */
export async function uploadDokumen(file: UploadFile): Promise<DokumenRow> {
  return toRow(await authedUpload<ApiDokumen>('/api/v1/dokumen', 'berkas', file));
}

/**
 * The caller's own unattached uploads, newest first.
 *
 * This is the *only* mode that takes no reference, and it is scoped to the
 * signed-in user server-side — there is no parameter for reading somebody
 * else's tray.
 */
export function listDokumenYatim(
  query: { page?: number; size?: number } = {}
): Promise<Paged<DokumenRow>> {
  return listDokumen(query);
}

/** The attachments of one document. Both halves of the reference or neither. */
export function listDokumenOf(
  refTable: RefTable,
  refId: number,
  query: { page?: number; size?: number } = {}
): Promise<Paged<DokumenRow>> {
  return listDokumen({ ...query, ref_table: refTable, ref_id: refId });
}

async function listDokumen(query: Record<string, string | number | undefined>) {
  const page = await authedList<ApiDokumen>(`/api/v1/dokumen${buildQuery(query)}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/**
 * An `<Image>` source for one attachment's bytes.
 *
 * `GET /api/v1/dokumen/{id}` is behind the bearer token like every other route —
 * deliberately, because a faktur photo carries purchase prices and the identity
 * of the supplier — so the token has to travel with the image request. That is
 * what `expo-image`'s `headers` is for, and it is the only way to draw one of
 * these without first downloading it to a file.
 *
 * Two things follow from the token being *in* the URL's request rather than the
 * URL itself. A token that expires while the screen is open makes the image
 * fail to load rather than 401 at a call site, and it recovers on the next
 * render with a fresh one — which is why callers should read the token from
 * `useSession()` rather than capture it once. And the response carries
 * `Content-Disposition: attachment`, which is a browser instruction and means
 * nothing to a native image view.
 */
export function dokumenSource(id: number, token: string) {
  return {
    uri: `${API_BASE_URL}/api/v1/dokumen/${id}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

/**
 * Sticks one uploaded file to the document it belongs to.
 *
 * Four different 409s, and each is worth keeping apart from the others because
 * the server's own message names them: the file is already attached elsewhere
 * (moving it would quietly pull evidence out of the document that has it), the
 * parent is `BATAL`, or the parent already holds ten attachments.
 */
export async function tempelDokumen(
  id: number,
  refTable: RefTable,
  refId: number
): Promise<DokumenRow> {
  return toRow(
    await authedRequest<ApiDokumen>(`/api/v1/dokumen/${id}/tempel`, {
      method: 'POST',
      body: { ref_table: refTable, ref_id: refId },
    })
  );
}

/**
 * Removes one attachment — the only `DELETE` in this API, and a soft one: the
 * bytes go, the row stays with `deleted_at` set.
 *
 * Allowed only while the file is **still yatim or its parent is `DRAFT`**. Once
 * the document has been submitted, the photo that approval was granted on is
 * part of the record and not the uploader's to withdraw; that is a 409, as is
 * deleting the same row twice.
 */
export async function deleteDokumen(id: number): Promise<DokumenRow> {
  return toRow(await authedRequest<ApiDokumen>(`/api/v1/dokumen/${id}`, { method: 'DELETE' }));
}
