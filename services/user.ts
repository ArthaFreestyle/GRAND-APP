/**
 * The `/api/v1/user` group, read-only and for one caller.
 *
 * The contract makes `role` and `user` **`SUPERADMIN`-only, reading included** —
 * a list of every account and its grants is not something the gudang or the till
 * needs to see. The one screen that wants it is a pemakaian request made on
 * somebody else's behalf, where `id_pemohon` has to be a real user id; for every
 * other grant that screen requests as the signed-in user and never calls this.
 *
 * Nothing here writes. Managing accounts has no screen in this app.
 */
import { buildQuery } from '@/services/api';
import { authedList } from '@/services/client';
import type { components } from '@/types/api';

type ApiUser = components['schemas']['User'];

export interface UserRow {
  id: number;
  username: string;
  /** Falls back to the username: `nama_lengkap` is optional on an account. */
  nama: string;
}

function toRow(u: ApiUser): UserRow {
  const username = u.username ?? '';
  return { id: u.id ?? 0, username, nama: u.nama_lengkap || username };
}

/** Active accounts matching part of the username, full name or email. `SUPERADMIN` only. */
export async function cariUser(search: string, size = 8): Promise<UserRow[]> {
  const page = await authedList<ApiUser>(
    `/api/v1/user${buildQuery({ search: search || undefined, size, is_aktif: true })}`
  );
  return page.data.map(toRow);
}

/** How the signed-in user reads as a requester, from the session's own copy. */
export function namaUser(u: ApiUser | null | undefined): string {
  if (!u) return '';
  return u.nama_lengkap || u.username || '';
}
