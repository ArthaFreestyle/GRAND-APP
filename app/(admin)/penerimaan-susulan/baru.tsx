/**
 * Penerimaan susulan — typing a new document.
 *
 * `POST /penerimaan-susulan` takes the header **and** its lines in one body and
 * always creates a `DRAFT`. So this page saves once and lands on the document it
 * made; submitting it for approval is a decision taken on the detail, and
 * deliberately not folded into a "simpan & ajukan" button that would make an
 * irreversible flow feel like a save.
 *
 * ### The source invoice is the form
 *
 * Everything else on this screen follows from `id_pembelian`. The supplier and
 * the ruang are copied from it and are not fields; the lines can only be its
 * lines; the per-line ceiling is its remainder; the value is its harga pokok.
 * So the invoice is chosen first and everything else is read from
 * `GET /pembelian/{id}` — one request, which also happens to be the only way to
 * learn the ceilings, since the list payload carries no lines.
 *
 * Only `POSTED` invoices are offered, and by default only those still short.
 * Before posting a line has no harga pokok to copy and no settled remainder; and
 * an invoice with nothing outstanding has nothing that could arrive late. The
 * filter can be dropped, because "everything arrived" is a cache that a
 * cancelled susulan can move.
 *
 * `?idPembelian=…` arrives from the invoice's own detail — the way this document
 * is actually reached most of the time, off a chase-up list of short lines. It
 * is read **once** on the way in: it seeds the screen rather than driving it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  barisSumber,
  draftsBaru,
  nilaiTurunan,
  turunanToInput,
  TurunanLineEditor,
  type TurunanDraft,
} from '@/components/pembelian/turunan';
import { AppShell } from '@/components/shell/AppShell';
import { SearchPicker, type PickerOption } from '@/components/shell/search-picker';
import {
  Card,
  CardHead,
  CheckBox,
  ErrorBanner,
  Field,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from '@/components/shell/ui';
import { Colors as C, rp, tanggal, todayISO } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { getPembelian, listPembelian, type PembelianDoc } from '@/services/pembelian';
import { createSusulan, susulanBus } from '@/services/penerimaan-susulan';
import { useCanWrite } from '@/services/permissions';

const PICKER_SIZE = 8;

export default function PenerimaanSusulanBaruScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ idPembelian?: string }>();
  const canWrite = useCanWrite('penerimaan-susulan');

  // Read once, on the way in: the parameter seeds this screen rather than
  // driving it, so changing the invoice does not have to rewrite the URL.
  const seeded = useRef(Number(params.idPembelian));

  const [sumber, setSumber] = useState<PembelianDoc | null>(null);
  const [sumberLoading, setSumberLoading] = useState(Number.isFinite(seeded.current));
  const [sumberErr, setSumberErr] = useState('');
  const [drafts, setDrafts] = useState<TurunanDraft[]>([]);

  const [tanggalDok, setTanggalDok] = useState(todayISO());
  const [keterangan, setKeterangan] = useState('');
  // Off by default: an invoice whose delivery was complete has no remainder, so
  // it would land on an empty line list. On, for the case where a susulan was
  // cancelled and the remainder came back.
  const [semuaFaktur, setSemuaFaktur] = useState(false);

  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Loads one invoice and rebuilds the line list from it. The ceilings live only
   * on `GET /pembelian/{id}`; the list payload has no `detail` at all, by
   * contract, so there is no shortcut that skips this read.
   */
  const pilihSumber = useCallback(async (id: number) => {
    setSumberLoading(true);
    setSumberErr('');
    setErr('');
    try {
      const doc = await getPembelian(id);
      setSumber(doc);
      setDrafts(draftsBaru(barisSumber(doc, 'susulan')));
    } catch (e) {
      setSumber(null);
      setDrafts([]);
      setSumberErr(messageOf(e, 'Gagal memuat faktur asal.'));
    } finally {
      setSumberLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Number.isFinite(seeded.current)) void pilihSumber(seeded.current);
  }, [pilihSumber]);

  const cariFaktur = useCallback(
    async (term: string): Promise<PickerOption[]> => {
      const page = await listPembelian({
        search: term || undefined,
        size: PICKER_SIZE,
        status: 'POSTED',
        statusPenerimaan: semuaFaktur ? undefined : 'KURANG',
      });
      return page.data.map((p) => ({
        value: String(p.id),
        label: p.nomor,
        sub: `${p.namaSupplier} · ${tanggal(p.tanggal)}${
          p.noFakturSupplier ? ` · faktur ${p.noFakturSupplier}` : ''
        }`,
      }));
    },
    [semuaFaktur]
  );

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching sections instead of popping this
    // screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penerimaan-susulan');
  }

  async function save() {
    if (saving || !sumber) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalDok)) {
      return setErr('Tanggal dokumen harus dalam format YYYY-MM-DD.');
    }
    const detail = turunanToInput(drafts, 'susulan');
    if (!detail.ok) return setErr(detail.error);

    setSaving(true);
    try {
      const created = await createSusulan({
        id_pembelian: sumber.id,
        tanggal: tanggalDok,
        keterangan: keterangan.trim() || null,
        detail: detail.detail,
      });
      // A new document lands wherever its date puts it in a list sorted by
      // date, so there is no row to patch — the list re-reads while the reader
      // moves on to the document itself.
      susulanBus.publish({ kind: 'reload' });
      router.replace({
        pathname: '/penerimaan-susulan/[id]',
        params: { id: created.id, baru: '1' },
      });
    } catch (e) {
      // 409 here is the source invoice having left POSTED, or a line's
      // remainder having been consumed by another susulan first. The server
      // names which.
      setErr(messageOf(e, 'Gagal menyimpan kiriman susulan.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Kiriman susulan baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <Text style={styles.headNote}>
          Tersimpan sebagai DRAFT · nomor dibuat server · menambah stok, tidak menambah utang
        </Text>

        <Card>
          <CardHead title="Faktur asal" />
          <View style={styles.fields}>
            {sumber ? (
              <>
                <View style={styles.sumberBox}>
                  <Text style={styles.sumberNomor}>{sumber.nomor}</Text>
                  <Text style={styles.sumberMeta}>
                    {sumber.namaSupplier} · ruang {sumber.namaRuang} · {tanggal(sumber.tanggal)}
                  </Text>
                  <Text style={styles.sumberNote}>
                    Supplier dan ruang disalin dari faktur ini, bukan dipilih. Barang yang perlu
                    pindah ruang setelah diterima adalah pekerjaan mutasi.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <GhostButton
                    label="Ganti faktur"
                    onPress={() => {
                      setSumber(null);
                      setDrafts([]);
                      setErr('');
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <Field
                  label="Faktur pembelian"
                  hint="Hanya faktur POSTED — sebelum diposting barisnya belum punya harga pokok untuk disalin.">
                  <SearchPicker
                    chosen={null}
                    onPick={(o) => void pilihSumber(Number(o.value))}
                    search={cariFaktur}
                    placeholder="Cari nomor dokumen atau no. faktur supplier"
                    emptyHint={
                      semuaFaktur
                        ? 'Tidak ada faktur POSTED yang cocok.'
                        : 'Tidak ada faktur POSTED yang kirimannya masih kurang.'
                    }
                  />
                </Field>
                <CheckBox
                  label="Tampilkan juga faktur yang kirimannya sudah lengkap"
                  checked={semuaFaktur}
                  onPress={() => setSemuaFaktur((v) => !v)}
                />
                {sumberLoading && <ActivityIndicator color={C.primary} />}
                <ErrorBanner message={sumberErr} />
              </>
            )}
          </View>
        </Card>

        {sumber && (
          <>
            <Card>
              <CardHead title="Header dokumen" />
              <View style={styles.fields}>
                <Field label="Tanggal dokumen" hint="Menentukan bulan penomoran dan periodenya.">
                  <TextField
                    value={tanggalDok}
                    onChangeText={(v) => {
                      setTanggalDok(v);
                      setErr('');
                    }}
                    placeholder="YYYY-MM-DD"
                    mono
                  />
                </Field>
                <Field
                  label="Keterangan"
                  hint="Opsional. Nomor surat jalan kiriman kedua biasanya yang paling dicari nanti.">
                  <TextField
                    value={keterangan}
                    onChangeText={setKeterangan}
                    placeholder="Sisa 5 dus datang menyusul, SJ 00214"
                    multiline
                  />
                </Field>
              </View>
            </Card>

            <TurunanLineEditor drafts={drafts} onChange={setDrafts} mode="susulan" editable />

            <View style={{ alignItems: 'flex-end' }}>
              <Card className="w-[420px] max-w-full gap-2.5 p-4">
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Nilai barang menyusul</Text>
                  <Text style={styles.totalValue}>{rp(nilaiTurunan(drafts))}</Text>
                </View>
                <Text style={styles.totalNote}>
                  Nilai persediaan yang masuk, bukan tagihan — fakturnya sudah terbit penuh di
                  kiriman pertama. Dihitung dari harga pokok baris fakturnya dan dihitung ulang
                  oleh server saat disimpan.
                </Text>
                <ErrorBanner message={err} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <SecondaryButton label="Batal" onPress={goBack} tone="text-dark2" />
                  {/* The real guard is the server's; hiding the button keeps a
                      reader from filling in a form that was always refused. */}
                  {canWrite && (
                    <PrimaryButton label={saving ? 'Menyimpan…' : 'Simpan draft'} onPress={save} />
                  )}
                </View>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, gap: 16 },
  headNote: { fontSize: 13, color: C.muted2, lineHeight: 18 },
  fields: { padding: 16, gap: 14 },
  sumberBox: { gap: 4 },
  sumberNomor: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace', color: C.text },
  sumberMeta: { fontSize: 14, color: C.dark2 },
  sumberNote: { fontSize: 12.5, color: C.muted3, lineHeight: 18, marginTop: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  totalValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.2, color: C.text },
  totalNote: { fontSize: 12, color: C.muted2, lineHeight: 16 },
});
