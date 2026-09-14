/**
 * Membuat nota pembelian — E1 → E1b → E2 of `Papan Layar.dc.html`, with H1 of
 * `Papan Layar OCR.dc.html` hanging off the first of them.
 *
 * Pick what needs buying, pick who is selling it, and the nota starts existing.
 * The board is explicit about where that moment is: E1b's exit note says "di
 * sini nota mulai ada", and everything after it — units, quantities, prices,
 * the faktur number, freight — is edited on the draft, which is E2.
 *
 * ## Why this replaced a single long form
 *
 * What was here before was a desktop-shaped page: a header card with eleven
 * fields, a line editor under it, a totals panel beside that. It predates the
 * board and it asks for the whole document at once, including the six fields
 * `PATCH /pembelian/{id}` is perfectly happy to take afterwards. On a phone held
 * in a storeroom that is a form somebody abandons. The board's flow asks two
 * questions, each of which fills a screen, and lands on the draft where the rest
 * is optional.
 *
 * ## One route with steps in state, and what that costs
 *
 * Three routes would have needed a draft shared between them, which is the thing
 * `stores/` was deleted for. So this is one route, exactly as
 * `app/produk/baru.tsx` is, and it pays the same price: **the Android back
 * gesture leaves the whole flow rather than stepping back one screen.** Nothing
 * intercepts it and nothing should — `app.json` turns on the predictive back
 * gesture, so Android starts animating the screen away before JS is consulted.
 * The header arrow is what walks back a step; the system gesture means "I am
 * done with this".
 *
 * The one thing that genuinely outlives the flow is the photographs, and they
 * are safe: every page is a `dokumen` row on the server the moment it is taken,
 * so abandoning here loses a selection, never a picture.
 *
 * ## Three reads, and why each is where it is
 *
 * - **`GET /ruang`**, once, at the top. It is both the room the shortfalls are
 *   counted in and the `id_ruang` every line of the nota will land in, so it
 *   cannot live inside the list step.
 * - **`GET /product/{id}`**, one per row as it is ticked. `StokMinimum` carries
 *   no unit at all, and the contract has no read that reports the base unit for
 *   a set of arbitrary product ids — so this is the honest cost of a picker
 *   built on the reorder queue. It is a small request on a deliberate tap, and
 *   it is what makes the stepper able to say "rim" instead of "satuan".
 * - **`GET /product/{id}/riwayat-beli`**, one per selected product, on the way
 *   into the supplier step. It is what ranks the suppliers *and* what fills the
 *   opening prices, so it is read once for both.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FotoNotaStep, type HalamanNota } from '@/components/pembelian/foto-nota';
import { PilihBarangStep, type BarangDipilih } from '@/components/pembelian/pilih-barang';
import { PilihPemasokStep, type PemasokRiwayat } from '@/components/pembelian/pilih-pemasok';
import { RamahColors as C, RamahLayout as L } from '@/constants/theme-ramah';
import { todayISO } from '@/constants/produk';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { messageOf } from '@/services/api';
import { tempelDokumen } from '@/services/dokumen';
import {
  createPembelian,
  pembelianBus,
  type PembelianLineInput,
} from '@/services/pembelian';
import { getProduct, listRiwayatBeli, type StokMinimumRow } from '@/services/produk';
import { listRuang, type RuangRow } from '@/services/ruang';
import type { Supplier } from '@/services/supplier';

type Langkah = 'barang' | 'foto' | 'pemasok';

/**
 * How many suppliers one product's history may report. The endpoint answers one
 * row per supplier, so this is "how many different suppliers have ever sold us
 * this", and a hundred is far past any real shop while still being a bound.
 */
const RIWAYAT_SIZE = 100;

/** One shared empty map, so a render that has no history yet allocates nothing. */
const KOSONG: ReadonlyMap<number, PemasokRiwayat> = new Map();

export default function PembelianBaruScreen() {
  const router = useRouter();

  /**
   * Only the bottom inset here — `_layout.tsx` pays top, left and right outside
   * this screen. `useDockPadding` swaps it for the keyboard's height while the
   * IME is up: under edge-to-edge Android does not resize the window for it,
   * so a docked pill would simply be covered by it otherwise, and the two are
   * alternatives, never a sum.
   */
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const [langkah, setLangkah] = useState<Langkah>('barang');

  // ---- which gudang ----
  const [ruangList, setRuangList] = useState<RuangRow[]>([]);
  const [ruangId, setRuangId] = useState<number | null>(null);
  const [ruangErr, setRuangErr] = useState('');

  // ---- the lines being assembled ----
  const [selection, setSelection] = useState<ReadonlyMap<number, BarangDipilih>>(new Map());

  // ---- the faktur photographs (H1) ----
  const [pages, setPages] = useState<HalamanNota[]>([]);

  // ---- the supplier, and what is known about it ----
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [riwayat, setRiwayat] = useState<ReadonlyMap<number, PemasokRiwayat>>(new Map());
  const [riwayatErr, setRiwayatErr] = useState('');
  /**
   * Derived the same way every other load in this app is: the key the screen
   * wants read, against the key it has read. Writing a boolean at the top of the
   * fetch effect is what `react-hooks/set-state-in-effect` refuses, and it would
   * also let a stale response clear a flag a newer request had just set.
   */
  const [riwayatKey, setRiwayatKey] = useState('');

  const [membuat, setMembuat] = useState(false);
  const [buatErr, setBuatErr] = useState('');

  /**
   * The gudang list, once. `GET /ruang` already answers only the rooms inside
   * the session's active unit kerja, so whatever comes back is exactly the set
   * that may be chosen.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listRuang({ size: 100, is_aktif: true });
        if (!alive) return;
        setRuangList(answer.data);
        const pick = answer.data[0];
        if (pick) {
          setRuangId(pick.id);
          setRuangErr('');
        } else {
          setRuangErr('Tidak ada gudang di unit kerja ini, jadi nota tidak bisa dibuat.');
        }
      } catch (e) {
        if (alive) setRuangErr(messageOf(e, 'Gagal memuat daftar gudang.'));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Which selection the history in hand belongs to, and whether that is still
   * the selection on screen.
   *
   * `riwayat` is deliberately never cleared on the way *in* — not when the
   * selection empties, not when it changes. Clearing it would mean a setState
   * in the effect body, which is the cascading render
   * `react-hooks/set-state-in-effect` refuses, and it would let a response for
   * an old selection blank a map a newer one had just filled. Instead the map is
   * simply not believed until its key matches, and what the supplier step is
   * handed is the empty one until then.
   */
  const wantRiwayat = [...selection.keys()].sort((a, b) => a - b).join(',');
  const riwayatSiap = riwayatKey === wantRiwayat;
  const riwayatLoading = selection.size > 0 && !riwayatSiap;

  /**
   * Every selected product's purchase history, folded into one map per supplier.
   *
   * Read in parallel because they are independent and each is small, and
   * `allSettled` because one product that has never been bought — or one that
   * 404s — must not blank the ranking for the other three. A product with no
   * history simply contributes nothing to anybody's coverage.
   *
   * It runs as soon as the selection changes rather than when the supplier step
   * is opened, so the prices are in hand the moment a supplier is tapped.
   *
   * **It depends on `wantRiwayat`, never on `selection`.** `selection` is a new
   * Map on every keystroke of a quantity stepper, and depending on it would fire
   * one round of history reads per tap on `+`. `wantRiwayat` is the sorted list
   * of ids and changes only when a row is actually ticked or unticked — which is
   * the only thing that changes the answer. Adding a fifth product therefore
   * re-reads all five rather than one, which is the honest price of a request
   * per product against an endpoint that takes one id.
   */
  useEffect(() => {
    // Parsed back out of the dependency rather than taken from `selection`, so
    // this effect genuinely has one input. Empty means nothing is selected and
    // there is nothing to read: the stale map from a previous selection stays in
    // state and is simply not believed, which `riwayatSiap` above decides, so
    // this branch sets nothing at all.
    const ids = wantRiwayat ? wantRiwayat.split(',').map(Number) : [];
    if (ids.length === 0) return;
    let alive = true;
    (async () => {
      const answers = await Promise.allSettled(
        ids.map((id) => listRiwayatBeli(id, { size: RIWAYAT_SIZE }))
      );
      if (!alive) return;

      const merged = new Map<number, { idSupplier: number; namaSupplier: string; perProduk: Map<number, { harga: string; tanggal: string }> }>();
      let gagal = 0;
      answers.forEach((answer, i) => {
        if (answer.status !== 'fulfilled') {
          gagal += 1;
          return;
        }
        for (const row of answer.value.data) {
          const idSupplier = row.id_supplier ?? 0;
          if (!idSupplier) continue;
          const entry = merged.get(idSupplier) ?? {
            idSupplier,
            namaSupplier: row.nama_supplier ?? '',
            perProduk: new Map<number, { harga: string; tanggal: string }>(),
          };
          // `harga_satuan_dasar` and not `harga_satuan_input`: the contract says
          // outright that the input price is not comparable because its unit
          // follows whatever was typed, while this one is per base unit — which
          // is also the unit every line of this nota is counted in.
          entry.perProduk.set(ids[i], {
            harga: row.harga_satuan_dasar ?? '0',
            tanggal: row.tanggal ?? '',
          });
          merged.set(idSupplier, entry);
        }
      });

      setRiwayat(merged);
      setRiwayatErr(
        gagal === 0
          ? ''
          : `Riwayat harga ${gagal} barang tidak terbaca, jadi urutan pemasok dan harga awalnya belum lengkap.`
      );
      setRiwayatKey(wantRiwayat);
    })();
    return () => {
      alive = false;
    };
  }, [wantRiwayat]);

  /**
   * Ticking a row seeds it with the shortfall and then goes and finds out what
   * unit that shortfall is counted in.
   *
   * The line is usable before the unit arrives — the quantity is already right,
   * because `selisih` is in base units whatever they are called — so the stepper
   * says "satuan dasar" for the moment it takes and the row never blocks. What
   * *is* blocked is creating the nota with a line whose `id_satuan_input` never
   * resolved; see `buat()`.
   */
  const toggle = useCallback(async (row: StokMinimumRow) => {
    let sudahAda = false;
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(row.id)) {
        sudahAda = true;
        next.delete(row.id);
      } else {
        next.set(row.id, {
          id: row.id,
          nama: row.nama,
          // The shortfall, not a reorder suggestion — no endpoint carries one,
          // and the board says so in as many words. At least one, because a
          // product that is exactly at its minimum has a shortfall of zero and
          // is still on this list.
          qty: Math.max(1, row.selisih),
          idSatuanDasar: 0,
          namaSatuanDasar: '',
        });
      }
      return next;
    });
    if (sudahAda) return;

    try {
      const detail = await getProduct(row.id);
      setSelection((current) => {
        // The row may have been unticked while this was in flight; patching it
        // back in would resurrect a line somebody removed.
        const existing = current.get(row.id);
        if (!existing) return current;
        const next = new Map(current);
        next.set(row.id, {
          ...existing,
          idSatuanDasar: detail.idDasar,
          namaSatuanDasar: detail.namaSatuanDasar,
        });
        return next;
      });
    } catch {
      // Left unresolved on purpose. The failure is reported once, at the moment
      // it actually stops something — on the create button — rather than as an
      // error beside a row that still looks and behaves correctly.
    }
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setSelection((current) => {
      const existing = current.get(id);
      if (!existing) return current;
      const next = new Map(current);
      next.set(id, { ...existing, qty });
      return next;
    });
  }, []);

  /**
   * Leaves the whole flow. `dismiss()` targets this section's own Stack;
   * `back()` is offered to the navigator holding the tabs first, which may
   * answer by switching tabs instead of popping this screen. The `replace`
   * covers a cold deep link with nothing underneath to pop.
   */
  const keluar = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pembelian');
  }, [router]);

  /**
   * The one write in this flow, and it is two writes that must not be confused
   * with each other.
   *
   * `POST /pembelian` creates the document **and** its lines in one body and
   * always lands in `DRAFT` — `status` is not a field and nothing here moves
   * stock. Sticking the photographs to it afterwards is a second, weaker thing:
   * the nota is already real by then, so a `tempel` that fails is **reported on
   * the draft, never rolled back**. Deleting a nota because a photograph would
   * not attach would throw away the part that matters to keep the part that
   * does not. This mirrors how `app/produk/baru.tsx` treats a price that fails
   * after the product exists.
   */
  const buat = useCallback(async () => {
    if (membuat) return;
    if (!supplier || ruangId === null) return;

    const lines = [...selection.values()];
    const belumAdaSatuan = lines.filter((b) => b.idSatuanDasar === 0);
    if (belumAdaSatuan.length) {
      // `id_satuan_input` has no foreign key behind it and an unregistered one
      // answers 400 for the whole document, so a line with an unresolved base
      // unit would take the other five down with it.
      setBuatErr(
        `Satuan dasar ${belumAdaSatuan.map((b) => b.nama).join(', ')} belum terbaca. Lepas centangnya lalu centang lagi.`
      );
      return;
    }

    const detail: PembelianLineInput[] = lines.map((b) => {
      const harga = riwayat.get(supplier.id)?.perProduk.get(b.id)?.harga;
      return {
        id_product: b.id,
        id_satuan_input: b.idSatuanDasar,
        qty_faktur: String(b.qty),
        // The last price paid to *this* supplier for this product, per base
        // unit. Zero when there is none — a first purchase, or a history that
        // would not load — which is a price the draft asks to be corrected
        // rather than a guess presented as a fact.
        harga_satuan_input: harga ?? '0',
      };
    });

    setMembuat(true);
    setBuatErr('');
    try {
      const created = await createPembelian({
        // The server generates the number from this date (reset monthly), so a
        // faktur dated last month still has to be redated on the draft — which
        // is what `PATCH /pembelian/{id}` accepts `tanggal` for.
        tanggal: todayISO(),
        id_supplier: supplier.id,
        id_ruang: ruangId,
        detail,
      });

      const gagalLampiran = await tempelSemua(pages, created.id);

      // A new document has no row for the list to patch and lands wherever its
      // date puts it, so the list re-reads while the reader moves to the nota.
      pembelianBus.publish({ kind: 'reload' });
      router.replace({
        pathname: '/pembelian/[id]',
        params: {
          id: created.id,
          baru: '1',
          ...(gagalLampiran ? { lampiranGagal: String(gagalLampiran) } : null),
        },
      });
    } catch (e) {
      setBuatErr(messageOf(e, 'Gagal membuat nota pembelian.'));
      setMembuat(false);
    }
  }, [membuat, supplier, ruangId, selection, riwayat, pages, router]);

  const commonDock = dockPad;

  return (
    <View style={{ flex: 1, backgroundColor: C.surfaceSunken }}>
      {langkah === 'barang' ? (
        <PilihBarangStep
          ruangList={ruangList}
          ruangId={ruangId}
          onPickRuang={setRuangId}
          ruangErr={ruangErr}
          selection={selection}
          onToggle={toggle}
          onQty={setQty}
          jumlahHalaman={pages.length}
          onFoto={() => setLangkah('foto')}
          onBack={keluar}
          onLanjut={() => setLangkah('pemasok')}
          dockPad={commonDock}
        />
      ) : null}

      {langkah === 'foto' ? (
        <FotoNotaStep
          pages={pages}
          onChange={setPages}
          onBack={() => setLangkah('barang')}
          onLanjut={() => setLangkah('barang')}
          dockPad={commonDock}
        />
      ) : null}

      {langkah === 'pemasok' ? (
        <PilihPemasokStep
          jumlahBarang={selection.size}
          riwayat={riwayatSiap ? riwayat : KOSONG}
          riwayatLoading={riwayatLoading}
          riwayatErr={riwayatSiap ? riwayatErr : ''}
          picked={supplier}
          onPick={setSupplier}
          onBack={() => setLangkah('barang')}
          onBuat={buat}
          membuat={membuat}
          buatErr={buatErr}
          dockPad={commonDock}
        />
      ) : null}
    </View>
  );
}

/**
 * Sticks every photograph to the nota that now exists, and answers how many
 * would not go.
 *
 * Sequential, because `POST /dokumen/{id}/tempel` refuses the eleventh
 * attachment with a 409 and the server counts them as they land — firing ten at
 * once would make which ones stuck a race. One failure does not stop the rest:
 * nine pages attached is nine pages a supervisor can open.
 */
async function tempelSemua(pages: readonly HalamanNota[], idPembelian: number): Promise<number> {
  let gagal = 0;
  for (const page of pages) {
    try {
      await tempelDokumen(page.id, 'pembelian', idPembelian);
    } catch {
      gagal += 1;
    }
  }
  return gagal;
}
