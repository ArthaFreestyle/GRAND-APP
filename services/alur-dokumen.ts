/**
 * The document flow the stock-writing modules run, and the one part of it that
 * is **not** shared.
 *
 * `pembelian`, `penerimaan-susulan`, and `retur-pembelian` move `DRAFT →
 * DIAJUKAN → POSTED` plus `BATAL`, over four endpoints with the same names, the
 * same bodies, and the same role split: `INVENTARIS` types and submits,
 * `SUPERADMIN` posts, rejects, and cancels.
 *
 * `penjualan` runs a **subset**: `DRAFT → POSTED → BATAL`, with no `ajukan` and
 * no `tolak` endpoint at all, because a cashier cannot make a buyer at the
 * counter wait for approval. Its two-person control moved to the other end —
 * `CASHIER` types and posts, `SUPERADMIN` alone may cancel — so the same three
 * pieces of vocabulary describe it exactly. That is why `StatusAlur` and
 * `AksiKey` are the union of what any of them can be rather than what all of
 * them are, and why `pilihAksi` filters instead of assuming: a module simply
 * never lists the rows it has no endpoints for.
 *
 * What does **not** live here is the table itself. Every module declares its own
 * `AKSI`, because the sentence each transition shows is the only thing standing
 * between an operator and an irreversible write, and they are not the same
 * sentence: posting a pembelian values stock at the invoice, posting a susulan
 * copies the harga pokok the invoice already fixed, posting a retur takes goods
 * back out at today's moving average, and posting a penjualan charges stock out
 * at that average while enforcing the customer's credit limit — the only place
 * that check happens at all. A shared table would have to say "menulis ke kartu
 * stok" and stop there, which is the part everybody already knows.
 *
 * The screens hide what the active grant may not run rather than letting the
 * button fail — `role tidak mencukupi` after a press teaches nobody who to ask.
 */
import type { RoleName } from '@/services/permissions';

/**
 * Every position one of these documents can be in — the union, not the set any
 * one of them uses. `penjualan` never reaches `DIAJUKAN`; its own `status` type
 * is narrower and assignable to this.
 */
export type StatusAlur = 'DRAFT' | 'DIAJUKAN' | 'POSTED' | 'BATAL';

/**
 * The path segment each transition posts to, which is also its identity. Again
 * the union: `ajukan` and `tolak` have no endpoint in the penjualan group.
 */
export type AksiKey = 'ajukan' | 'tolak' | 'posting' | 'batal';

export interface AksiDokumen {
  key: AksiKey;
  /** Button label. */
  label: string;
  /** The one status the transition starts from. */
  dari: StatusAlur;
  /**
   * The roles the server accepts. `SUPERADMIN` is listed explicitly rather than
   * assumed, because two of these are *only* SUPERADMIN and the difference is
   * the whole point of the split.
   */
  roles: readonly RoleName[];
  /** The mandatory reason's body key, or `null` when the endpoint takes no body. */
  alasanField: 'alasan' | 'alasan_batal' | null;
  /**
   * The reason field's placeholder. It belongs here rather than in the dialog
   * for the same reason `penjelasan` does: a plausible reason to reject an
   * invoice is not a plausible reason to send goods back, and a placeholder that
   * fits neither is one somebody has to read twice before ignoring.
   */
  contoh?: string;
  /** Dialog title and the sentence explaining what the transition really does. */
  judul: string;
  penjelasan: string;
  /** Whether the button should read as destructive. */
  danger: boolean;
}

/** The transitions this status and this role can actually run right now. */
export function pilihAksi(
  table: readonly AksiDokumen[],
  status: StatusAlur,
  role: RoleName | null
): AksiDokumen[] {
  if (role === null) return [];
  return table.filter((a) => a.dari === status && a.roles.includes(role));
}
