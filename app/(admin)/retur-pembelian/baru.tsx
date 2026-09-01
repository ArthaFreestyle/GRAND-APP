/**
 * Retur pembelian — typing a new document.
 *
 * `POST /retur-pembelian` takes the header **and** its lines in one body and
 * always creates a `DRAFT`. So this page saves once and lands on the document it
 * made; submitting it for approval is a decision taken on the detail, and
 * deliberately not folded into a "simpan & ajukan" button that would make an
 * irreversible flow feel like a save.
 *
 * The source invoice is the form, exactly as it is for a penerimaan susulan:
 * supplier and ruang are copied from it, the lines can only be its lines, the
 * per-line ceiling and the value both come from it. Only `POSTED` invoices are
 * offered — before posting there is no harga pokok to copy, and nothing has
 * arrived that could be sent back.
 *
 * **What is returnable is what arrived**, `qty_diterima_dasar + POSTED susulan −
 * POSTED retur`. Note which quantity is missing: `qty_dasar`, what the supplier
 * invoiced. Goods that never turned up cannot be shipped back — a short delivery
 * is chased with a penerimaan susulan, and this screen will not offer a line
 * whose only outstanding quantity is one that never arrived.
 *
 * `alasan` is nullable in the schema and required here, because it is the only
 * record of why goods that were already paid for went back, and it is what gets
 * read out to the supplier.
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
import { useCanWrite } from '@/services/permissions';
import { createRetur, returBus } from '@/services/retur-pembelian';

const PICKER_SIZE = 8;

export default function ReturPembelianBaruScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ idPembelian?: string }>();
  const canWrite = useCanWrite('retur-pembelian');

  // Read once, on the way in: the parameter seeds this screen rather than
  // driving it, so changing the invoice does not have to rewrite the URL.
  const seeded = useRef(Number(params.idPembelian));

  const [sumber, setSumber] = useState<PembelianDoc | null>(null);
  const [sumberLoading, setSumberLoading] = useState(Number.isFinite(seeded.current));
  const [sumberErr, setSumberErr] = useState('');
  const [drafts, setDrafts] = useState<TurunanDraft[]>([]);

  const [tanggalDok, setTanggalDok] = useState(todayISO());
  const [alasan, setAlasan] = useState('');

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
      setDrafts(draftsBaru(barisSumber(doc, 'retur')));
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

  // No `status_penerimaan` filter here, unlike the susulan form: a return is
  // about what arrived, and a complete delivery is the *most* likely thing to
  // send back, not the least.
  const cariFaktur = useCallback(async (term: string): Promise<PickerOption[]> => {
    const page = await listPembelian({
      search: term || undefined,
      size: PICKER_SIZE,
      status: 'POSTED',
    });
    return page.data.map((p) => ({
      value: String(p.id),
      label: p.nomor,
      sub: `${p.namaSupplier} · ${tanggal(p.tanggal)}${
        p.noFakturSupplier ? ` · faktur ${p.noFakturSupplier}` : ''
      }`,
    }));
  }, []);

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching sections instead of popping this
    // screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/retur-pembelian');
  }

  async function save() {
    if (saving || !sumber) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalDok)) {
      return setErr('Tanggal dokumen harus dalam format YYYY-MM-DD.');
    }
    if (alasan.trim() === '') {
      return setErr('Alasan retur wajib diisi — itu yang dibacakan ke supplier.');
    }
    const detail = turunanToInput(drafts, 'retur');
    if (!detail.ok) return setErr(detail.error);

    setSaving(true);
    try {
      const created = await createRetur({
        id_pembelian: sumber.id,
        tanggal: tanggalDok,
        alasan: alasan.trim(),
        detail: detail.detail,
      });
      // A new document lands wherever its date puts it in a list sorted by
      // date, so there is no row to patch — the list re-reads while the reader
      // moves on to the document itself.
      returBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/retur-pembelian/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 here is the source invoice having left POSTED, or another return
      // having consumed the returnable quantity first. The server names which.
      setErr(messageOf(e, 'Gagal menyimpan retur pembelian.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Retur baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <Text style={styles.headNote}>
          Tersimpan sebagai DRAFT · nomor dibuat server · hanya barang yang benar-benar datang
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
                    Supplier dan ruang disalin dari faktur ini. Barang yang perlu dikembalikan dari
                    ruang lain harus dimutasi ke sini lebih dulu.
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
                  hint="Hanya faktur POSTED — sebelum diposting belum ada barang yang datang untuk dikirim balik.">
                  <SearchPicker
                    chosen={null}
                    onPick={(o) => void pilihSumber(Number(o.value))}
                    search={cariFaktur}
                    placeholder="Cari nomor dokumen atau no. faktur supplier"
                    emptyHint="Tidak ada faktur POSTED yang cocok."
                  />
                </Field>
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
                  label="Alasan retur"
                  hint="Wajib. Satu-satunya catatan kenapa barang yang sudah dibayar dikirim balik — dan yang dibacakan ke supplier.">
                  <TextField
                    value={alasan}
                    onChangeText={(v) => {
                      setAlasan(v);
                      setErr('');
                    }}
                    placeholder="Barang rusak saat diterima, segel dus sobek"
                    multiline
                  />
                </Field>
              </View>
            </Card>

            <TurunanLineEditor drafts={drafts} onChange={setDrafts} mode="retur" editable />

            <View style={{ alignItems: 'flex-end' }}>
              <Card className="w-[420px] max-w-full gap-2.5 p-4">
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Nilai barang keluar</Text>
                  <Text style={styles.totalValue}>{rp(nilaiTurunan(drafts))}</Text>
                </View>
                <Text style={styles.totalNote}>
                  Nilai persediaan menurut harga pokok faktur. Yang dikreditkan supplier lebih kecil
                  — harga pokok memuat porsi ongkir yang dibayar ke ekspedisi — dan baru dihitung
                  saat dokumen diposting.
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
