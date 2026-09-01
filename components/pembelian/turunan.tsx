/**
 * The line editor both of pembelian's derived documents use.
 *
 * `penerimaan-susulan` and `retur-pembelian` are mirror images — same source
 * document, same `pembelian_detail` rows, same "one quantity per line", opposite
 * direction of goods — so they share one editor rather than two that would drift.
 * What differs is a `mode`, and it changes exactly three things: which quantity
 * caps a line, which lines are worth offering at all, and the words for both.
 *
 * ### Why this is not a product search
 *
 * `components/pembelian/lines.tsx` searches the whole product master, because an
 * invoice can name anything the shop buys. These two documents cannot: every
 * line has to point at a line of one specific POSTED invoice, and the server
 * refuses anything else. So the source document *is* the form — its lines are
 * listed, each with the ceiling that applies to it, and typing a quantity is
 * what puts one on the document. Leaving it blank leaves the line off.
 *
 * ### The two ceilings are on different axes
 *
 * Susulan draws down `sisaDasar` — what the supplier still owes. Retur draws
 * down `qtyDapatDiretur` — what actually arrived and has not gone back yet.
 * Returned goods were still received, so a return neither re-opens a shortfall
 * nor earns a right to a follow-up delivery: one line can be short **and**
 * returnable at once, and mixing the two is the mistake this file exists to
 * prevent.
 *
 * Both ceilings are checked here and again at posting, under a row lock on the
 * pembelian. Only the second one decides — another document for the same invoice
 * can consume the remainder in between — so this is a faster error, not a second
 * source of truth.
 *
 * ### The unit is the invoice's, until somebody says otherwise
 *
 * `id_satuan_input` only has to be registered in the product's `product_satuan`;
 * it need not match the invoice line. Five pcs short of a line typed in cartons
 * is ordinary, and so is returning a whole carton off a line typed in pcs. The
 * invoice's unit is the default because it is nearly always right, and the
 * alternatives cost a `GET /product/{id}` that is only spent when asked for.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { SatuanOption } from '@/components/pembelian/lines';
import {
  Card,
  CardHead,
  EmptyState,
  Field,
  GhostButton,
  OptionPicker,
  TextField,
} from '@/components/shell/ui';
import { Colors as C, num, rp } from '@/constants/theme-erp';
import { decimalToNumber, numericToDecimal } from '@/services/decimal';
import type { PembelianDoc } from '@/services/pembelian';
import { getProduct } from '@/services/produk';

/** Which of the invoice line's two ceilings applies. */
export type ModeTurunan = 'susulan' | 'retur';

interface ModeCopy {
  judul: string;
  /** The ceiling's name, used in the field hint and in every error. */
  batas: string;
  kosongJudul: string;
  kosongSub: string;
  nilaiLabel: string;
}

const COPY: Record<ModeTurunan, ModeCopy> = {
  susulan: {
    judul: 'Baris yang belum datang',
    batas: 'sisa',
    kosongJudul: 'Tidak ada sisa di faktur ini',
    kosongSub:
      'Semua yang difakturkan sudah tercatat diterima, jadi tidak ada yang bisa menyusul. Kekurangan kiriman muncul di sini begitu fakturnya mencatat selisih.',
    nilaiLabel: 'Nilai barang menyusul',
  },
  retur: {
    judul: 'Baris yang bisa diretur',
    batas: 'batas retur',
    kosongJudul: 'Tidak ada yang bisa dikembalikan',
    kosongSub:
      'Yang bisa diretur adalah yang benar-benar datang, dikurangi yang sudah diretur. Barang yang tidak pernah datang dikejar dengan penerimaan susulan, bukan retur.',
    nilaiLabel: 'Nilai barang keluar',
  },
};

/** One invoice line as this editor sees it: an identity, a ceiling, and a price. */
export interface SumberBaris {
  idPembelianDetail: number;
  idProduct: number;
  kode: string;
  nama: string;
  /** The invoice line's unit — this editor's default, not its only choice. */
  idSatuanFaktur: number;
  namaSatuanFaktur: string;
  faktorFaktur: number;
  namaSatuanDasar: string;
  /** The ceiling, in base units. */
  batasDasar: number;
  /**
   * Copied from the invoice at posting, so it is filled on any POSTED document.
   * `'0.0000'` would mean the source was not posted, which the server refuses
   * before this editor could show it.
   */
  hppDasar: string;
  /** The line's history in one sentence — what arrived, what is still owed, what went back. */
  ringkas: string;
}

/**
 * The invoice's lines that this kind of document can be written against.
 *
 * `wajibIkut` is the ids a draft already carries. A line whose ceiling has since
 * fallen to zero — another document for the same invoice got posted first — is
 * kept in the list rather than silently dropped, so the reader sees the row that
 * is now over its limit instead of watching a quantity disappear.
 */
export function barisSumber(
  doc: PembelianDoc,
  mode: ModeTurunan,
  wajibIkut: readonly number[] = []
): SumberBaris[] {
  const wajib = new Set(wajibIkut);
  return doc.lines
    .map((l) => {
      const datang = l.qtyDiterimaDasar + l.qtySusulanDasar;
      return {
        idPembelianDetail: l.id,
        idProduct: l.idProduct,
        kode: l.kode,
        nama: l.nama,
        idSatuanFaktur: l.idSatuanInput,
        namaSatuanFaktur: l.namaSatuan,
        faktorFaktur: l.faktor,
        namaSatuanDasar: l.namaSatuanDasar,
        batasDasar: mode === 'susulan' ? l.sisaDasar : l.qtyDapatDiretur,
        hppDasar: l.hppDasar ?? '0.0000',
        ringkas:
          mode === 'susulan'
            ? `Diterima ${num(l.qtyDiterimaDasar)}${
                l.qtySusulanDasar > 0 ? ` + susulan ${num(l.qtySusulanDasar)}` : ''
              } dari ${num(l.qtyDasar)} ${l.namaSatuanDasar}`
            : `Datang ${num(datang)}${
                l.qtyReturDasar > 0 ? ` · sudah diretur ${num(l.qtyReturDasar)}` : ''
              } ${l.namaSatuanDasar}`,
      };
    })
    .filter((s) => s.batasDasar > 0 || wajib.has(s.idPembelianDetail));
}

export interface TurunanDraft {
  sumber: SumberBaris;
  /** Empty means the line is not on this document at all. */
  qty: string;
  /** `null` until somebody asks for the product's other units. */
  satuan: SatuanOption[] | null;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
}

function draftOf(sumber: SumberBaris, qty: string): TurunanDraft {
  return {
    sumber,
    qty,
    satuan: null,
    idSatuanInput: sumber.idSatuanFaktur,
    namaSatuan: sumber.namaSatuanFaktur,
    faktor: sumber.faktorFaktur,
  };
}

/** A blank form over one invoice: every candidate line listed, none of them filled. */
export function draftsBaru(sumber: SumberBaris[]): TurunanDraft[] {
  return sumber.map((s) => draftOf(s, ''));
}

/** One stored line, as far as seeding the editor needs it. */
export interface BarisTersimpan {
  idPembelianDetail: number;
  qtyInput: string;
  idSatuanInput: number;
  namaSatuan: string;
  faktor: number;
}

/**
 * Reopening a saved draft: the same candidate list, with the quantities and the
 * units the document actually stored — including a unit that is not the
 * invoice's, which is exactly the case a naive re-seed would lose.
 */
export function draftsDari(
  sumber: SumberBaris[],
  tersimpan: readonly BarisTersimpan[]
): TurunanDraft[] {
  const byId = new Map(tersimpan.map((l) => [l.idPembelianDetail, l]));
  return sumber.map((s) => {
    const stored = byId.get(s.idPembelianDetail);
    if (!stored) return draftOf(s, '');
    return {
      sumber: s,
      qty: trimDecimal(stored.qtyInput),
      satuan: null,
      idSatuanInput: stored.idSatuanInput,
      namaSatuan: stored.namaSatuan,
      faktor: stored.faktor,
    };
  });
}

/** `"5.0000"` reads as `5` in a field somebody is about to retype. */
function trimDecimal(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

/** How many base units one draft line puts on the document. */
export function qtyDasarOf(draft: TurunanDraft): number {
  const qty = Number(numericToDecimal(draft.qty) ?? '0');
  return qty * draft.faktor;
}

/**
 * The document's value, previewed. The server recomputes it from the same harga
 * pokok, so this is arithmetic over the same inputs rather than a guess — but
 * the document that comes back is the one that counts.
 */
export function nilaiTurunan(drafts: readonly TurunanDraft[]): number {
  return drafts.reduce(
    (sum, d) => (d.qty.trim() === '' ? sum : sum + qtyDasarOf(d) * decimalToNumber(d.sumber.hppDasar)),
    0
  );
}

export interface TurunanLineInput {
  id_pembelian_detail: number;
  id_satuan_input: number;
  qty_input: string;
}

export type TurunanResult =
  | { ok: true; detail: TurunanLineInput[] }
  | { ok: false; error: string };

/**
 * Validates the draft and builds the body.
 *
 * Errors name the product rather than a row number: the rows here are the
 * invoice's lines, in the invoice's order, and nobody counts down a delivery
 * note to find "baris 4".
 *
 * `qty x faktor` has to be a whole number because `qty_dasar` is a `BIGINT` —
 * half a carton of twelve is 6, half a carton of five is not expressible.
 */
export function turunanToInput(
  drafts: readonly TurunanDraft[],
  mode: ModeTurunan
): TurunanResult {
  const copy = COPY[mode];
  const detail: TurunanLineInput[] = [];

  for (const d of drafts) {
    if (d.qty.trim() === '') continue;
    const nama = d.sumber.nama || d.sumber.kode;

    const qty = numericToDecimal(d.qty);
    if (qty === null || Number(qty) <= 0) {
      return { ok: false, error: `${nama}: qty harus lebih dari nol, atau kosongkan barisnya.` };
    }
    const dasar = Number(qty) * d.faktor;
    if (!Number.isInteger(dasar)) {
      return {
        ok: false,
        error: `${nama}: qty x faktor konversi (${d.faktor}) harus bilangan bulat.`,
      };
    }
    if (dasar > d.sumber.batasDasar) {
      return {
        ok: false,
        error: `${nama}: ${dasar} melebihi ${copy.batas} ${d.sumber.batasDasar} ${d.sumber.namaSatuanDasar}.`,
      };
    }

    detail.push({
      id_pembelian_detail: d.sumber.idPembelianDetail,
      id_satuan_input: d.idSatuanInput,
      qty_input: qty,
    });
  }

  if (detail.length === 0) {
    return { ok: false, error: 'Isi qty di minimal satu baris.' };
  }
  return { ok: true, detail };
}

// ---- the editor ----

/** An updater, not a value — a unit lookup lands after the render that asked for it. */
export type TurunanUpdater = (updater: (prev: TurunanDraft[]) => TurunanDraft[]) => void;

export function TurunanLineEditor({
  drafts,
  onChange,
  mode,
  editable,
}: {
  drafts: TurunanDraft[];
  onChange: TurunanUpdater;
  mode: ModeTurunan;
  editable: boolean;
}) {
  const copy = COPY[mode];

  const patch = useCallback(
    (id: number, next: Partial<TurunanDraft>) => {
      onChange((prev) =>
        prev.map((d) => (d.sumber.idPembelianDetail === id ? { ...d, ...next } : d))
      );
    },
    [onChange]
  );

  const terisi = drafts.filter((d) => d.qty.trim() !== '').length;

  return (
    <Card>
      <CardHead
        title={copy.judul}
        right={
          <Text style={styles.headRight}>
            {terisi} dari {drafts.length} baris · {rp(nilaiTurunan(drafts))}
          </Text>
        }
      />
      {drafts.map((d) => (
        <BarisRow
          key={d.sumber.idPembelianDetail}
          draft={d}
          mode={mode}
          editable={editable}
          onPatch={patch}
        />
      ))}
      {drafts.length === 0 && <EmptyState title={copy.kosongJudul} sub={copy.kosongSub} />}
    </Card>
  );
}

function BarisRow({
  draft,
  mode,
  editable,
  onPatch,
}: {
  draft: TurunanDraft;
  mode: ModeTurunan;
  editable: boolean;
  onPatch: (id: number, next: Partial<TurunanDraft>) => void;
}) {
  const [loadingSatuan, setLoadingSatuan] = useState(false);
  const copy = COPY[mode];
  const { sumber } = draft;

  /** The alternatives, fetched only when somebody actually wants a different unit. */
  const loadSatuan = useCallback(async () => {
    setLoadingSatuan(true);
    try {
      const detail = await getProduct(sumber.idProduct);
      onPatch(sumber.idPembelianDetail, {
        satuan: detail.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
      });
    } catch {
      // Leaving `satuan` null keeps the invoice's unit on screen, which is the
      // one the server will accept anyway.
    } finally {
      setLoadingSatuan(false);
    }
  }, [onPatch, sumber.idPembelianDetail, sumber.idProduct]);

  const dasar = qtyDasarOf(draft);
  const diisi = draft.qty.trim() !== '';
  // Said while it can still be fixed, rather than at posting. The server checks
  // this again under a row lock and only that check decides.
  const lewatBatas = diisi && dasar > sumber.batasDasar;

  return (
    <View style={[styles.box, diisi && styles.boxAktif]}>
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 200, gap: 3 }}>
          <Text style={styles.nama} numberOfLines={2}>
            {sumber.nama}
          </Text>
          <Text style={styles.kode} numberOfLines={1}>
            {sumber.kode}
          </Text>
          <Text style={styles.ringkas} numberOfLines={2}>
            {sumber.ringkas}
          </Text>
        </View>
        <View style={styles.batasBox}>
          <Text style={styles.batasLabel}>{copy.batas.toUpperCase()}</Text>
          <Text style={styles.batasValue}>
            {num(sumber.batasDasar)} {sumber.namaSatuanDasar}
          </Text>
        </View>
      </View>

      <View style={styles.fieldRow}>
        <View style={{ flexGrow: 1, flexBasis: 130 }}>
          <Field
            label="QTY"
            hint={draft.faktor === 1 ? 'kosong = tidak ikut' : `x${draft.faktor} satuan dasar`}>
            <TextField
              value={draft.qty}
              onChangeText={(v) => onPatch(sumber.idPembelianDetail, { qty: v })}
              keyboardType="numeric"
              placeholder="0"
              editable={editable}
            />
          </Field>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 170 }}>
          <Field label="SATUAN">
            {loadingSatuan ? (
              <View style={styles.readout}>
                <ActivityIndicator color={C.primary} />
              </View>
            ) : draft.satuan === null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.readout, { flex: 1 }]}>
                  <Text style={styles.readoutText}>{draft.namaSatuan || '—'}</Text>
                </View>
                {editable && <GhostButton label="Ganti" onPress={loadSatuan} />}
              </View>
            ) : (
              <OptionPicker
                options={draft.satuan.map((s) => ({
                  value: String(s.id),
                  label: s.faktor === 1 ? s.nama : `${s.nama} (x${s.faktor})`,
                }))}
                value={String(draft.idSatuanInput)}
                onChange={(v) => {
                  const picked = draft.satuan?.find((s) => s.id === Number(v));
                  if (!picked) return;
                  onPatch(sumber.idPembelianDetail, {
                    idSatuanInput: picked.id,
                    namaSatuan: picked.nama,
                    faktor: picked.faktor,
                  });
                }}
              />
            )}
          </Field>
        </View>
      </View>

      {diisi && (
        <View style={styles.foot}>
          <Text style={[styles.footNote, lewatBatas && { color: C.red, fontWeight: '600' }]}>
            {lewatBatas
              ? `${num(dasar)} ${sumber.namaSatuanDasar} melebihi ${copy.batas} ${num(sumber.batasDasar)}`
              : `${num(dasar)} ${sumber.namaSatuanDasar}`}
          </Text>
          <Text style={styles.footValue}>
            {rp(dasar * decimalToNumber(sumber.hppDasar))}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headRight: { fontSize: 13.5, color: C.muted3 },
  box: { gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.borderLighter },
  // A filled line reads as being on the document; an untouched one is a
  // candidate the reader scrolled past.
  boxAktif: { backgroundColor: C.tableHeaderBg },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  nama: { fontSize: 15.5, fontWeight: '500', color: C.text },
  kode: { fontSize: 12.5, color: C.muted, fontFamily: 'monospace' },
  ringkas: { fontSize: 12.5, color: C.muted3 },
  batasBox: { alignItems: 'flex-end', gap: 3, minWidth: 120 },
  batasLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: C.muted2 },
  batasValue: { fontSize: 15, fontWeight: '600', color: C.dark2 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  readout: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.card,
  },
  readoutText: { fontSize: 14, color: C.dark2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footNote: { fontSize: 12.5, color: C.muted3 },
  footValue: { fontSize: 15, fontWeight: '600', color: C.text },
});
