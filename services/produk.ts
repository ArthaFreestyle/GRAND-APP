/**
 * The `/api/v1/product` group, mapped onto the shapes the Master Produk screen
 * renders.
 *
 * Every write here answers with the whole `Product`, so a mutation and a
 * refresh are one round trip: callers replace their detail state with what
 * comes back rather than patching it locally and hoping the two agree.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiProduct = components['schemas']['Product'];
type ApiSatuan = components['schemas']['Satuan'];

export type StokRuang = components['schemas']['StokRuang'];

/** One row of the product list. `GET /product` carries no satuan, harga, or stock. */
export interface ProductRow {
  id: number;
  kode: string;
  nama: string;
  namaSatuanDasar: string;
  stokMin: number;
  aktif: boolean;
  updatedAt: string;
}

/**
 * Product writes announced to whichever product screens are mounted.
 *
 * The list, the detail, and the create form are three routes now: the detail
 * saves a name and the list sitting underneath it would otherwise keep drawing
 * the old one until something forced a refetch. Publishing what the server
 * answered lets the list patch that one row and keep its scroll.
 */
export const produkBus = createRecordBus<ProductRow>();

export interface ProductSatuanRow {
  id: number;
  idSatuan: number;
  nama: string;
  faktor: number;
  /** `is_default_input` — at most one per product, moved rather than duplicated. */
  def: boolean;
}

export interface ProductHargaRow {
  id: number;
  idSatuan: number;
  nama: string;
  /** Decimal string, never a float: NUMERIC(20,2) must survive the trip unrounded. */
  harga: string;
  dari: string;
  /** **Exclusive**, and `null` means open-ended. */
  sampai: string | null;
}

export interface ProductDetail extends ProductRow {
  idDasar: number;
  satuan: ProductSatuanRow[];
  harga: ProductHargaRow[];
}

/**
 * What `/produk/[id]/ubah` hands back to the detail underneath it.
 *
 * `produkBus` cannot carry this. It is typed to `ProductRow`, which is what the
 * *catalogue* draws — no satuan, no harga — and those two are precisely what the
 * edit screen exists to change. A detail that took its update off that bus would
 * show a new name over yesterday's prices.
 *
 * `kabar` rides along because the sentence belongs to the screen that ends up on
 * top. Ubah saves and then leaves; saying "3 harga berlaku 11 September" on a
 * screen already sliding away is saying it to nobody, and `router.back()` has
 * nowhere to put a parameter.
 */
export interface ProductDetailChange {
  detail: ProductDetail;
  /** Empty when there is nothing to announce — a partial save that already failed loudly. */
  kabar: string;
}

/**
 * The detail's own channel, separate from the catalogue's.
 *
 * Same reason the two exist at all: the screens are routes, the one underneath
 * stays mounted, and nothing hands it the record that just changed. A write in
 * ubah publishes on **both** — this one so the detail redraws its prices, and
 * `produkBus` so the catalogue patches its row — because the two subscribers
 * need different shapes of the same answer.
 */
export const produkDetailBus = createRecordBus<ProductDetailChange>();

/**
 * The columns of a detail that the catalogue actually draws.
 *
 * Two screens publish product writes now — the detail (archive and restore) and
 * the edit route — and both have to narrow the same way before touching
 * `produkBus`. Handing the list satuan and harga would leave a second, quietly
 * diverging copy of them in a row that renders neither.
 */
export function productRowOf(d: ProductDetail): ProductRow {
  const { id, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt } = d;
  return { id, kode, nama, namaSatuanDasar, stokMin, aktif, updatedAt };
}

function toRow(p: ApiProduct): ProductRow {
  return {
    id: p.id ?? 0,
    kode: p.kode_barang ?? '',
    nama: p.nama ?? '',
    namaSatuanDasar: p.nama_satuan_dasar ?? '',
    stokMin: p.stok_minimum ?? 0,
    aktif: p.is_aktif ?? true,
    updatedAt: p.updated_at ?? p.created_at ?? '',
  };
}

function toDetail(p: ApiProduct): ProductDetail {
  return {
    ...toRow(p),
    idDasar: p.id_satuan_dasar ?? 0,
    // Already ordered by faktor server-side, so the base unit comes first.
    satuan: (p.satuan ?? []).map((s) => ({
      id: s.id ?? 0,
      idSatuan: s.id_satuan ?? 0,
      nama: s.nama_satuan ?? '',
      faktor: s.faktor ?? 1,
      def: s.is_default_input ?? false,
    })),
    // Already newest-first server-side.
    harga: (p.harga_jual ?? []).map((h) => ({
      id: h.id ?? 0,
      idSatuan: h.id_satuan ?? 0,
      nama: h.nama_satuan ?? '',
      harga: h.harga ?? '0',
      dari: h.berlaku_dari ?? '',
      sampai: h.berlaku_sampai ?? null,
    })),
  };
}

export async function listProducts(query: ListQuery): Promise<Paged<ProductRow>> {
  const page = await authedList<ApiProduct>(`/api/v1/product${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/**
 * One row of `GET /product/stok-minimum` - the reorder work list.
 *
 * A separate endpoint rather than a filter on `GET /product`, because the list
 * payload carries no stock at all: asking for it per row is the N+1 the
 * contract warns against. It answers only `is_aktif` products, never those with
 * `stok_minimum = 0` (that is the column default, meaning "not set" rather than
 * "may run out"), and it arrives sorted worst-first by `selisih`.
 *
 * The threshold is `total_stok <= stok_minimum`, not `<`: reaching the reorder
 * point *is* the moment to reorder. So membership in this list is the whole
 * definition of "di bawah minimum", which is what lets the Katalog screen split
 * its rows into two groups without a `stok_minimum` field of its own — see
 * `listPosProducts` below.
 *
 * `search` filters in SQL rather than over an already-loaded page. That matters
 * because the list is paged: a client-side filter only ever finds the items
 * that happened to be on the page in hand.
 */
export interface StokMinimumRow {
  id: number;
  kode: string;
  nama: string;
  stokMin: number;
  totalStok: number;
  /** `stok_minimum - total_stok`, never negative here. */
  selisih: number;
}

export async function listStokMinimum(
  query: { page?: number; size?: number; search?: string; id_ruang?: number } = {}
): Promise<Paged<StokMinimumRow>> {
  const page = await authedList<components['schemas']['StokMinimum']>(
    `/api/v1/product/stok-minimum${buildQuery({ ...query })}`
  );
  return {
    data: page.data.map((r) => ({
      id: r.id_product ?? 0,
      kode: r.kode_barang ?? '',
      nama: r.nama_product ?? '',
      stokMin: r.stok_minimum ?? 0,
      totalStok: r.total_stok ?? 0,
      selisih: r.selisih ?? 0,
    })),
    paging: page.paging,
  };
}

/** One unit of a `PosProduct`, with the price version in force on the asked-for date. */
export interface PosSatuanRow {
  idSatuan: number;
  nama: string;
  /** How many base units one of these holds. The base unit itself is 1. */
  faktor: number;
  def: boolean;
  /**
   * The `product_harga_jual` row the amount came off, or `null` when no version
   * is in force for this unit on that date. `penjualan_detail.id_harga_jual`
   * references the version, not the number, so it has to travel with it.
   */
  idHarga: number | null;
  /** Decimal string, or `null` together with `idHarga`. */
  harga: string | null;
}

/**
 * One row of `GET /pos/product` — a product with its units, its prices, and its
 * balance, in one read.
 *
 * **This, not `GET /product`, is what the Katalog screen is built on**, even
 * though `LayarGudang.dc.html`'s endpoint note names the other path. The
 * product list carries no stock, no satuan and no harga — those keys are absent
 * rather than empty — so a katalog drawn from it would have to fetch three more
 * things per row, which is exactly the N+1 the contract wrote this endpoint to
 * kill: twenty rows become sixty requests on the screen opened most often in
 * the whole app. Here it is three queries per page whatever the row count.
 *
 * Two consequences worth knowing before reaching for it elsewhere. It answers
 * **active products only**, with no parameter to see the others — a retired
 * item must not be sellable — so the "Nonaktif" view stays with `GET /product`.
 * And it **never** carries HPP: this read is open to anyone authenticated and
 * is often in a buyer's line of sight across the counter, while HPP is the
 * shop's margin.
 */
export interface PosProductRow {
  id: number;
  kode: string;
  nama: string;
  satuan: PosSatuanRow[];
  /**
   * Balance in the **base unit**, for the one `id_ruang` that was asked for.
   * `kartu_stok` knows no other unit; converting to a display unit is the
   * client's job, which is what every `faktor` is sent for.
   *
   * A reading, not a guarantee — it can be stale before it is acted on.
   */
  stokAkhir: number;
  /**
   * The `faktor === 1` entry: the unit `stokAkhir` is counted in, and the one
   * whose price the catalogue quotes. Derived here rather than at each call
   * site because "which unit is this number in" is a fact about the contract,
   * not a display choice.
   *
   * `satuan` is documented as never empty — every product owns its base unit —
   * but the fallback to the first entry is kept anyway: a row with no unit at
   * all should render as a product with an unnamed quantity, not crash the
   * list.
   */
  dasar: PosSatuanRow | null;
}

function toPosRow(p: components['schemas']['PosProduct']): PosProductRow {
  const satuan: PosSatuanRow[] = (p.satuan ?? []).map((s) => ({
    idSatuan: s.id_satuan ?? 0,
    nama: s.nama_satuan ?? '',
    faktor: s.faktor ?? 1,
    def: s.is_default_input ?? false,
    idHarga: s.id_harga_jual ?? null,
    harga: s.harga ?? null,
  }));
  return {
    id: p.id ?? 0,
    kode: p.kode_barang ?? '',
    nama: p.nama ?? '',
    satuan,
    stokAkhir: p.stok_akhir ?? 0,
    dasar: satuan.find((s) => s.faktor === 1) ?? satuan[0] ?? null,
  };
}

/**
 * A page of the POS catalogue.
 *
 * `id_ruang` is **required** by the contract and validated against `ruang`, so
 * a typo answers 404 rather than quietly reporting zero stock on every row.
 * `tanggal` decides which price version is in force and defaults to today in
 * WIB; the catalogue leaves it unset, because what it quotes is today's price.
 *
 * An exact `kode_barang` match is sorted to the top server-side — what a
 * barcode scan needs, and harmless to a screen that is only reading.
 */
export async function listPosProducts(query: {
  id_ruang: number;
  page?: number;
  size?: number;
  search?: string;
  tanggal?: string;
}): Promise<Paged<PosProductRow>> {
  const page = await authedList<components['schemas']['PosProduct']>(
    `/api/v1/pos/product${buildQuery({ ...query })}`
  );
  return { data: page.data.map(toPosRow), paging: page.paging };
}

export async function getProduct(id: number): Promise<ProductDetail> {
  return toDetail(await authedRequest<ApiProduct>(`/api/v1/product/${id}`));
}

export interface CreateProductBody {
  kode_barang: string;
  nama: string;
  id_satuan_dasar: number;
  stok_minimum?: number;
  /**
   * Derived units, written in the **same transaction** as the product.
   *
   * Worth carrying rather than adding afterwards with one
   * `POST /product/{id}/satuan` per unit: the wizard collects every unit before
   * it saves anything, and a product that exists with two of its three units
   * registered is a half-finished record somebody has to notice and repair. One
   * request either creates the whole thing or creates nothing.
   *
   * The base unit must **not** appear here with a `faktor` other than 1 — the
   * contract answers 400. Naming it again with `faktor: 1` is allowed and melts
   * into the row the server registers automatically, but there is no reason to,
   * so the wizard omits it.
   */
  satuan?: { id_satuan: number; faktor: number; is_default_input?: boolean }[];
}

/**
 * The base unit is registered automatically with `faktor = 1` from
 * `id_satuan_dasar`, so a product can never end up with no unit at all — which
 * is why `satuan` is optional here rather than required.
 */
export async function createProduct(body: CreateProductBody): Promise<ProductDetail> {
  return toDetail(await authedRequest<ApiProduct>('/api/v1/product', { method: 'POST', body }));
}

/**
 * Only `nama`, `stok_minimum`, and `is_aktif` — `kode_barang` and
 * `id_satuan_dasar` are immutable by contract: the code names the item in every
 * document that references it, and changing the base unit would invalidate every
 * `faktor` and every quantity already posted to `kartu_stok`.
 */
export async function updateProduct(
  id: number,
  body: { nama?: string; stok_minimum?: number; is_aktif?: boolean }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}`, { method: 'PATCH', body })
  );
}

/**
 * Adds a conversion, or updates the `faktor` of one already registered — the
 * endpoint upserts rather than rejecting, so a success never means something
 * different from what was asked was stored. `is_default_input: true` *moves* the
 * marker; the previous holder is cleared in the same transaction.
 */
export async function upsertSatuan(
  id: number,
  body: { id_satuan: number; faktor: number; is_default_input: boolean }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/satuan`, { method: 'POST', body })
  );
}

/**
 * Opens a new price version. Any version still open for the same product and
 * unit is closed at `berlaku_dari` in the same transaction — the range is
 * half-open, so that leaves neither a gap nor an overlap. Overlaps answer 409,
 * enforced by an exclusion constraint that no client-side check can stand in for.
 */
export async function addHarga(
  id: number,
  body: { id_satuan: number; harga: string; berlaku_dari: string }
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual`, { method: 'POST', body })
  );
}

/** Corrects the amount on an existing version. 409 once a nota references it. */
export async function updateHarga(
  id: number,
  idHarga: number,
  harga: string
): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual/${idHarga}`, {
      method: 'PATCH',
      body: { harga },
    })
  );
}

/**
 * Removes a version and reopens the one before it, so deleting never leaves a
 * date range with no price at all. A hard delete, allowed only while no document
 * references the row — otherwise 409.
 */
export async function deleteHarga(id: number, idHarga: number): Promise<ProductDetail> {
  return toDetail(
    await authedRequest<ApiProduct>(`/api/v1/product/${id}/harga-jual/${idHarga}`, {
      method: 'DELETE',
    })
  );
}

/**
 * Balance per ruang, straight off `kartu_stok`. Not paginated, unlike every
 * other list here. Rooms outside the session's active unit kerja are skipped
 * silently, and rooms the product never passed through never appear.
 *
 * **A reading, not a guarantee** — the figure can be stale before it is acted
 * on. Show it; do not decide on it.
 */
export function listStok(id: number): Promise<StokRuang[]> {
  return authedRequest<StokRuang[]>(`/api/v1/product/${id}/stok`);
}

/**
 * One line of the stock ledger: `GET /product/{id}/kartu-stok`.
 *
 * This is the read that answers "kenapa saldonya jadi segini", which
 * `GET /product/{id}/stok` cannot — that one shows the tail of the chain, this
 * one shows the whole chain.
 *
 * Three things about it are unlike every other list in this API, and each one
 * is load bearing:
 *
 * 1. **`id_ruang` is required.** The balance chain is partitioned per
 *    `(barang, ruang)`, so a "history" mixing rooms would print a running
 *    balance that never existed on any one shelf. An unknown room answers 404;
 *    a room outside the session's active unit kerja answers an empty page.
 * 2. **It is sorted ascending by `id`, not by date and not descending.** The
 *    chain is built in `id` order by the trigger, and a reversal is stamped
 *    `time.Now()` — so date order can differ from the real order of the chain.
 *    A ledger is read top to bottom, so the screen must not re-sort it.
 * 3. **`idAsal` marks a reversal.** It is filled only on the line a cancellation
 *    wrote to undo an earlier one, which is how a reversal is told apart from an
 *    ordinary movement without guessing from `jenis_transaksi` — posting and its
 *    undo share that value.
 *
 * Every quantity is already in the **base unit**; `qtyInput` / `satuanInput` are
 * only a trace of what the operator typed.
 */
export interface KartuStokRow {
  id: number;
  tanggal: string;
  jenis: string;
  masuk: number;
  keluar: number;
  /** Running balance *after* this line, in the base unit. */
  saldo: number;
  /** The document this movement came from, already resolved server-side. */
  nomor: string | null;
  refTable: string;
  /** Non-null only on a reversal — see the note above. */
  idAsal: number | null;
  keterangan: string | null;
}

export async function listKartuStok(
  id: number,
  query: { id_ruang: number; page?: number; size?: number }
): Promise<Paged<KartuStokRow>> {
  const page = await authedList<components['schemas']['KartuStok']>(
    `/api/v1/product/${id}/kartu-stok${buildQuery({ ...query })}`
  );
  return {
    data: page.data.map((r) => ({
      id: r.id ?? 0,
      tanggal: r.tanggal_transaksi ?? '',
      jenis: r.jenis_transaksi ?? '',
      masuk: r.stok_masuk ?? 0,
      keluar: r.stok_keluar ?? 0,
      saldo: r.stok_akhir ?? 0,
      nomor: r.nomor_dokumen ?? null,
      refTable: r.ref_table ?? '',
      idAsal: r.id_kartu_stok_asal ?? null,
      keterangan: r.keterangan ?? null,
    })),
    paging: page.paging,
  };
}

/**
 * The price version in force for each unit of one product, on one date.
 *
 * Not the same read as `ProductDetail.harga`, which is the whole history and
 * leaves "which one applies" to the client. This endpoint resolves it, and that
 * matters because `penjualan_detail.id_harga_jual` references **a version row**,
 * not a number: a sales line has to record which entry of the price list its
 * `harga_satuan_input` came off, and guessing the winner client-side would pin
 * the wrong row whenever a version had just been closed.
 *
 * The resolution is a plain `berlaku_dari <= tanggal AND (berlaku_sampai IS NULL
 * OR berlaku_sampai > tanggal)` rather than "newest wins", because an exclusion
 * constraint guarantees two versions are never in force at once — there is never
 * more than one candidate to choose between.
 *
 * `tanggal` defaults to today in WIB server-side. It is passed explicitly by the
 * sales screens anyway: the document's own date decides the price, and a note
 * typed after midnight for yesterday must not be priced at today's list.
 *
 * An unknown product answers **404**; a product with no version in force on that
 * date — including one that has never had a price — answers an **empty list**.
 * Two different facts, and the caller keeps them apart: a sale of a product with
 * no price is allowed, with the amount typed by hand.
 */
export function listHargaJualBerlaku(
  id: number,
  tanggal?: string
): Promise<components['schemas']['HargaJualBerlaku'][]> {
  return authedRequest<components['schemas']['HargaJualBerlaku'][]>(
    `/api/v1/product/${id}/harga-jual${buildQuery({ tanggal })}`
  );
}

/** Master satuan, for the unit dropdowns. */
export async function listSatuan(): Promise<ApiSatuan[]> {
  const page = await authedList<ApiSatuan>(
    `/api/v1/satuan${buildQuery({ size: 100, is_aktif: true })}`
  );
  return page.data;
}

/**
 * The last **POSTED** purchase of this product per supplier, newest first.
 *
 * The contract calls this the replacement for a purchase order, and names the
 * purchase entry form as the caller that narrows it with `id_supplier`: the
 * header there already says who is selling, so the useful question is "what did
 * I pay this supplier last time", not "what does everyone charge".
 *
 * Draft and cancelled documents are excluded server-side, so every row is a
 * price somebody actually paid. An unknown product answers 404; one never
 * bought answers an empty page — two different facts, and the caller keeps them
 * apart rather than showing "belum pernah dibeli" for a failed read.
 */
export function listRiwayatBeli(
  id: number,
  query: { page?: number; size?: number; id_supplier?: number } = {}
): Promise<Paged<components['schemas']['RiwayatBeli']>> {
  return authedList<components['schemas']['RiwayatBeli']>(
    `/api/v1/product/${id}/riwayat-beli${buildQuery({ ...query })}`
  );
}
