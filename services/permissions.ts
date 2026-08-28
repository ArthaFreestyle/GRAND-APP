/**
 * Who is allowed to write what, derived from the session's **active grant**.
 *
 * The contract splits writes by who owns the data rather than by seniority:
 * `INVENTARIS` owns barang, satuan, ruang, ekspedisi, and supplier; `CASHIER`
 * owns pelanggan and posts penjualan; `SUPERADMIN` may do anything. There is no
 * `ADMIN` or `STAFF` anywhere in the contract — the constants this replaces
 * were invented for the mock screens.
 *
 * Only the *entry* permission for each screen lives here. Which buttons a
 * document shows at which status (ajukan / posting / batal are split between
 * `INVENTARIS` and `SUPERADMIN` on purpose, so posting takes a second person)
 * belongs with each screen's own wiring issue.
 */
import { useSession } from '@/services/session';

export type RoleName = 'SUPERADMIN' | 'INVENTARIS' | 'CASHIER';

const ROLE_NAMES: readonly string[] = ['SUPERADMIN', 'INVENTARIS', 'CASHIER'];

/** The areas the app has screens for today. */
export type WriteArea =
  | 'produk'
  | 'satuan'
  | 'pelanggan'
  | 'supplier'
  | 'pembelian'
  | 'penjualan'
  | 'mutasi'
  | 'pemakaian'
  | 'opname'
  | 'ruang'
  | 'unit-kerja';

/**
 * The role that owns each area's writes. `SUPERADMIN` is not listed because it
 * passes everywhere.
 *
 * `unit-kerja` is the one uncertain entry: the contract's role prose names
 * barang, satuan, ruang, ekspedisi, supplier, and pelanggan but never unit
 * kerja, so it is treated as `SUPERADMIN`-only here — the stricter reading.
 * Worth confirming against a live server in #13.
 */
const OWNER: Record<WriteArea, RoleName> = {
  produk: 'INVENTARIS',
  satuan: 'INVENTARIS',
  supplier: 'INVENTARIS',
  ruang: 'INVENTARIS',
  pembelian: 'INVENTARIS',
  mutasi: 'INVENTARIS',
  pemakaian: 'INVENTARIS',
  opname: 'INVENTARIS',
  pelanggan: 'CASHIER',
  penjualan: 'CASHIER',
  'unit-kerja': 'SUPERADMIN',
};

/** Narrows a role name off the wire; anything unrecognized authorizes nothing. */
export function asRoleName(role: string | undefined | null): RoleName | null {
  return role && ROLE_NAMES.includes(role) ? (role as RoleName) : null;
}

export function canWrite(role: RoleName | null, area: WriteArea): boolean {
  if (role === null) return false;
  return role === 'SUPERADMIN' || role === OWNER[area];
}

/** The active grant's role, or `null` when no context has been chosen yet. */
export function useActiveRole(): RoleName | null {
  const session = useSession();
  return asRoleName(session?.active?.role);
}

export function useCanWrite(area: WriteArea): boolean {
  return canWrite(useActiveRole(), area);
}
