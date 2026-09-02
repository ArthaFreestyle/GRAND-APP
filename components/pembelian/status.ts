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

/** `LENGKAP` is the unremarkable case, so it gets the quiet tint. */
export const TERIMA_META: Record<StatusPenerimaan, StatusMeta> = {
  LENGKAP: { label: 'Diterima lengkap', tone: 'neutral' },
  KURANG: { label: 'Kiriman kurang', tone: 'amber' },
};
