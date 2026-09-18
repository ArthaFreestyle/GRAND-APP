/**
 * The `/api/v1/role` group — read-only from this app's side.
 *
 * The contract has `POST`/`PATCH /role` too, but issue #42 leaves both
 * unbuilt on purpose: `services/permissions.ts` hangs its whole write model off
 * exactly three names (`RoleName`), and a fourth role created through a screen
 * would produce a user the client authorizes for nothing. Role stays
 * **readable**, to fill the picker `services/pengguna.ts`'s grant editor opens,
 * and nothing here writes one.
 */
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList } from '@/services/client';
import type { components } from '@/types/api';

type ApiRole = components['schemas']['Role'];

export interface RoleRow {
  id: number;
  /** @example CASHIER — the database constant, not a label. Run it through `roleLabel()` before showing it. */
  nama: string;
  aktif: boolean;
}

function toRow(r: ApiRole): RoleRow {
  return {
    id: r.id ?? 0,
    nama: r.nama ?? '',
    aktif: r.is_aktif ?? true,
  };
}

/** `search` matches part of the role name. The grant editor calls this with `is_aktif: true` — an inactive role answers 400 on the write it would feed. */
export async function listRole(query: ListQuery = {}): Promise<Paged<RoleRow>> {
  const page = await authedList<ApiRole>(`/api/v1/role${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}
