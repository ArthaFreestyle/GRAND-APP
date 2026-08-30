/**
 * How a purchase document's three statuses look on screen.
 *
 * Three, not one, and they answer different questions that used to be collapsed
 * into a single invented "lunas / belum lunas":
 *
 * - `status` — where the document is in its approval flow. Only `POSTED` has
 *   moved any stock.
 * - `status_pembayaran` — whether the money has gone out, recomputed server-side
 *   from POSTED payment allocations and POSTED returns.
 * - `status_penerimaan` — whether everything invoiced actually arrived.
 *
 * Kept here rather than in each screen because the pembelian list, the pembelian
 * detail, and the supplier detail all render the same badges, and three private
 * copies had already started to disagree about the wording.
 */
import type { ToneName } from '@/components/shell/ui';
import type {
  StatusDokumen,
  StatusPembayaran,
  StatusPenerimaan,
} from '@/services/pembelian';

export interface StatusMeta {
  label: string;
  tone: ToneName;
}

export const DOKUMEN_META: Record<StatusDokumen, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  DIAJUKAN: { label: 'Diajukan', tone: 'amber' },
  POSTED: { label: 'Posted', tone: 'green' },
  BATAL: { label: 'Batal', tone: 'red' },
};

export const BAYAR_META: Record<StatusPembayaran, StatusMeta> = {
  BELUM: { label: 'Belum dibayar', tone: 'red' },
  SEBAGIAN: { label: 'Dibayar sebagian', tone: 'amber' },
  LUNAS: { label: 'Lunas', tone: 'green' },
};

/** `LENGKAP` is the unremarkable case, so it gets the quiet tint. */
export const TERIMA_META: Record<StatusPenerimaan, StatusMeta> = {
  LENGKAP: { label: 'Diterima lengkap', tone: 'neutral' },
  KURANG: { label: 'Kiriman kurang', tone: 'amber' },
};
