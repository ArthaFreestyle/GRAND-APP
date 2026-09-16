/**
 * Choosing a gudang for a document that moves stock, with the freeze drawn in.
 *
 * `GET /ruang` carries `nomor_opname_beku` on every room, and a room with an open
 * stok opname refuses **every** posting from every module until that count is
 * posted or cancelled. A mutasi or pemakaian typed against such a room saves and
 * then fails at posting, which is the worst place to find out — so a frozen room
 * is drawn, named, and not choosable. Drawn rather than filtered out, because
 * somebody looking for "Gudang utama" needs to see why it is not there.
 *
 * The list is the active unit kerja's rooms (every room, for a global grant),
 * which is exactly the set the server accepts where it checks the grant at all.
 */
import { useEffect, useState } from 'react';

import { RamahSheetOption } from '@/components/shell/ramah';
import { messageOf } from '@/services/api';
import { listRuang, type RuangRow } from '@/services/ruang';

/** How many rooms one read asks for. A guard, not a business limit. */
const RUANG_SIZE = 100;

/** The active rooms, read once per mount and on `reload`. Loading is derived, never stored. */
export function useDaftarRuang() {
  const [ruang, setRuang] = useState<RuangRow[]>([]);
  const [err, setErr] = useState('');
  const [token, setToken] = useState(0);
  const [loadedToken, setLoadedToken] = useState(-1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listRuang({ size: RUANG_SIZE, is_aktif: true });
        if (!alive) return;
        setRuang(answer.data);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setRuang([]);
        setErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      } finally {
        if (alive) setLoadedToken(token);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  return {
    ruang,
    err,
    loading: loadedToken !== token,
    reload: () => setToken((n) => n + 1),
  };
}

/**
 * The rooms as sheet options.
 *
 * `lain` is the other end of a mutasi — a room cannot be both its source and its
 * destination (`mutasi_ruang_check`). `terpilihLuar` covers a document whose room
 * is not in this list at all: a mutasi's destination may sit in another unit
 * kerja, which `GET /ruang` does not return to a scoped grant, and the current
 * choice still has to read as chosen.
 */
export function DaftarRuangPilihan({
  ruang,
  selectedId,
  lain,
  terpilihLuar,
  onPick,
}: {
  ruang: readonly RuangRow[];
  selectedId: number | null;
  lain?: { id: number | null; label: string };
  terpilihLuar?: { id: number; nama: string };
  onPick: (r: RuangRow) => void;
}) {
  // The unit kerja name is noise when every room shares it, and the only way to
  // tell two same-named rooms apart when they do not.
  const multiUnit = new Set(ruang.map((r) => r.idUnitKerja)).size > 1;
  const luar =
    terpilihLuar && terpilihLuar.id === selectedId && !ruang.some((r) => r.id === selectedId)
      ? terpilihLuar
      : null;

  return (
    <>
      {luar ? (
        <RamahSheetOption label={luar.nama} sub="Unit kerja lain" selected onPress={() => {}} />
      ) : null}
      {ruang.map((r) => {
        const beku = r.nomorOpnameBeku !== null;
        const dipakai = lain !== undefined && lain.id === r.id;
        return (
          <RamahSheetOption
            key={r.id}
            label={r.nama}
            sub={
              beku
                ? `Beku · opname ${r.nomorOpnameBeku}`
                : dipakai
                  ? lain.label
                  : multiUnit
                    ? r.namaUnitKerja
                    : undefined
            }
            selected={r.id === selectedId}
            disabled={beku || dipakai}
            onPress={() => onPick(r)}
          />
        );
      })}
    </>
  );
}
