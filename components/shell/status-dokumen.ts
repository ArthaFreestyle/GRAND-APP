/**
 * How a stock document's status reads on screen.
 *
 * Two maps, answering two different questions that the screens this replaces
 * used to collapse into one invented "lunas / belum lunas":
 *
 * - `status` — where the document is in its flow. Only `POSTED` has moved any
 *   stock, and only `POSTED` is worth money to anybody.
 * - `status_pembayaran` — whether the money has actually moved, recomputed
 *   server-side from POSTED allocations, never set from a form.
 *
 * Both are keyed by the flow's own vocabulary rather than by any one module's
 * status type, because five document groups share them: `pembelian` and its two
 * derived documents run the full `DRAFT → DIAJUKAN → POSTED → BATAL`, and
 * `penjualan` and `mutasi` run the same thing minus `DIAJUKAN`. They live in
 * `shell/` rather than under one of those sections for the same reason
 * `alur-dokumen.ts` does: private copies had already started to disagree about
 * the wording, and a document's position in its flow is the one thing a reader
 * scans a list of thirty rows for.
 *
 * What is *not* here is anything only one document can be. `TERIMA_META` stays
 * in `components/pembelian/status.ts`: only an invoice is owed goods.
 */
import type { ToneName } from '@/components/shell/ui';
import type { StatusAlur } from '@/services/alur-dokumen';
import type { components } from '@/types/api';

/**
 * The three payment states, taken off the contract rather than retyped. Every
 * document group that carries `status_pembayaran` spells it the same way, so
 * one enum indexes all of them.
 */
type StatusPembayaran = NonNullable<components['schemas']['Pembelian']['status_pembayaran']>;

export interface StatusMeta {
  label: string;
  tone: ToneName;
}

export const DOKUMEN_META: Record<StatusAlur, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  DIAJUKAN: { label: 'Diajukan', tone: 'amber' },
  POSTED: { label: 'Posted', tone: 'green' },
  BATAL: { label: 'Batal', tone: 'red' },
};

/**
 * Deliberately worded from the paper's point of view rather than from the
 * money's — "belum dibayar" is true of an unpaid purchase invoice and of an
 * unpaid sales note alike, while "belum masuk" and "belum keluar" would need
 * two maps to say the same thing twice.
 */
export const BAYAR_META: Record<StatusPembayaran, StatusMeta> = {
  BELUM: { label: 'Belum dibayar', tone: 'red' },
  SEBAGIAN: { label: 'Dibayar sebagian', tone: 'amber' },
  LUNAS: { label: 'Lunas', tone: 'green' },
};
