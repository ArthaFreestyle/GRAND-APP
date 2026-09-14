/**
 * The line editor both of pembelian's derived documents use.
 *
 * `penerimaan-susulan` and `retur-pembelian` are mirror images — same source
 * document, same `pembelian_detail` rows, same "one quantity per line", opposite
 * direction of goods — so they share one editor rather than two that would drift.
 * What differs is a `mode`, and it changes exactly three things: which quantity
 * caps a line, which lines are worth offering at all, and the words for both.
 * Only `susulan` has a screen today; `retur` is kept because the mode is two
 * lines of copy and deleting it is how the next person rebuilds this file.
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
 * ### The ceiling is written, not discovered
 *
 * The board is explicit about this and it is the one rule here worth protecting:
 * *"jumlahnya dibatasi sisa itu — batasnya ditulis di bawah tiap stepper, bukan
 * baru muncul sebagai error."* The remainder is printed under every field before
 * anything is typed, and the `+` stops at it. Going over is still possible by
 * typing, and then it is said in red on the same line — because the number might
 * be right and the *invoice's* remainder stale, and a field that refuses to hold
 * what somebody is reading off a delivery note is worse than one that disagrees
 * out loud.
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
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SatuanOption } from '@/components/pembelian/lines';
import {
  RamahChip,
  RamahIconButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah } from '@/constants/produk';
import {
  RamahColors as C,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
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
            ? `Diterima ${formatNumber(l.qtyDiterimaDasar)}${
                l.qtySusulanDasar > 0 ? ` + susulan ${formatNumber(l.qtySusulanDasar)}` : ''
              } dari ${formatNumber(l.qtyDasar)} ${l.namaSatuanDasar}`
            : `Datang ${formatNumber(datang)}${
                l.qtyReturDasar > 0 ? ` · sudah diretur ${formatNumber(l.qtyReturDasar)}` : ''
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
    <View style={styles.group}>
      {/* The count is in the heading's action slot rather than on a card of its
          own: "2 dari 5 baris" is the state of this whole group, and it is the
          number somebody checks before pressing save. */}
      <RamahSectionHeader>{`${copy.judul} · ${terisi} dari ${drafts.length} terisi`}</RamahSectionHeader>

      {drafts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{copy.kosongJudul}</Text>
          <Text style={styles.emptySub}>{copy.kosongSub}</Text>
        </View>
      ) : (
        drafts.map((d) => (
          <BarisRow
            key={d.sumber.idPembelianDetail}
            draft={d}
            mode={mode}
            editable={editable}
            onPatch={patch}
          />
        ))
      )}
    </View>
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
  const [satuanErr, setSatuanErr] = useState('');
  const [satuanSheet, setSatuanSheet] = useState(false);
  const [focused, setFocused] = useState(false);
  const copy = COPY[mode];
  const { sumber } = draft;

  /**
   * The alternatives, fetched only when somebody actually wants a different unit.
   *
   * A failure is **said**, not swallowed. Leaving `satuan` null does keep the
   * invoice's unit on screen — the one the server will accept anyway — but the
   * control that was pressed is a chip with a chevron on it, and a chevron that
   * does nothing twice in a row reads as the app being broken rather than as the
   * lookup having failed. The line is still usable in the invoice's unit, which
   * is what the message says.
   */
  const loadSatuan = useCallback(async () => {
    setLoadingSatuan(true);
    setSatuanErr('');
    try {
      const detail = await getProduct(sumber.idProduct);
      onPatch(sumber.idPembelianDetail, {
        satuan: detail.satuan.map((s) => ({ id: s.idSatuan, nama: s.nama, faktor: s.faktor })),
      });
      setSatuanSheet(true);
    } catch {
      setSatuanErr(`Satuan lain tidak terbaca. Baris ini tetap bisa diisi dalam ${draft.namaSatuan}.`);
    } finally {
      setLoadingSatuan(false);
    }
  }, [onPatch, sumber.idPembelianDetail, sumber.idProduct, draft.namaSatuan]);

  const dasar = qtyDasarOf(draft);
  const diisi = draft.qty.trim() !== '';
  // Said while it can still be fixed, rather than at posting. The server checks
  // this again under a row lock and only that check decides.
  const lewatBatas = diisi && dasar > sumber.batasDasar;

  /**
   * The ceiling, expressed in the unit that is actually on screen.
   *
   * `batasDasar` is in base units and the field may be holding cartons, so the
   * stepper's own limit is the floor of the division — four-and-a-bit cartons of
   * remainder is four cartons you may type, and the rest is typed in pcs on a
   * second document or as a different unit on this one.
   */
  const batasInput = Math.floor(sumber.batasDasar / Math.max(1, draft.faktor));

  const setQty = (next: number) => {
    onPatch(sumber.idPembelianDetail, { qty: next <= 0 ? '' : String(next) });
  };
  const current = Number(numericToDecimal(draft.qty) ?? '0');

  return (
    <View style={[styles.card, diisi && styles.cardAktif]}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text style={styles.nama} numberOfLines={2}>
            {sumber.nama}
          </Text>
          <Text style={styles.ringkas} numberOfLines={2}>
            {sumber.ringkas}
          </Text>
        </View>
        {/* The ceiling, before anything is typed. This is the board's rule and
            the reason this block is at the top of the card rather than beside
            the field: it is what the reader is comparing the delivery note to. */}
        <View style={styles.batasBox}>
          <Text style={styles.batasLabel}>{copy.batas}</Text>
          <Text style={styles.batasValue} numberOfLines={1}>
            {`${formatNumber(sumber.batasDasar)} ${sumber.namaSatuanDasar}`}
          </Text>
        </View>
      </View>

      <View style={styles.qtyBlock}>
        <Text style={styles.fieldLabel}>Jumlah datang</Text>
        <View style={styles.stepRow}>
          <RamahIconButton
            icon="minus"
            variant="outline"
            label={`Kurangi jumlah ${sumber.nama}`}
            size={44}
            disabled={!editable || current <= 0}
            onPress={() => setQty(current - 1)}
          />
          <View
            style={[
              styles.qtyLine,
              { borderBottomColor: lewatBatas ? C.danger : focused ? C.borderFocus : C.borderHairline },
            ]}>
            <TextInput
              value={draft.qty}
              onChangeText={(v) => onPatch(sumber.idPembelianDetail, { qty: v })}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.textMuted}
              editable={editable}
              accessibilityLabel={`Jumlah ${sumber.nama} dalam ${draft.namaSatuan}`}
              style={styles.qtyInput}
            />
          </View>
          <RamahIconButton
            icon="plus"
            variant="tint"
            label={`Tambah jumlah ${sumber.nama}`}
            size={44}
            // Stops at the ceiling. Typing past it is still allowed — see the
            // note at the top of this file.
            disabled={!editable || current >= batasInput}
            onPress={() => setQty(current + 1)}
          />
        </View>

        <View style={styles.satuanRow}>
          {loadingSatuan ? (
            <ActivityIndicator color={C.brand} />
          ) : (
            <RamahChip
              label={draft.namaSatuan || '—'}
              iconRight={editable ? 'chevron-down' : undefined}
              accessibilityLabel={`Satuan ${draft.namaSatuan}. Ganti satuan`}
              onPress={
                editable
                  ? draft.satuan === null
                    ? () => void loadSatuan()
                    : () => setSatuanSheet(true)
                  : undefined
              }
            />
          )}
          {draft.faktor === 1 ? null : (
            <Text style={styles.faktorNote}>{`×${formatNumber(draft.faktor)} ${sumber.namaSatuanDasar}`}</Text>
          )}
        </View>

        {satuanErr ? <Text style={styles.lineErr}>{satuanErr}</Text> : null}

        {/* One caption line, and which one it is depends on the state: the limit
            while the field is empty, what the entry amounts to once it is not,
            and the overrun in red when it is over. Never two at once. */}
        {lewatBatas ? (
          <Text style={styles.lineErr}>
            {`${formatNumber(dasar)} ${sumber.namaSatuanDasar} melebihi ${copy.batas} ${formatNumber(sumber.batasDasar)}`}
          </Text>
        ) : diisi ? (
          <Text style={styles.lineNote}>
            {`${formatNumber(dasar)} ${sumber.namaSatuanDasar} masuk kartu stok · ${formatRupiah(
              dasar * decimalToNumber(sumber.hppDasar)
            )}`}
          </Text>
        ) : (
          <Text style={styles.lineNote}>
            {batasInput === 0
              ? `Sisa ${formatNumber(sumber.batasDasar)} ${sumber.namaSatuanDasar} lebih kecil dari satu ${draft.namaSatuan}`
              : `Maksimal ${formatNumber(batasInput)} ${draft.namaSatuan}. Kosong berarti baris ini tidak ikut.`}
          </Text>
        )}
      </View>

      <RamahSheet
        visible={satuanSheet}
        title={`Satuan ${sumber.nama}`}
        onClose={() => setSatuanSheet(false)}>
        <View style={styles.sheetLead}>
          <Text style={styles.sheetLeadText}>
            Satuan di kiriman kedua tidak harus sama dengan satuan di faktur — lima pcs kurang dari
            baris yang diketik per dus itu hal biasa. Yang dicatat kartu stok tetap satuan dasar.
          </Text>
        </View>
        {(draft.satuan ?? []).map((s) => (
          <RamahSheetOption
            key={s.id}
            label={s.nama}
            sub={
              s.faktor === 1
                ? 'Satuan dasar'
                : `1 ${s.nama} = ${formatNumber(s.faktor)} ${sumber.namaSatuanDasar}`
            }
            selected={s.id === draft.idSatuanInput}
            onPress={() => {
              onPatch(sumber.idPembelianDetail, {
                idSatuanInput: s.id,
                namaSatuan: s.nama,
                faktor: s.faktor,
              });
              setSatuanSheet(false);
            }}
          />
        ))}
      </RamahSheet>
    </View>
  );
}

/** A read-only line of a saved document — no field, no stepper, nothing to patch. */
export function BarisTerpasang({
  nama,
  kode,
  qty,
  satuan,
  dasar,
  namaSatuanDasar,
  nilai,
  onPress,
}: {
  nama: string;
  kode: string;
  qty: string;
  satuan: string;
  dasar: number;
  namaSatuanDasar: string;
  nilai: string;
  /** Set once the document is POSTED: opens the product's kartu stok. */
  onPress?: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        onPress
          ? `${nama}, ${qty} ${satuan}. Buka kartu stok`
          : `${nama}, ${qty} ${satuan}, ${formatRupiah(nilai)}`
      }
      style={[styles.terpasang, down && { backgroundColor: C.surfaceStack }]}>
      <View style={styles.grow}>
        <Text style={styles.nama} numberOfLines={2}>
          {nama || kode}
        </Text>
        <Text style={styles.ringkas} numberOfLines={1}>
          {`${qty} ${satuan}${dasar ? ` · ${formatNumber(dasar)} ${namaSatuanDasar}` : ''}`}
        </Text>
      </View>
      <Text style={styles.terpasangNilai} numberOfLines={1}>
        {formatRupiah(nilai)}
      </Text>
      {onPress ? <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  group: { gap: L.stack },

  emptyCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    padding: L.cardPad,
    gap: L.space1,
  },
  emptyTitle: { ...T.titleTiny, color: C.textTitle },
  emptySub: { ...T.bodySmall, color: C.textBody },

  card: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    paddingVertical: L.cardPadDense,
    paddingHorizontal: L.cardPad,
    gap: L.space3,
  },
  // A filled line reads as being *on* the document; an untouched one is a
  // candidate the reader scrolled past. Border and tint, never a shadow.
  cardAktif: { borderColor: C.borderBrand, backgroundColor: C.brandTintSoft },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: L.space3 },
  nama: { ...T.titleTiny, color: C.textTitle },
  ringkas: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },
  batasBox: { flexShrink: 0, maxWidth: 132, alignItems: 'flex-end' },
  batasLabel: { ...T.caption, color: C.textMuted },
  batasValue: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', marginTop: L.inline },

  qtyBlock: { gap: L.inline },
  fieldLabel: { ...T.caption, color: C.textBody },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  qtyLine: { flex: 1, minWidth: 0, borderBottomWidth: 1.5, paddingBottom: L.space2 },
  qtyInput: {
    padding: 0,
    minHeight: T.titleSmall.lineHeight,
    ...T.titleSmall,
    color: C.textTitle,
    textAlign: 'center',
  },
  satuanRow: { flexDirection: 'row', alignItems: 'center', gap: L.space2, paddingTop: L.space1 },
  faktorNote: { ...T.bodySmall, color: C.textMuted },
  lineNote: { ...T.bodySmall, color: C.textBody },
  lineErr: { ...T.caption, color: C.textDanger },

  sheetLead: { paddingHorizontal: L.gutter, paddingBottom: L.space3 },
  sheetLeadText: { ...T.bodySmall, color: C.textBody },

  terpasang: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    paddingVertical: L.space3,
    paddingHorizontal: L.cardPad,
    minHeight: L.rowH,
  },
  terpasangNilai: { ...T.titleTiny, color: C.textTitle, textAlign: 'right', flexShrink: 0 },
});
