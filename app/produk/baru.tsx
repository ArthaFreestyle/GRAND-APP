/**
 * Produk baru — flow F of `Papan Layar.dc.html`: screens G1, G2, G3 and the
 * confirmation `baruDone`, drawn as `LayarGudang.dc.html` draws each of them.
 *
 * **One decision per step.** G1 gives the thing its name, G2 locks the unit the
 * stock ledger will count it in and adds the multiples of that unit, G3 puts one
 * price on each unit. Then a page that says what was saved.
 *
 * ## One route, four steps — and what that costs
 *
 * CLAUDE.md's rule is that a create form is a route and not a `view` branch, and
 * this is that route: `/produk/baru`, pushed, with a URL and an entry in the
 * stack. The four *steps* inside it are state rather than four routes, because a
 * half-filled draft is not a place anybody links to — step 3 with nothing typed
 * into steps 1 and 2 is not a screen, it is an accident.
 *
 * The cost is honest and worth writing down: **the Android back gesture leaves
 * the whole flow, not one step.** Nothing here intercepts it, and nothing should
 * — `app.json` turns on the predictive back gesture, so Android starts animating
 * the screen away before JS gets a say, and a `BackHandler` that cancelled that
 * would fight an animation already in flight. The header arrow is what walks
 * back a step; the system gesture means "I am done with this". The board says
 * the same thing about G1 ("Panah kembali membatalkan draf") and the only
 * difference here is that it is true from every step.
 *
 * ## Why the product is written in one request and the prices in several
 *
 * `POST /product` takes the derived units **in the same transaction** as the
 * product (`satuan`, up to 32), and the base unit is registered automatically
 * with `faktor = 1` from `id_satuan_dasar`. So the whole of G1 and G2 is one
 * call that either creates everything or creates nothing — no product ever
 * exists with two of its three units registered.
 *
 * Prices cannot join it: `POST /product/{id}/harga-jual` is per unit and needs
 * an id that does not exist until the product does. So G3 is one call per priced
 * unit, after the fact, and a price that fails is reported on the confirmation
 * page rather than rolled back — the product is real by then, and pretending
 * otherwise would leave a record nobody was told about.
 *
 * ## What the board draws that is not here
 *
 * - **The barcode-scan button beside Kode barang.** Nothing in this project can
 *   open a camera: there is no `expo-camera` and no barcode module in
 *   `package.json`. A button that does nothing is worse than its absence, and
 *   the field takes a typed code perfectly well — `GET /pos/product` sorts an
 *   exact `kode_barang` match to the top, so a scanner added later feeds this
 *   same field.
 * - **A server-generated code.** The board's annotation says the code is made by
 *   the server and shown as news rather than asked for; the contract disagrees
 *   and so does the board's own drawing, which draws an input. `kode_barang` is
 *   **required** on `POST /product` and a duplicate answers 409. The contract
 *   wins, and the field is an input with the 409 surfaced as the server words it.
 * - **Stok minimum.** The board does not ask for it in this flow and neither
 *   does this screen — three steps, one decision each. It is set on Ubah, and
 *   the confirmation page says so plainly rather than leaving somebody to
 *   discover that a brand-new product never appears in the reorder list.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockPadding } from '@/hooks/use-keyboard-height';

import Feather from '@expo/vector-icons/Feather';
import {
  RamahField,
  RamahHeader,
  RamahIconButton,
  RamahInlineError,
  RamahPickerField,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahSteps,
  RamahSummaryCard,
} from '@/components/shell/ramah';
import { formatNumber, formatRupiah, todayISO } from '@/constants/produk';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { rupiahToDecimal } from '@/services/decimal';
import { useCanWrite } from '@/services/permissions';
import { addHarga, createProduct, listSatuan, produkBus } from '@/services/produk';
import { useSession } from '@/services/session';
import type { components } from '@/types/api';

type ApiSatuan = components['schemas']['Satuan'];

/** A derived unit, held locally until the product is written. */
interface Turunan {
  idSatuan: number;
  nama: string;
  faktor: number;
}

/** What the sheet is currently being used for — picking the base unit, or adding a multiple. */
type SheetMode = { kind: 'dasar' } | { kind: 'turunan'; idSatuan: number | null; faktor: string; err: string };

export default function ProdukBaruScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /**
   * The docked control's bottom padding, keyboard included.
   *
   * Under edge-to-edge the Android window is not resized when the IME
   * opens, so a button sitting on the bottom edge is simply covered by it.
   * `useDockPadding` swaps the safe-area inset for the keyboard's height
   * while it is up — the two are alternatives, never a sum, because the
   * gesture bar that inset pays for is itself behind the keyboard.
   */
  const dockPad = useDockPadding(insets.bottom, L.dockPad);
  const canWrite = useCanWrite('produk');

  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1);

  // ---- G1 ----
  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [namaErr, setNamaErr] = useState('');
  const [kodeErr, setKodeErr] = useState('');

  // ---- G2 ----
  const [satuanMaster, setSatuanMaster] = useState<ApiSatuan[]>([]);
  const [masterErr, setMasterErr] = useState('');
  const [idDasar, setIdDasar] = useState<number | null>(null);
  const [dasarErr, setDasarErr] = useState('');
  const [turunan, setTurunan] = useState<Turunan[]>([]);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [sheetQuery, setSheetQuery] = useState('');

  // ---- G3 ----
  /** idSatuan → rupiah digits. */
  const [harga, setHarga] = useState<Record<number, string>>({});
  const [hargaErr, setHargaErr] = useState('');

  // ---- saving, and what came of it ----
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const session = useSession();
  /**
   * Where the product landed, said on the confirmation page. `POST /product`
   * has no unit field: it enters the session's active unit, or every active unit
   * when the session is global — so the same button puts a product in different
   * places for different people, and nothing else on screen would say so.
   */
  const activeUnitId = session?.active?.id_unit_kerja ?? null;
  const katalogUnit =
    activeUnitId == null
      ? 'semua unit kerja aktif'
      : (session?.grants.find((g) => g.id_unit_kerja === activeUnitId)?.nama_unit_kerja ??
        'unit kerja aktif');
  const [created, setCreated] = useState<{ id: number; hargaGagal: number } | null>(null);

  useEffect(() => {
    let alive = true;
    listSatuan()
      .then((list) => {
        if (alive) setSatuanMaster(list);
      })
      .catch((e) => {
        if (alive) {
          setMasterErr(
            messageOf(e, 'Daftar satuan tidak terbaca, jadi satuan dasar belum bisa dipilih.')
          );
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const namaOf = useCallback(
    (sid: number | null) => satuanMaster.find((s) => s.id === sid)?.nama ?? '',
    [satuanMaster]
  );
  const namaDasar = namaOf(idDasar);

  /**
   * Every unit this product will have, base first.
   *
   * Derived on the way into G3 rather than stored, because it is exactly
   * "what G2 decided" restated — and a second copy of that would be a second
   * thing to keep in step when somebody walks back to G2 and removes a unit.
   */
  const semuaSatuan = useMemo(
    () =>
      idDasar === null
        ? []
        : [{ idSatuan: idDasar, nama: namaDasar, faktor: 1 }, ...turunan],
    [idDasar, namaDasar, turunan]
  );

  /** The master, minus the base unit and anything already added. */
  const addable = useMemo(() => {
    const taken = new Set<number>([...(idDasar !== null ? [idDasar] : []), ...turunan.map((t) => t.idSatuan)]);
    const q = sheetQuery.trim().toLowerCase();
    return satuanMaster
      .filter((m) => m.id !== undefined && !taken.has(m.id))
      .filter((m) => !q || (m.nama ?? '').toLowerCase().includes(q));
  }, [satuanMaster, idDasar, turunan, sheetQuery]);

  /** The base unit may be any master unit; nothing is taken yet. */
  const dasarOptions = useMemo(() => {
    const q = sheetQuery.trim().toLowerCase();
    return satuanMaster.filter((m) => !q || (m.nama ?? '').toLowerCase().includes(q));
  }, [satuanMaster, sheetQuery]);

  const leave = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/produk');
  }, [router]);

  /** The header arrow: one step back, or out of the flow from the first. */
  const goBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else leave();
  }, [step, leave]);

  function nextFromStep1() {
    const n = nama.trim();
    // Three letters is the board's own rule, and it is a real one: a one-letter
    // product is unsearchable the moment there are two of them.
    if (n.length < 3) {
      setNamaErr('Tulis minimal tiga huruf.');
      return;
    }
    if (kode.trim() === '') {
      setKodeErr('Kode barang wajib diisi.');
      return;
    }
    setNamaErr('');
    setKodeErr('');
    setStep(2);
  }

  function nextFromStep2() {
    if (idDasar === null) {
      setDasarErr('Pilih satuan dasar dulu.');
      return;
    }
    setDasarErr('');
    setStep(3);
  }

  function addTurunan() {
    if (!sheet || sheet.kind !== 'turunan' || sheet.idSatuan === null) return;
    const faktor = parseInt(sheet.faktor || '0', 10);
    // More than 1, not at least 1: a multiple of one is the base unit wearing a
    // second name, and `faktor = 1` is reserved for the base by the contract.
    if (!Number.isFinite(faktor) || faktor <= 1) {
      setSheet({ ...sheet, err: 'Isi lebih dari 1 — satuan dasar sudah memakai faktor 1.' });
      return;
    }
    setTurunan((list) => [
      ...list,
      { idSatuan: sheet.idSatuan as number, nama: namaOf(sheet.idSatuan), faktor },
    ]);
    setSheet(null);
    setSheetQuery('');
  }

  function removeTurunan(idSatuan: number) {
    setTurunan((list) => list.filter((t) => t.idSatuan !== idSatuan));
    // The price typed against a unit that no longer exists goes with it, so
    // walking back to G2 and out again cannot smuggle a price for nothing.
    setHarga((h) => {
      const next = { ...h };
      delete next[idSatuan];
      return next;
    });
  }

  /**
   * Write the product, then one price per unit that has one.
   *
   * The base unit's price is required by the board's own rule for G3 and it is
   * the one the catalogue quotes, so it is validated here rather than left to
   * the server — which would happily create a priceless product, because a
   * product with no price *is* legal: it sells at whatever is typed at the till.
   */
  async function save() {
    if (saving || idDasar === null) return;
    const dasarDigits = (harga[idDasar] ?? '').replace(/[^0-9]/g, '');
    if (dasarDigits === '' || parseInt(dasarDigits, 10) <= 0) {
      setHargaErr(`Isi harga ${namaDasar || 'satuan dasar'} lebih dari 0.`);
      return;
    }
    setHargaErr('');
    setSaveErr('');
    setSaving(true);

    try {
      const detail = await createProduct({
        kode_barang: kode.trim(),
        nama: nama.trim(),
        id_satuan_dasar: idDasar,
        // The base unit is omitted: the server registers it from
        // `id_satuan_dasar` with `faktor = 1`, and naming it again here with any
        // other factor is a 400.
        satuan: turunan.map((t) => ({ id_satuan: t.idSatuan, faktor: t.faktor })),
      });

      const today = todayISO();
      let gagal = 0;
      for (const s of semuaSatuan) {
        const digits = (harga[s.idSatuan] ?? '').replace(/[^0-9]/g, '');
        if (digits === '' || parseInt(digits, 10) <= 0) continue;
        try {
          await addHarga(detail.id, {
            id_satuan: s.idSatuan,
            harga: rupiahToDecimal(digits),
            berlaku_dari: today,
          });
        } catch {
          // Counted rather than thrown: the product exists now, and abandoning
          // the loop would leave the remaining units unpriced *and* unreported.
          gagal += 1;
        }
      }

      // A new product has no row for the catalogue to patch and no position this
      // screen could honestly guess — there is no sort parameter anywhere — so
      // the list re-reads its first page while the reader stays here.
      produkBus.publish({ kind: 'reload' });
      setCreated({ id: detail.id, hargaGagal: gagal });
      setStep('done');
    } catch (e) {
      // 409 is the duplicate kode_barang, and the server's message names it.
      setSaveErr(messageOf(e, 'Gagal menyimpan produk.'));
    } finally {
      setSaving(false);
    }
  }

  // ---- the confirmation page ----

  if (step === 'done' && created) {
    const ringkas = [
      { label: 'Nama', value: nama.trim() },
      { label: 'Kode barang', value: kode.trim() },
      { label: 'Satuan dasar', value: namaDasar },
      {
        label: 'Satuan turunan',
        value: turunan.length === 0 ? 'Tidak ada' : turunan.map((t) => t.nama).join(', '),
      },
      {
        label: `Harga ${namaDasar}`,
        value: formatRupiah((harga[idDasar as number] ?? '0').replace(/[^0-9]/g, '') || '0'),
      },
      { label: 'Stok minimum', value: 'Belum diatur' },
    ];

    return (
      <View style={[styles.screen, { backgroundColor: C.surfacePage }]}>
        <ScrollView style={styles.body} contentContainerStyle={styles.doneContent}>
          <View style={styles.doneMark}>
            <Feather name="check" size={32} color={C.brandInk} />
          </View>
          <View style={styles.doneHead}>
            <Text style={styles.doneTitle}>Produk tersimpan</Text>
            <Text style={styles.doneSub}>
              {`${nama.trim()} sudah masuk katalog ${katalogUnit}. Saldonya nol sampai ada nota pembelian yang diposting ke gudang.`}
            </Text>
          </View>
          <RamahSummaryCard rows={ringkas} />
          {created.hargaGagal > 0 ? (
            <RamahInlineError
              message={`${created.hargaGagal} harga gagal disimpan. Barangnya sudah ada — atur harganya dari tombol Ubah di detail.`}
            />
          ) : null}
        </ScrollView>

        <View style={[styles.dockDone, { paddingBottom: L.space4 + insets.bottom }]}>
          {/* `replace`, not `push`: the form is finished with, and backing out of
              the new record onto the form that created it invites a second copy
              of the same product. */}
          <RamahPrimaryButton
            label="Lihat detail barang"
            arrow
            onPress={() => router.replace({ pathname: '/produk/[id]', params: { id: created.id } })}
          />
          <RamahSecondaryButton
            label="Kembali ke katalog"
            onPress={leave}
            fullWidth
            height={L.controlH}
          />
        </View>
      </View>
    );
  }

  const stepTitle = step === 1 ? 'Produk baru' : nama.trim() || 'Produk baru';

  return (
    <View style={[styles.screen, step === 1 && { backgroundColor: C.surfacePage }]}>
      <RamahHeader title={stepTitle} onBack={goBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <View style={styles.intro}>
              <RamahSteps step={1} total={3} label="Identitas" />
              <Text style={styles.introTitle}>Barang apa yang mau didaftarkan?</Text>
              <Text style={styles.introSub}>
                Nama dulu. Satuan dan harga menyusul di langkah berikutnya.
              </Text>
            </View>

            <RamahField
              label="Nama barang"
              required
              value={nama}
              onChangeText={(v) => {
                setNama(v);
                setNamaErr('');
              }}
              placeholder="Map plastik kancing A4"
              error={namaErr}
              autoCapitalize="words"
              maxLength={255}
            />

            <RamahField
              label="Kode barang"
              required
              value={kode}
              onChangeText={(v) => {
                setKode(v);
                setKodeErr('');
              }}
              placeholder="8991234567890"
              // Said here because it is the one field on this screen that cannot
              // be corrected later: `PATCH /product` does not accept it at all.
              helper="Tidak bisa diubah setelah tersimpan."
              error={kodeErr}
              autoCapitalize="characters"
              maxLength={64}
            />
          </>
        ) : step === 2 ? (
          <>
            <View style={styles.intro}>
              <RamahSteps step={2} total={3} label="Satuan" />
              <Text style={styles.introTitle}>Dihitung pakai satuan apa?</Text>
              <Text style={styles.introSub}>
                Satuan dasar adalah satuan terkecil dan satu-satunya yang dicatat kartu stok.
                Satuan lain dihitung dari faktornya.
              </Text>
            </View>

            <RamahPickerField
              label="Satuan dasar"
              required
              value={namaDasar}
              placeholder="Pilih satuan"
              helper="Tidak bisa diubah nanti."
              error={dasarErr}
              onPress={() => {
                setSheetQuery('');
                setSheet({ kind: 'dasar' });
              }}
            />

            {masterErr ? <RamahInlineError message={masterErr} /> : null}

            <View style={styles.group}>
              <RamahSectionHeader
                action={idDasar === null ? undefined : 'Tambah'}
                onAction={
                  idDasar === null
                    ? undefined
                    : () => {
                        setSheetQuery('');
                        setSheet({ kind: 'turunan', idSatuan: null, faktor: '', err: '' });
                      }
                }>
                Satuan turunan · opsional
              </RamahSectionHeader>

              {turunan.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Belum ada satuan turunan</Text>
                  <Text style={styles.emptySub}>
                    Tambahkan kalau barang ini dibeli per dus atau per pak. Bisa juga menyusul nanti.
                  </Text>
                </View>
              ) : (
                turunan.map((t) => (
                  <View key={t.idSatuan} style={styles.turunanCard}>
                    <View style={styles.grow}>
                      <Text style={styles.turunanNama}>{t.nama}</Text>
                      <Text style={styles.turunanKonversi}>
                        {`1 ${t.nama} = ${formatNumber(t.faktor)} ${namaDasar}`}
                      </Text>
                    </View>
                    {/* Removable only here, before anything is written. Once the
                        product exists there is no `DELETE /product/{id}/satuan`
                        and there should not be: a faktor is what every quantity
                        already in `kartu_stok` was converted by. */}
                    <RamahIconButton
                      icon="trash-2"
                      label={`Hapus satuan ${t.nama}`}
                      color={C.danger}
                      onPress={() => removeTurunan(t.idSatuan)}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <RamahSteps step={3} total={3} label="Harga jual" />
              <Text style={styles.introTitle}>Satu harga untuk tiap satuan</Text>
              <Text style={styles.introSub}>
                Harga satuan dasar wajib diisi. Harga satuan turunan boleh berbeda dari hasil
                perkalian faktor.
              </Text>
            </View>

            <View style={styles.group}>
              {semuaSatuan.map((s) => {
                const dasarDigits = (harga[idDasar as number] ?? '').replace(/[^0-9]/g, '');
                return (
                  <View key={s.idSatuan} style={styles.hargaCard}>
                    <View style={styles.hargaHead}>
                      <Text style={styles.hargaNama}>{s.nama}</Text>
                      <Text style={styles.hargaKonversi}>
                        {s.faktor === 1
                          ? 'Satuan dasar'
                          : `${formatNumber(s.faktor)} ${namaDasar}`}
                      </Text>
                    </View>
                    <RamahField
                      label="Harga jual"
                      required={s.faktor === 1}
                      value={harga[s.idSatuan] ?? ''}
                      onChangeText={(v) => {
                        setHarga((h) => ({ ...h, [s.idSatuan]: v.replace(/[^0-9]/g, '') }));
                        setHargaErr('');
                      }}
                      keyboardType="number-pad"
                      prefix="Rp"
                      placeholder="0"
                      // The multiplication is a *comparison*, which is what the
                      // board asks for — not a default. A dus costing less than
                      // forty times a pcs is the normal case, not an error.
                      helper={
                        s.faktor > 1 && dasarDigits !== ''
                          ? `${formatNumber(s.faktor)} × harga ${namaDasar} = ${formatRupiah(
                              s.faktor * parseInt(dasarDigits, 10)
                            )}, sebagai pembanding.`
                          : s.faktor > 1
                            ? 'Boleh dikosongkan — satuan tanpa harga dijual dengan harga yang diketik di kasir.'
                            : 'Harga ini yang dipakai katalog dan kasir.'
                      }
                      error={s.faktor === 1 ? hargaErr : undefined}
                    />
                  </View>
                );
              })}
            </View>

            <RamahSummaryCard
              rows={[
                { label: 'Nama', value: nama.trim() },
                { label: 'Kode barang', value: kode.trim() },
                { label: 'Satuan dasar', value: namaDasar },
                {
                  label: 'Satuan',
                  value: `${semuaSatuan.length} satuan`,
                },
              ]}
            />

            {saveErr ? <RamahInlineError message={saveErr} /> : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        {step === 3 ? (
          <Text style={styles.saveNote}>
            Saldo awal selalu nol — stok hanya lahir dari nota pembelian yang diposting.
          </Text>
        ) : null}
        {/* The role guard is the server's; hiding the button keeps somebody from
            filling in three steps of a form that was always going to be refused. */}
        {canWrite ? (
          <RamahPrimaryButton
            label={
              step === 1 ? 'Lanjut atur satuan' : step === 2 ? 'Lanjut atur harga jual' : 'Simpan produk'
            }
            icon={step === 3 ? 'check' : undefined}
            // Steps 1 and 2 open the next question; step 3 writes the product
            // and ends the flow. An arrow on that last one would promise a
            // fourth screen, which is why it wears a check instead.
            arrow={step !== 3}
            onPress={step === 1 ? nextFromStep1 : step === 2 ? nextFromStep2 : save}
            busy={saving}
            disabled={saving}
          />
        ) : (
          <RamahInlineError message="Wewenang yang aktif tidak bisa menambah produk." />
        )}
      </View>

      <RamahSheet
        visible={sheet !== null}
        title={
          sheet?.kind === 'turunan'
            ? sheet.idSatuan === null
              ? 'Tambah satuan'
              : `Isi per ${namaOf(sheet.idSatuan)}`
            : 'Pilih satuan dasar'
        }
        onClose={() => setSheet(null)}>
        {sheet === null ? null : sheet.kind === 'dasar' ? (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetLead}>
              Satuan terkecil yang dipakai sehari-hari. Ini satu-satunya satuan yang dicatat kartu
              stok, dan setelah ada mutasi tidak bisa diganti.
            </Text>
            <RamahSearchField
              value={sheetQuery}
              onChangeText={setSheetQuery}
              placeholder="Cari satuan"
            />
            {dasarOptions.length === 0 ? (
              <Text style={styles.sheetEmpty}>
                {satuanMaster.length === 0
                  ? 'Daftar satuan tidak terbaca. Tutup, lalu coba lagi.'
                  : 'Tidak ada satuan yang cocok.'}
              </Text>
            ) : (
              dasarOptions.map((m) => (
                <RamahSheetOption
                  key={m.id}
                  label={m.nama ?? ''}
                  selected={m.id === idDasar}
                  onPress={() => {
                    setIdDasar(m.id ?? null);
                    setDasarErr('');
                    // A base unit that changed invalidates every conversion
                    // typed against the old one, so they go together rather than
                    // leaving "1 dus = 40 pcs" over a product now counted in rim.
                    if (m.id !== idDasar) {
                      setTurunan([]);
                      setHarga({});
                    }
                    setSheet(null);
                  }}
                />
              ))
            )}
          </View>
        ) : sheet.idSatuan === null ? (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetLead}>
              Satuan turunan selalu kelipatan satuan dasar. Faktornya yang dipakai kartu stok saat
              barang masuk atau keluar.
            </Text>
            <RamahSearchField
              value={sheetQuery}
              onChangeText={setSheetQuery}
              placeholder="Cari satuan"
            />
            {addable.length === 0 ? (
              <Text style={styles.sheetEmpty}>
                {satuanMaster.length === 0
                  ? 'Daftar satuan tidak terbaca. Tutup, lalu coba lagi.'
                  : 'Semua satuan yang cocok sudah dipakai barang ini.'}
              </Text>
            ) : (
              addable.map((m) => (
                <RamahSheetOption
                  key={m.id}
                  label={m.nama ?? ''}
                  selected={false}
                  onPress={() => setSheet({ ...sheet, idSatuan: m.id ?? null, err: '' })}
                />
              ))
            )}
          </View>
        ) : (
          <View style={styles.sheetForm}>
            <RamahField
              label={`Isi per ${namaOf(sheet.idSatuan)}`}
              required
              value={sheet.faktor}
              onChangeText={(v) => setSheet({ ...sheet, faktor: v.replace(/[^0-9]/g, ''), err: '' })}
              keyboardType="number-pad"
              placeholder="40"
              error={sheet.err}
              autoFocus
            />
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Konversi</Text>
              <Text style={styles.previewValue}>
                {sheet.faktor && parseInt(sheet.faktor, 10) > 1
                  ? `1 ${namaOf(sheet.idSatuan)} = ${formatNumber(parseInt(sheet.faktor, 10))} ${namaDasar}`
                  : '—'}
              </Text>
            </View>
            <RamahPrimaryButton
              label="Tambah satuan"
              onPress={addTurunan}
              disabled={!sheet.faktor}
            />
          </View>
        )}
      </RamahSheet>
    </View>
  );
}

/**
 * No top, left or right inset: `app/produk/_layout.tsx` pays all three for the
 * section. The bottom is the dock's and is read in the component, because an
 * inset is a runtime value and is often zero.
 *
 * Step 1 and the confirmation page sit on `surfacePage`, steps 2 and 3 on
 * `surfaceSunken` — which is the board's own choice, and not an accident of
 * drawing: a screen that is only fields is a sheet of paper, while a screen
 * holding cards needs the grey behind them for the cards to be objects at all.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space1,
    paddingBottom: L.space4,
    gap: L.space5,
  },

  intro: { gap: L.related },
  // Title Moderate, not Large: this is a question in words, and Large is for a
  // figure. The bundle already carries the heading tracking.
  introTitle: { ...T.titleModerate, color: C.textTitle },
  introSub: { ...T.bodyModerate, color: C.textBody },

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

  turunanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    paddingLeft: L.cardPad,
    paddingRight: L.space3,
    paddingVertical: L.space3,
  },
  turunanNama: { ...T.titleTiny, color: C.textTitle },
  turunanKonversi: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },

  hargaCard: {
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    borderRadius: R.card,
    paddingVertical: L.cardPadDense,
    paddingHorizontal: L.cardPad,
    gap: L.space3,
  },
  hargaHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: L.space3,
  },
  hargaNama: { ...T.titleTiny, color: C.textTitle, flexShrink: 1 },
  hargaKonversi: { ...T.bodySmall, color: C.textBody, flexShrink: 0 },

  doneContent: {
    paddingHorizontal: L.gutter,
    paddingTop: L.space12,
    paddingBottom: L.space6,
    gap: L.space5,
    alignItems: 'stretch',
  },
  doneMark: {
    width: 72,
    height: 72,
    borderRadius: R.pill,
    backgroundColor: C.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneHead: { gap: L.space2 },
  doneTitle: { ...T.titleModerate, color: C.textTitle },
  doneSub: { ...T.bodyModerate, color: C.textBody },

  saveNote: { ...T.bodySmall, color: C.textBody, paddingBottom: L.space2 },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
  // The confirmation page has two buttons and no hairline above them: nothing is
  // scrolling underneath it to be separated from.
  dockDone: { paddingHorizontal: L.gutter, paddingTop: L.dockPad, gap: L.related },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.stack, paddingBottom: L.space2 },
  sheetLead: { ...T.bodySmall, color: C.textBody },
  sheetEmpty: { ...T.bodySmall, color: C.textMuted, paddingVertical: L.space4 },
  sheetForm: { paddingHorizontal: L.gutter, gap: L.space5, paddingBottom: L.space2 },

  preview: { backgroundColor: C.grey50, borderRadius: R.card, padding: L.cardPad, gap: L.inline },
  previewLabel: { ...T.bodySmall, color: C.textBody },
  previewValue: { ...T.titleTiny, color: C.textTitle },
});
