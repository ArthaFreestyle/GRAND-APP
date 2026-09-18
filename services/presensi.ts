/**
 * Presensi — two shifts, one tombol each, replacing #41's guesses at the shape
 * once `contracts/openapi.yaml` actually carried a `presensi` group (issue #45,
 * §0 of the issue). The reason a whole module reduces to one button per shift
 * is the same as #41's: the app is only reachable from the office network, so
 * the network *is* the proof of attendance, and anything else the client could
 * check — GPS, geofence, a selfie, a QR — would be a second, forgeable source
 * of truth sitting next to the gate that actually enforces it.
 *
 * ## Three shapes worth knowing before touching this file
 *
 * **The shift is never the client's to decide.** `POST /presensi/masuk` infers
 * it from the server's own clock (the 17:30 WIB cutover), never from
 * `new Date()` on the phone — a handset a few minutes off around that boundary
 * is enough to file someone into the wrong shift. `presensiMasuk()` and
 * `presensiPulang()` therefore take **no body at all**, on purpose.
 *
 * **A shift with no row is `BELUM_MASUK`, not absent.** `PresensiHariIni`
 * always carries both `pagi` and `malam`, the same synthetic-row shape
 * `services/periode.ts` uses for a month that was never closed.
 *
 * **This is not a document.** There is no `AKSI` table here and
 * `components/shell/aksi-dialog.tsx` is not used — presensi has no
 * ajukan/posting/tolak flow, every role clocks itself in, and the one
 * `WriteArea` entry this module adds gates the SUPERADMIN correction and
 * recap screens, never the tombol.
 */
import { createRecordBus } from '@/hooks/use-record-bus';
import { buildQuery, type Paged } from '@/services/api';
import { authedList, authedRequest } from '@/services/client';
import type { components } from '@/types/api';

type ApiPresensi = components['schemas']['Presensi'];
type ApiShiftHariIni = components['schemas']['PresensiShiftHariIni'];
type ApiHariIni = components['schemas']['PresensiHariIni'];
type ApiRekap = components['schemas']['RekapPresensi'];

export type Shift = 'PAGI' | 'MALAM';
/** The four states a shift can be in. Only `BELUM_MASUK` is synthetic — a real row never carries it. */
export type StatusPresensi = 'BELUM_MASUK' | 'BUKA' | 'SELESAI' | 'LUPA_PULANG';
export type SumberPresensi = 'TOMBOL' | 'KOREKSI';

export const SHIFT_LABEL: Record<Shift, string> = { PAGI: 'Pagi', MALAM: 'Malam' };

/**
 * The status map, in one place, kept flat enough to pass straight into
 * `RamahBadge`'s `tone` prop without this file importing a component type —
 * the same reason `DOKUMEN_RAMAH` shares its labels with `DOKUMEN_META`
 * instead of letting two copies drift apart. Every tone here is one `RamahBadge`
 * tints rather than fills: presensi never moves stock or money the way a
 * document does, so none of it earns the two filled tones. `LUPA_PULANG` reads
 * as a warning rather than red — red in this system means "wajib dan salah",
 * and forgetting to press a button is not a validation error.
 */
export const PRESENSI_STATUS: Record<StatusPresensi, { label: string; tone: 'neutral' | 'info' | 'warn' }> = {
  BELUM_MASUK: { label: 'Belum masuk', tone: 'neutral' },
  BUKA: { label: 'Berjalan', tone: 'info' },
  SELESAI: { label: 'Selesai', tone: 'neutral' },
  LUPA_PULANG: { label: 'Lupa pulang', tone: 'warn' },
};

/** One shift, as a row of history or of the team list. */
export interface PresensiRow {
  id: number;
  idUser: number;
  namaUser: string;
  tanggal: string;
  shift: Shift;
  status: 'BUKA' | 'SELESAI' | 'LUPA_PULANG';
  jamMasuk: string;
  jamPulang: string | null;
  /** `null`, never `0`, while the shift is not yet `SELESAI`. */
  durasiMenit: number | null;
  idUnitKerja: number | null;
  namaUnitKerja: string | null;
  sumberMasuk: SumberPresensi;
  sumberPulang: SumberPresensi | null;
  /** Apa adanya from the server, and no claim of proof — see the type's own note below. */
  ipMasuk: string | null;
  ipPulang: string | null;
  dikoreksiOleh: number | null;
  tsKoreksi: string | null;
  alasanKoreksi: string | null;
}

/** One of today's two shifts, straight off `GET /presensi/saya/hari-ini`. */
export interface ShiftHariIni {
  shift: Shift;
  status: StatusPresensi;
  id: number | null;
  jamMasuk: string | null;
  jamPulang: string | null;
  durasiMenit: number | null;
}

export interface PresensiHariIni {
  tanggal: string;
  /** The server's own conclusion from its clock — what decides which tombol is drawn. */
  shiftSekarang: Shift;
  pagi: ShiftHariIni;
  malam: ShiftHariIni;
}

/** One employee, one month — `GET /presensi/rekap`. Reports; never decides who gets paid for what. */
export interface RekapPresensiRow {
  idUser: number;
  namaUser: string;
  tahun: number;
  bulan: number;
  hariPagiSelesai: number;
  hariMalamSelesai: number;
  /** A day whose `PAGI` **and** `MALAM` are both `SELESAI` — its own count, not `hariPagiSelesai + hariMalamSelesai`. */
  hariDuaShift: number;
  hariLupaPulangPagi: number;
  hariLupaPulangMalam: number;
  totalMenitKerjaPagi: number;
  totalMenitKerjaMalam: number;
}

/**
 * Presensi writes, announced to whichever screens are mounted: the tombol at
 * Beranda republishes so a history list underneath keeps in step, and a
 * SUPERADMIN correction patches the one row its list is showing.
 */
export const presensiBus = createRecordBus<PresensiRow>();

function toRow(p: ApiPresensi): PresensiRow {
  return {
    id: p.id ?? 0,
    idUser: p.id_user ?? 0,
    namaUser: p.nama_user ?? '',
    tanggal: p.tanggal ?? '',
    shift: p.shift ?? 'PAGI',
    status: p.status ?? 'BUKA',
    jamMasuk: p.jam_masuk ?? '',
    jamPulang: p.jam_pulang ?? null,
    durasiMenit: p.durasi_kerja_menit ?? null,
    idUnitKerja: p.id_unit_kerja ?? null,
    namaUnitKerja: p.nama_unit_kerja ?? null,
    sumberMasuk: p.sumber_masuk ?? 'TOMBOL',
    sumberPulang: p.sumber_pulang ?? null,
    ipMasuk: p.ip_masuk ?? null,
    ipPulang: p.ip_pulang ?? null,
    dikoreksiOleh: p.dikoreksi_oleh ?? null,
    tsKoreksi: p.ts_koreksi ?? null,
    alasanKoreksi: p.alasan_koreksi ?? null,
  };
}

function toShift(s: ApiShiftHariIni | undefined, fallback: Shift): ShiftHariIni {
  return {
    shift: s?.shift ?? fallback,
    status: s?.status ?? 'BELUM_MASUK',
    id: s?.id ?? null,
    jamMasuk: s?.jam_masuk ?? null,
    jamPulang: s?.jam_pulang ?? null,
    durasiMenit: s?.durasi_kerja_menit ?? null,
  };
}

function toHariIni(h: ApiHariIni): PresensiHariIni {
  return {
    tanggal: h.tanggal ?? '',
    shiftSekarang: h.shift_sekarang ?? 'PAGI',
    pagi: toShift(h.pagi, 'PAGI'),
    malam: toShift(h.malam, 'MALAM'),
  };
}

function toRekap(r: ApiRekap): RekapPresensiRow {
  return {
    idUser: r.id_user ?? 0,
    namaUser: r.nama_user ?? '',
    tahun: r.tahun ?? 0,
    bulan: r.bulan ?? 0,
    hariPagiSelesai: r.hari_pagi_selesai ?? 0,
    hariMalamSelesai: r.hari_malam_selesai ?? 0,
    hariDuaShift: r.hari_dua_shift ?? 0,
    hariLupaPulangPagi: r.hari_lupa_pulang_pagi ?? 0,
    hariLupaPulangMalam: r.hari_lupa_pulang_malam ?? 0,
    totalMenitKerjaPagi: r.total_menit_kerja_pagi ?? 0,
    totalMenitKerjaMalam: r.total_menit_kerja_malam ?? 0,
  };
}

/** What the Beranda card draws. Read on launch and on pull-to-refresh — never polled. */
export function getPresensiHariIni(): Promise<PresensiHariIni> {
  return authedRequest<ApiHariIni>('/api/v1/presensi/saya/hari-ini').then(toHariIni);
}

/**
 * Tombol masuk. No body: `id_user` comes off the token and the shift off the
 * server's clock, both on purpose — see the file header. A 409 means a
 * duplicate tap or a genuinely open shift elsewhere; the caller reads it back
 * off `getPresensiHariIni()` rather than showing the raw message, because the
 * honest fix is redrawing the state that is actually true now.
 */
export function presensiMasuk(): Promise<PresensiRow> {
  return authedRequest<ApiPresensi>('/api/v1/presensi/masuk', { method: 'POST' }).then(toRow);
}

/** Tombol pulang. No body: it closes whichever single row is `BUKA`, whatever day it was opened on. */
export function presensiPulang(): Promise<PresensiRow> {
  return authedRequest<ApiPresensi>('/api/v1/presensi/pulang', { method: 'POST' }).then(toRow);
}

export interface ListPresensiQuery {
  page?: number;
  size?: number;
  tanggal_dari?: string;
  tanggal_sampai?: string;
  shift?: Shift;
  status?: 'BUKA' | 'SELESAI' | 'LUPA_PULANG';
}

/** Riwayat sendiri — never filtered by unit kerja, the one list in this app that is not. */
export async function listPresensiSaya(query: ListPresensiQuery = {}): Promise<Paged<PresensiRow>> {
  const page = await authedList<ApiPresensi>(`/api/v1/presensi/saya${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

/** `GET /presensi` — **SUPERADMIN**, and the only one of the two lists that takes `id_user`. */
export async function listPresensi(
  query: ListPresensiQuery & { id_user?: number } = {}
): Promise<Paged<PresensiRow>> {
  const page = await authedList<ApiPresensi>(`/api/v1/presensi${buildQuery({ ...query })}`);
  return { data: page.data.map(toRow), paging: page.paging };
}

export function getPresensi(id: number): Promise<PresensiRow> {
  return authedRequest<ApiPresensi>(`/api/v1/presensi/${id}`).then(toRow);
}

/** `GET /presensi/rekap` — **SUPERADMIN**. `tahun`/`bulan` are required by the contract; there is no default month. */
export async function rekapPresensi(query: {
  tahun: number;
  bulan: number;
  page?: number;
  size?: number;
}): Promise<Paged<RekapPresensiRow>> {
  const page = await authedList<ApiRekap>(`/api/v1/presensi/rekap${buildQuery({ ...query })}`);
  return { data: page.data.map(toRekap), paging: page.paging };
}

export interface KoreksiPresensiBody {
  /** Wall-clock WIB `HH:MM`, stamped onto this row's own `tanggal` — a correction cannot cross a day. */
  jam_masuk?: string;
  /** Same shape. Never send an empty value to clear it — the contract rejects reopening a `SELESAI` shift with 400. */
  jam_pulang?: string;
  shift?: Shift;
  /** Required by the contract and never blank — the one note for why someone's hours changed. */
  alasan_koreksi: string;
}

/** `PATCH /presensi/{id}` — **SUPERADMIN**. `status` is never sent; the server recomputes it from the columns. */
export function koreksiPresensi(id: number, body: KoreksiPresensiBody): Promise<PresensiRow> {
  return authedRequest<ApiPresensi>(`/api/v1/presensi/${id}`, { method: 'PATCH', body }).then(toRow);
}

/** "3j 20m", or "45m" under an hour. `0` renders as `0m` rather than an empty string. */
export function formatDurasi(menit: number | null): string {
  if (menit === null) return '—';
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return jam > 0 ? `${jam}j ${sisa}m` : `${sisa}m`;
}

/** `HH:MM`, off a `date-time` value — reused by the card, the history row, and the detail. */
export function formatJam(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
