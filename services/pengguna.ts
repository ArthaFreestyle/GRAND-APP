/**
 * The `/api/v1/user` group — issue #42, and the first section in this app
 * where reading is `SUPERADMIN`-only too. See `contracts/openapi.yaml:89`:
 * "`role` dan `user` khusus `SUPERADMIN`, termasuk untuk membaca."
 *
 * ## `grants` replaces the whole set — it is never a diff
 *
 * `PATCH /user/{id}` with `grants` throws away every grant the user held and
 * replaces it with exactly the array sent. Not sending the key leaves grants
 * alone; sending `[]` strips every one of them. So the grant editor
 * (`components/pengguna/grant-editor.tsx`) always holds the *whole* set in its
 * own state and sends it whole — never "revoke the ones removed, add the ones
 * new" as two calls, which would also touch `user_role.created_at` on grants
 * the caller never meant to disturb.
 *
 * ## A grant is `(id_role, id_unit_kerja)`, and `id_unit_kerja: null` means every unit
 *
 * "INVENTARIS di outlet A" and "INVENTARIS di outlet B" are two grants, not a
 * duplicate of one — `GrantRow` below is never deduplicated by role name.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type ListQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiUser = components['schemas']['User'];
type ApiRoleRef = components['schemas']['RoleRef'];
type ApiGrantRequest = components['schemas']['GrantRequest'];

export interface GrantRow {
  /** The `user_role` row's own id — what a grant *is*, not what role it names. */
  idUserRole: number;
  idRole: number;
  /** @example CASHIER — run through `roleLabel()` before showing it. */
  namaRole: string;
  /** The role itself may have been retired after the grant was given. */
  aktifRole: boolean;
  /** `null` means this grant is global — every unit kerja. */
  idUnitKerja: number | null;
  namaUnitKerja: string | null;
  /** `null` exactly when `idUnitKerja` is `null` — a global grant has no unit to retire. */
  aktifUnitKerja: boolean | null;
}

export interface PenggunaRow {
  id: number;
  username: string;
  /** Empty rather than `null` — the wire value is optional, this one is not. */
  email: string;
  namaLengkap: string;
  aktif: boolean;
  /** Always an array, sorted by the server (role name, then unit — global first). Never deduplicated. */
  grants: GrantRow[];
  createdAt: string;
  updatedAt: string;
}

function toGrantRow(r: ApiRoleRef): GrantRow {
  return {
    idUserRole: r.id_user_role ?? 0,
    idRole: r.id ?? 0,
    namaRole: r.nama ?? '',
    aktifRole: r.is_aktif ?? true,
    idUnitKerja: r.id_unit_kerja ?? null,
    namaUnitKerja: r.nama_unit_kerja ?? null,
    aktifUnitKerja: r.id_unit_kerja == null ? null : (r.is_aktif_unit_kerja ?? true),
  };
}

function toRow(u: ApiUser): PenggunaRow {
  return {
    id: u.id ?? 0,
    username: u.username ?? '',
    email: u.email ?? '',
    namaLengkap: u.nama_lengkap ?? '',
    aktif: u.is_aktif ?? true,
    grants: (u.roles ?? []).map(toGrantRow),
    createdAt: u.created_at ?? '',
    updatedAt: u.updated_at ?? u.created_at ?? '',
  };
}

/**
 * The detail's writes, announced back to the list underneath it — the split
 * every ported section makes, so a save on the detail does not echo back to
 * itself as somebody else's change.
 */
export const penggunaBus = createRecordBus<PenggunaRow>();
export const penggunaDetailBus = createRecordBus<PenggunaRow>();

export interface PenggunaQuery extends ListQuery {
  /** Restricts to holders of one role. `EXISTS`, not a join — a multi-role user still appears once. */
  role_id?: number;
}

/** `search` matches part of the username, full name, or email. */
export async function listPengguna(query: PenggunaQuery = {}): Promise<Paged<PenggunaRow>> {
  const page = await authedList<ApiUser>(`/api/v1/user${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

export async function getPengguna(id: number): Promise<PenggunaRow> {
  return toRow(await authedRequest<ApiUser>(`/api/v1/user/${id}`));
}

/** One grant to give, in the shape the create/update body wants. */
export type GrantInput = ApiGrantRequest;

export interface PenggunaBody {
  username?: string;
  /** `null` clears the column; every user in this app leaves it `undefined` to omit rather than sending `null` deliberately, same as `kode` elsewhere. */
  email?: string | null;
  password?: string;
  nama_lengkap?: string | null;
  is_aktif?: boolean;
  /** Omit to leave grants untouched; `[]` strips every grant; a list replaces the whole set. Never send a diff. */
  grants?: GrantInput[];
}

/** `username` and `password` are required; the rest, `grants` included, are optional. A duplicate `username`/`email` answers 409, case-insensitively. */
export async function createPengguna(body: PenggunaBody): Promise<PenggunaRow> {
  return toRow(await authedRequest<ApiUser>('/api/v1/user', { method: 'POST', body }));
}

/** `PATCH`, not `PUT` — there is no `PUT` and no `DELETE` here; retiring is `is_aktif: false`. */
export async function updatePengguna(id: number, body: PenggunaBody): Promise<PenggunaRow> {
  return toRow(await authedRequest<ApiUser>(`/api/v1/user/${id}`, { method: 'PATCH', body }));
}

/**
 * Named on its own so the call site reads as what it is: this is the same
 * `PATCH` as any other identity edit, and it deliberately carries no
 * `password_lama` — the contract's own reason is that the person resetting
 * somebody else's password does not know it. Keep this off the same screen as
 * "Ganti password" in Profil (`POST /auth/me/password`): that one secures the
 * caller's own account and revokes every other session; this one rescues
 * somebody who is locked out and revokes nothing.
 */
export function resetPasswordPengguna(id: number, password: string): Promise<PenggunaRow> {
  return updatePengguna(id, { password });
}

/** There is no `DELETE /user` — archiving is `is_aktif: false`, reversible the same way as `unit-kerja` and `produk`. */
export function setPenggunaAktif(id: number, aktif: boolean): Promise<PenggunaRow> {
  return updatePengguna(id, { is_aktif: aktif });
}
