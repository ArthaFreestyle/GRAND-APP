/**
 * The nota's lines, and the editor that types them.
 *
 * Two routes need this: `penjualan/baru` types the first set, and
 * `penjualan/[id]` retypes them while the nota is still `DRAFT`. Those are the
 * same thing rather than a form and a detail, because `PUT
 * /penjualan/{id}/detail` replaces **every** line at once — editing a saved nota
 * means holding the whole set in a draft again.
 *
 * ### `id_harga_jual` is a version, not a number
 *
 * This is the field the screen this replaces could not carry, and the reason
 * issue #9 exists. A draft used to hold `harga: number` and nothing else, so the
 * moment a price was typed there was no way left to say *where it came from* —
 * a negotiated discount off the current list and a price left over from last
 * quarter's list looked identical afterwards.
 *
 * `penjualan_detail.id_harga_jual` references one row of `product_harga_jual`:
 * the version in force for that product, that unit, on the **nota's own date**.
 * `GET /product/{id}/harga-jual?tanggal=` resolves it — one row per unit — and
 * that answer is cached on the line, so switching between a product's units
 * costs no further request.
 *
 * It stays attached when the amount is edited afterwards, and that is
 * deliberate: the contract calls the price "usulan, bukan keharusan" and says
 * outright that `harga_satuan_input` is never forced to equal the list, because
 * haggling happens and what is written on the nota is what is charged. The
 * version still records which list the haggling started from. What the editor
 * does instead of detaching is *say so* — the list price is printed beside the
 * field whenever the typed figure differs.
 *
 * It is dropped in exactly one case: the nota's date moved after the line was
 * priced. The server validates the version against the document date and would
 * answer 400, so `linesToInput` sends `null` rather than an id it knows is
 * stale, and the editor offers one button to re-resolve every line against the
 * new date and get the link back.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SearchPicker, type PickerOption } from '@/components/shell/search-picker';
import {
  Card,
  CardHead,
  EmptyState,
  Field,
  GhostButton,
  OptionPicker,
  SecondaryButton,
  TextField,
  TinyButton,
} from '@/components/shell/ui';
import { Colors as C, num, rp } from '@/constants/theme-erp';
import { decimalToNumber, numericToDecimal, rupiahToDecimal } from '@/services/decimal';
import type { PenjualanLine, PenjualanLineInput } from '@/services/penjualan';
import { getProduct, listHargaJualBerlaku, listProducts, listStok } from '@/services/produk';

const CARI_SIZE = 8;

export interface SatuanOption {
  id: number;
  nama: string;
  faktor: number;
}

/** One unit's price version, as `GET /product/{id}/harga-jual` reports it. */
export interface HargaVersi {
  idHargaJual: number;
  idSatuan: number;
  /** Decimal string, per that unit — not per base unit. */
  harga: string;
}

export interface LineDraft {
  /**
   * Identity for React only. The server's row id cannot serve: a fresh line has
   * none, and `PUT .../detail` replaces the whole set anyway, so the ids that
   * come back are not the ones that went out.
   */
  key: string;
  idProduct: number | null;
  kode: string;
  nama: string;
  /**
   * `null` when the line came back from the server and its alternatives have
   * not been fetched. The unit is on the line already; the *other* units the
   * product accepts cost a `GET /product/{id}`, and doing that for every line on
   * open would be one request per row for a choice most lines never change.
   */
  satuan: SatuanOption[] | null;
  idSatuanInput: number | null;
  namaSatuan: string;
  qty: string;
  harga: string;
  diskon: string;
  /** The price list version `harga` was seeded from, or `null` when typed by hand. */
  idHargaJual: number | null;
  /**
   * The date the versions were resolved against. Compared with the nota's own
   * date at save time: a version resolved for another date is not one the server
   * will accept, so it is dropped rather than refused.
   */
  hargaTanggal: string;
  /** Every unit's version for `hargaTanggal`; `null` until a lookup has run. */
  hargaList: HargaVersi[] | null;
  /** The list price for the chosen unit, so an edited figure can be compared. */
  hargaDaftar: string;
  /** Base-unit balance in the nota's ruang, or `null` when unknown. A reading, not a guarantee. */
  stokRuang: number | null;
  namaSatuanDasar: string;
}

let seq = 0;
function nextKey() {
  seq += 1;
  return `p${seq}`;
}

export function emptyLine(): LineDraft {
  return {
    key: nextKey(),
    idProduct: null,
    kode: '',
    nama: '',
    satuan: null,
    idSatuanInput: null,
    namaSatuan: '',
    qty: '',
    harga: '',
    diskon: '',
    idHargaJual: null,
    hargaTanggal: '',
    hargaList: null,
    hargaDaftar: '',
    stokRuang: null,
    namaSatuanDasar: '',
  };
}

/**
 * Seeds the editor from a saved nota, so reopening a draft shows what is stored.
 *
 * `hargaTanggal` is the document's own date rather than today: the stored
 * `id_harga_jual` was accepted against that date, so an edit that does not move
 * the date keeps the version instead of quietly dropping it.
 */
export function draftOfLine(line: PenjualanLine, tanggalNota: string): LineDraft {
  return {
    key: nextKey(),
    idProduct: line.idProduct,
    kode: line.kode,
    nama: line.nama,
    satuan: null,
    idSatuanInput: line.idSatuanInput,
    namaSatuan: line.namaSatuan,
    qty: trimDecimal(line.qtyInput),
    harga: String(Math.round(decimalToNumber(line.hargaSatuanInput))),
    diskon: decimalToNumber(line.diskonBaris)
      ? String(Math.round(decimalToNumber(line.diskonBaris)))
      : '',
    idHargaJual: line.idHargaJual,
    hargaTanggal: tanggalNota,
    hargaList: null,
    hargaDaftar: '',
    stokRuang: null,
    namaSatuanDasar: line.namaSatuanDasar,
  };
}

/** `"100.0000"` reads as `100` in a field somebody is about to retype. */
function trimDecimal(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

/** What one line is worth before the nota-level discount and rounding. */
export function lineSubtotal(line: LineDraft): number {
  const qty = Number(numericToDecimal(line.qty) ?? '0');
  const harga = decimalToNumber(rupiahToDecimal(line.harga || '0'));
  const diskon = decimalToNumber(rupiahToDecimal(line.diskon || '0'));
  return Math.max(0, qty * harga - diskon);
}

export function linesSubtotal(lines: LineDraft[]): number {
  return lines.reduce((sum, l) => sum + lineSubtotal(l), 0);
}

/** True while any priced line was resolved against a date the nota no longer has. */
function hargaKedaluwarsa(lines: LineDraft[], tanggal: string): boolean {
  return lines.some((l) => l.idHargaJual !== null && l.hargaTanggal !== tanggal);
}

export type LinesResult =
  | { ok: true; detail: PenjualanLineInput[] }
  | { ok: false; error: string };

/**
 * Validates the draft and builds the body.
 *
 * Everything checked here is something the server checks too — this is not a
 * second source of truth, it is the difference between a form that says which
 * line is wrong and a 400 that scrolls past. The rule worth spelling out is
 * `qty x faktor` having to be a whole number: `qty_dasar` is a `BIGINT`, so half
 * a carton of twelve is 6 and half a carton of five is not expressible.
 *
 * `tanggal` is here for one reason: `id_harga_jual` is validated against the
 * document's date, so a version resolved for another one is sent as `null`. The
 * typed price is kept either way — it is the snapshot that gets billed, and it
 * was never required to match the list.
 */
export function linesToInput(lines: LineDraft[], tanggal: string): LinesResult {
  if (lines.length === 0) return { ok: false, error: 'Tambahkan minimal satu baris.' };

  const detail: PenjualanLineInput[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const no = `Baris ${i + 1}`;
    if (line.idProduct === null) return { ok: false, error: `${no}: pilih produknya dulu.` };
    if (line.idSatuanInput === null) return { ok: false, error: `${no}: pilih satuannya dulu.` };

    const qty = numericToDecimal(line.qty);
    if (qty === null || Number(qty) <= 0) {
      return { ok: false, error: `${no}: qty harus lebih dari nol.` };
    }
    const faktor = line.satuan?.find((s) => s.id === line.idSatuanInput)?.faktor ?? null;
    if (faktor !== null && !Number.isInteger(Number(qty) * faktor)) {
      return {
        ok: false,
        error: `${no}: qty x faktor konversi (${faktor}) harus bilangan bulat.`,
      };
    }

    const harga = numericToDecimal(line.harga);
    if (harga === null || Number(harga) < 0) {
      return { ok: false, error: `${no}: harga jual belum diisi.` };
    }

    detail.push({
      id_product: line.idProduct,
      id_satuan_input: line.idSatuanInput,
      qty_input: qty,
      id_harga_jual: line.hargaTanggal === tanggal ? line.idHargaJual : null,
      harga_satuan_input: rupiahToDecimal(line.harga || '0'),
      diskon_baris: rupiahToDecimal(line.diskon || '0'),
    });
  }
  return { ok: true, detail };
}

// ---- the editor ----

/**
 * An updater, not a value — pass the `useState` setter straight in.
 *
 * Choosing a product writes to its line more than once: the product and its
 * units first, then the price version, then the room balance. Handed a plain
 * `next` array, the later writes would be built from the array as it stood
 * before the first, and the product just chosen would vanish.
 */
export type LinesUpdater = (updater: (prev: LineDraft[]) => LineDraft[]) => void;

/**
 * Resolves one line's price versions for a date and applies the one matching its
 * unit. Shared by the product picker, the unit picker's lazy load, and the
 * "segarkan" button, so all three attach the version the same way.
 */
async function resolveHarga(
  idProduct: number,
  idSatuan: number | null,
  tanggal: string
): Promise<Pick<LineDraft, 'hargaList' | 'hargaTanggal' | 'idHargaJual' | 'hargaDaftar'>> {
  const rows = await listHargaJualBerlaku(idProduct, tanggal);
  const hargaList: HargaVersi[] = rows
    .filter((r) => r.id_harga_jual !== undefined && r.id_satuan !== undefined)
    .map((r) => ({
      idHargaJual: r.id_harga_jual as number,
      idSatuan: r.id_satuan as number,
      harga: r.harga ?? '0.00',
    }));
  const found = hargaList.find((h) => h.idSatuan === idSatuan) ?? null;
  return {
    hargaList,
    hargaTanggal: tanggal,
    // An empty answer is a real answer: a product with no version in force on
    // this date may still be sold, at a price typed by hand.
    idHargaJual: found ? found.idHargaJual : null,
    hargaDaftar: found ? found.harga : '',
  };
}

export function PenjualanLineEditor({
  lines,
  onChange,
  tanggal,
  idRuang,
  editable,
}: {
  lines: LineDraft[];
  onChange: LinesUpdater;
  /** The nota's date: it decides which price version is in force. */
  tanggal: string;
  /** The nota's ruang, whose balance is what posting will measure the lines against. */
  idRuang: number | null;
  editable: boolean;
}) {
  const [segarBusy, setSegarBusy] = useState(false);

  const patch = useCallback(
    (key: string, next: Partial<LineDraft>) => {
      onChange((prev) => prev.map((l) => (l.key === key ? { ...l, ...next } : l)));
    },
    [onChange]
  );

  const remove = useCallback(
    (key: string) => onChange((prev) => prev.filter((l) => l.key !== key)),
    [onChange]
  );

  /**
   * Re-resolves every priced line against the nota's current date.
   *
   * Offered rather than done automatically: re-pricing is a change to what the
   * customer is charged, and doing it silently while somebody edits the date
   * field character by character would rewrite typed figures under them. The
   * list price is applied only where nothing was typed over it.
   */
  const segarkan = useCallback(async () => {
    if (segarBusy) return;
    setSegarBusy(true);
    const jobs = lines
      .filter((l) => l.idProduct !== null && l.hargaTanggal !== tanggal)
      .map(async (l) => {
        try {
          const next = await resolveHarga(l.idProduct as number, l.idSatuanInput, tanggal);
          const dipakaiApaAdanya =
            l.hargaDaftar !== '' &&
            Math.round(decimalToNumber(l.hargaDaftar)) === Math.round(Number(l.harga || '0'));
          patch(l.key, {
            ...next,
            harga:
              // Only a figure still equal to the old list price follows the new
              // one. A negotiated amount is the operator's, not the list's.
              dipakaiApaAdanya && next.hargaDaftar !== ''
                ? String(Math.round(decimalToNumber(next.hargaDaftar)))
                : l.harga,
          });
        } catch {
          // Leaving the line as it was keeps the typed price on screen, and the
          // banner stays up to say the version is still not attached.
        }
      });
    await Promise.all(jobs);
    setSegarBusy(false);
  }, [lines, tanggal, patch, segarBusy]);

  const perluSegar = hargaKedaluwarsa(lines, tanggal);

  return (
    <Card>
      <CardHead
        title="Baris nota"
        right={
          <Text style={styles.headRight}>
            {lines.length} baris · subtotal {rp(linesSubtotal(lines))}
          </Text>
        }
      />

      {perluSegar && editable && (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            Tanggal nota berubah. Versi harga jual yang menempel di baris di bawah diambil untuk
            tanggal lain, jadi kalau disimpan sekarang baris itu tersimpan tanpa rujukan versi —
            harganya tetap yang tertulis. Segarkan untuk mengambil versi yang berlaku pada{' '}
            {tanggal}.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <SecondaryButton
              label={segarBusy ? 'Menyegarkan…' : 'Segarkan harga daftar'}
              onPress={segarkan}
            />
          </View>
        </View>
      )}

      {lines.map((line, i) => (
        <LineRow
          key={line.key}
          index={i}
          line={line}
          tanggal={tanggal}
          idRuang={idRuang}
          editable={editable}
          onPatch={patch}
          onRemove={remove}
        />
      ))}
      {lines.length === 0 && (
        <EmptyState
          title="Belum ada baris"
          sub="Satu baris per produk yang dijual. Nota tanpa baris boleh disimpan sebagai draft, tapi tidak bisa diposting."
        />
      )}
      {editable && (
        <View style={styles.addBar}>
          <SecondaryButton
            label="+ Tambah baris"
            onPress={() => onChange((prev) => [...prev, emptyLine()])}
          />
        </View>
      )}
    </Card>
  );
}

function LineRow({
  index,
  line,
  tanggal,
  idRuang,
  editable,
  onPatch,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  tanggal: string;
  idRuang: number | null;
  editable: boolean;
  onPatch: (key: string, next: Partial<LineDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const [loadingSatuan, setLoadingSatuan] = useState(false);

  const cariProduk = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listProducts({ search: term || undefined, size: CARI_SIZE, is_aktif: true });
    return page.data.map((p) => ({ value: String(p.id), label: p.nama, sub: p.kode }));
  }, []);

  /**
   * Choosing a product costs three reads, and each answers something the form
   * cannot invent: the product's units, because `id_satuan_input` has to be one
   * the product actually registers (there is no foreign key to catch a wrong
   * one, only a 400); the price version in force on the nota's date, which is
   * the whole point of this module; and the room balance, because posting is
   * refused outright when the ruang cannot cover the line and a buyer is
   * standing at the counter when that happens.
   *
   * Only the first is allowed to fail loudly. A product with no price is a
   * product sold at a typed price, and a balance that cannot be read is a
   * balance the server will decide on anyway.
   */
  const pickProduct = useCallback(
    async (option: PickerOption) => {
      const id = Number(option.value);
      setLoadingSatuan(true);
      try {
        const detail = await getProduct(id);
        const options: SatuanOption[] = detail.satuan.map((s) => ({
          id: s.idSatuan,
          nama: s.nama,
          faktor: s.faktor,
        }));
        const chosen = detail.satuan.find((s) => s.def) ?? detail.satuan[0];
        onPatch(line.key, {
          idProduct: id,
          kode: detail.kode,
          nama: detail.nama,
          satuan: options,
          idSatuanInput: chosen ? chosen.idSatuan : null,
          namaSatuan: chosen ? chosen.nama : '',
          namaSatuanDasar: detail.namaSatuanDasar,
          idHargaJual: null,
          hargaDaftar: '',
          hargaList: null,
          hargaTanggal: '',
          stokRuang: null,
        });

        if (!chosen) return;
        try {
          const harga = await resolveHarga(id, chosen.idSatuan, tanggal);
          onPatch(line.key, {
            ...harga,
            harga:
              harga.hargaDaftar === ''
                ? ''
                : String(Math.round(decimalToNumber(harga.hargaDaftar))),
          });
        } catch {
          // No suggestion, no harm: the price is typed.
        }

        if (idRuang === null) return;
        try {
          const stok = await listStok(id);
          const disini = stok.find((s) => s.id_ruang === idRuang);
          onPatch(line.key, { stokRuang: disini?.stok_akhir ?? 0 });
        } catch {
          // Left null, which reads as "tidak diketahui" rather than as zero.
        }
      } catch {
        onPatch(line.key, { idProduct: null, satuan: null, idHargaJual: null, hargaDaftar: '' });
      } finally {
        setLoadingSatuan(false);
      }
    },
    [idRuang, line.key, tanggal, onPatch]
  );

  /**
   * The alternatives, fetched only when somebody actually wants to change the
   * unit — and the price versions with them, because the version belongs to the
   * (product, unit) pair and changing the unit changes which one applies.
   */
  const loadSatuan = useCallback(async () => {
    if (line.idProduct === null) return;
    const idProduct = line.idProduct;
    setLoadingSatuan(true);
    try {
      const detail = await getProduct(idProduct);
      onPatch(line.key, {
        satuan: detail.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
        namaSatuanDasar: detail.namaSatuanDasar,
      });
      try {
        const harga = await resolveHarga(idProduct, line.idSatuanInput, tanggal);
        // The stored price is left alone: this load is about the alternatives,
        // not about re-pricing a line somebody has already agreed.
        onPatch(line.key, harga);
      } catch {
        // The unit list is what was asked for; the version can stay unresolved.
      }
    } catch {
      // Leaving `satuan` null keeps the stored unit on screen, which is correct.
    } finally {
      setLoadingSatuan(false);
    }
  }, [line.idProduct, line.idSatuanInput, line.key, tanggal, onPatch]);

  /** Switching the unit re-picks the version from the answer already cached. */
  const pickSatuan = useCallback(
    (value: string) => {
      const idSatuan = Number(value);
      const picked = line.satuan?.find((s) => s.id === idSatuan);
      const versi = line.hargaList?.find((h) => h.idSatuan === idSatuan) ?? null;
      onPatch(line.key, {
        idSatuanInput: idSatuan,
        namaSatuan: picked?.nama ?? '',
        idHargaJual: versi ? versi.idHargaJual : null,
        hargaDaftar: versi ? versi.harga : '',
        // A price per dus and a price per pcs are different numbers for the same
        // goods, so carrying the old figure across a unit change is always wrong.
        // Without a version to take it from, the field is cleared to be retyped.
        harga: versi ? String(Math.round(decimalToNumber(versi.harga))) : '',
      });
    },
    [line.hargaList, line.key, line.satuan, onPatch]
  );

  const faktor = line.satuan?.find((s) => s.id === line.idSatuanInput)?.faktor ?? null;
  const qtyDasar = faktor === null ? null : Number(numericToDecimal(line.qty) ?? '0') * faktor;
  const kurangStok =
    line.stokRuang !== null && qtyDasar !== null && qtyDasar > line.stokRuang;

  const hargaDaftarNum = decimalToNumber(line.hargaDaftar);
  const hargaKetik = Number(numericToDecimal(line.harga) ?? '0');
  const bedaDariDaftar =
    line.hargaDaftar !== '' && Math.round(hargaDaftarNum) !== Math.round(hargaKetik);
  const versiBasi = line.idHargaJual !== null && line.hargaTanggal !== tanggal;

  return (
    <View style={styles.lineBox}>
      <View style={styles.lineTop}>
        <Text style={styles.lineNo}>#{index + 1}</Text>
        <View style={{ flex: 1, minWidth: 220 }}>
          {editable ? (
            <SearchPicker
              chosen={line.idProduct === null ? null : `${line.kode} · ${line.nama}`}
              onPick={pickProduct}
              search={cariProduk}
              placeholder="Cari nama atau kode barang"
              emptyHint="Tidak ada produk aktif yang cocok."
            />
          ) : (
            <Text style={styles.readNama}>
              {line.kode} · {line.nama}
            </Text>
          )}
        </View>
        {editable && <TinyButton label="Hapus" danger onPress={() => onRemove(line.key)} />}
      </View>

      <View style={styles.fieldRow}>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <Field label="SATUAN">
            {loadingSatuan ? (
              <View style={styles.readout}>
                <ActivityIndicator color={C.primary} />
              </View>
            ) : line.satuan === null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.readout, { flex: 1 }]}>
                  <Text style={styles.readoutText}>{line.namaSatuan || '—'}</Text>
                </View>
                {editable && line.idProduct !== null && (
                  <GhostButton label="Ganti" onPress={loadSatuan} />
                )}
              </View>
            ) : (
              <OptionPicker
                options={line.satuan.map((s) => ({
                  value: String(s.id),
                  label: s.faktor === 1 ? s.nama : `${s.nama} (×${s.faktor})`,
                }))}
                value={line.idSatuanInput === null ? null : String(line.idSatuanInput)}
                onChange={pickSatuan}
              />
            )}
          </Field>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 110 }}>
          <Field
            label="QTY"
            hint={faktor !== null && faktor !== 1 ? `×${faktor} satuan dasar` : undefined}>
            <TextField
              value={line.qty}
              onChangeText={(v) => onPatch(line.key, { qty: v })}
              keyboardType="numeric"
              placeholder="0"
              editable={editable}
            />
          </Field>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <Field label="HARGA / SATUAN">
            <TextField
              value={line.harga}
              onChangeText={(v) => onPatch(line.key, { harga: v })}
              keyboardType="numeric"
              placeholder="0"
              editable={editable}
            />
          </Field>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 120 }}>
          <Field label="DISKON BARIS">
            <TextField
              value={line.diskon}
              onChangeText={(v) => onPatch(line.key, { diskon: v })}
              keyboardType="numeric"
              placeholder="0"
              editable={editable}
            />
          </Field>
        </View>
      </View>

      {/* Three separate facts about the same line, printed only when each is
          true — a row that always carries all of them is a row nobody reads. */}
      {/* `hargaList` rather than `hargaTanggal`: a line read back from the server
          carries the nota's date already, so only the list says a lookup ran. */}
      {line.hargaList !== null && line.hargaDaftar === '' && (
        <Text style={styles.noteFaint}>
          Belum ada harga jual yang berlaku {tanggal} untuk satuan ini — harga diketik manual dan
          nota tetap sah.
        </Text>
      )}
      {bedaDariDaftar && (
        <Text style={styles.noteFaint}>
          Daftar harga {rp(hargaDaftarNum)} · yang ditagih {rp(hargaKetik)}. Versinya tetap
          tercatat sebagai asal harga baris ini.
        </Text>
      )}
      {versiBasi && (
        <Text style={styles.noteWarn}>
          Versi harga ini diambil untuk {line.hargaTanggal}, bukan {tanggal}.
        </Text>
      )}
      {line.stokRuang !== null && (
        <Text style={kurangStok ? styles.noteWarn : styles.noteFaint}>
          Stok ruang {num(line.stokRuang)} {line.namaSatuanDasar}
          {qtyDasar !== null ? ` · baris ini ${num(qtyDasar)}` : ''}
          {kurangStok ? ' · posting akan ditolak' : ''}
        </Text>
      )}

      <View style={styles.lineFoot}>
        <Text style={styles.lineFootLabel}>Subtotal baris</Text>
        <Text style={styles.lineFootValue}>{rp(lineSubtotal(line))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRight: { fontSize: 13.5, color: C.muted3 },
  warnBox: {
    padding: 14,
    backgroundColor: C.amberBg,
    borderBottomWidth: 1,
    borderBottomColor: C.amberBorder,
  },
  warnText: { fontSize: 12.5, color: C.amber, lineHeight: 18 },
  lineBox: {
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  lineNo: { fontSize: 13, fontWeight: '700', color: C.muted2, width: 28 },
  readNama: { fontSize: 15.5, fontWeight: '500', color: C.text },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  noteFaint: { fontSize: 12.5, color: C.muted3, lineHeight: 18 },
  noteWarn: { fontSize: 12.5, color: C.amber, lineHeight: 18, fontWeight: '600' },
  readout: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.tableHeaderBg,
  },
  readoutText: { fontSize: 14, color: C.dark2 },
  lineFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  lineFootLabel: { fontSize: 13, color: C.muted3 },
  lineFootValue: { fontSize: 16, fontWeight: '700', color: C.text },
  addBar: { padding: 14, alignItems: 'flex-start' },
});
