/**
 * The one status only a purchase invoice can be in.
 *
 * `status` and `status_pembayaran` moved to `components/shell/status-dokumen.ts`
 * when `penjualan` landed: five document groups render the same two badges, and
 * the flow those badges describe is not pembelian's property. What is left here
 * is `status_penerimaan`, which genuinely is — only an invoice can be owed
 * goods, and only an invoice has a follow-up delivery to chase.
 */
import type { StatusMeta } from '@/components/shell/status-dokumen';
import type { StatusPenerimaan } from '@/services/pembelian';

/**
 * `LENGKAP` is the unremarkable case, so it gets the quiet tint.
 *
 * No Ramah-toned counterpart of this map: the ported list and detail both say
 * "Kiriman kurang" as plain amber caption text rather than a second badge next
 * to the document's own — one filled badge is what a reader scans thirty rows
 * for without reading any words, and a second badge competing for that same
 * glance would blunt it.
 */
export const TERIMA_META: Record<StatusPenerimaan, StatusMeta> = {
  LENGKAP: { label: 'Diterima lengkap', tone: 'neutral' },
  KURANG: { label: 'Kiriman kurang', tone: 'amber' },
};
