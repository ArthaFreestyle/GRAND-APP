/**
 * Pembelian — typing a new document.
 *
 * `POST /pembelian` takes the header **and** its lines in one body and always
 * creates a `DRAFT`: `status` is not a field, and nothing here moves stock. So
 * this page saves once and lands on the document it made; submitting it for
 * approval is a decision taken on the detail, deliberately not folded into a
 * "simpan & ajukan" button that would make an irreversible flow feel like a
 * save.
 *
 * The document number is not typed and not previewed. The server generates it
 * (`BL/KODE/2026/08/0001`, reset monthly by the document's own `tanggal`, with
 * `KODE` belonging to the unit kerja over the chosen ruang), and guessing at it
 * here would mean showing a number that may not be the one stored.
 *
 * The totals in the summary are a **preview**. `subtotal`, `total`, and
 * `biaya_angkut` are all recomputed server-side from the lines; what is shown
 * while typing is this screen's own arithmetic over the same inputs, and the
 * document that comes back is the one that counts.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  createBody,
  EMPTY_HEADER,
  pakaiKoli,
  PembelianHeaderFields,
  type PembelianHeaderValues,
} from '@/components/pembelian/form';
import {
  emptyLine,
  linesSubtotal,
  linesToInput,
  PembelianLineEditor,
  type LineDraft,
} from '@/components/pembelian/lines';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card,
  CardHead,
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
} from '@/components/shell/ui';
import { Colors as C, rp } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { numericToDecimal, rupiahToDecimal, rupiahToDecimalSigned } from '@/services/decimal';
import { createPembelian, pembelianBus } from '@/services/pembelian';
import { useCanWrite } from '@/services/permissions';

export default function PembelianBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('pembelian');

  const [values, setValues] = useState<PembelianHeaderValues>(EMPTY_HEADER);
  // Lazy: the initializer argument of `useState` is evaluated on every render
  // whether or not it is used, and `emptyLine()` hands out a fresh key each time.
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pembelian');
  }

  async function save() {
    if (saving) return;
    const detail = linesToInput(lines);
    if (!detail.ok) return setErr(detail.error);
    const body = createBody(values, detail.detail);
    if (!body.ok) return setErr(body.error);

    setSaving(true);
    try {
      const created = await createPembelian(body.body);
      // A new document has no row for the list to patch and lands wherever its
      // date puts it, so the list re-reads the page it is on while the reader
      // moves to the document itself.
      pembelianBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pembelian/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 is a duplicate `no_faktur_supplier` for this supplier — the one
      // guard against the same nota being entered, and stocked, twice. The
      // server names it.
      setErr(messageOf(e, 'Gagal menyimpan dokumen pembelian.'));
    } finally {
      setSaving(false);
    }
  }

  const subtotal = linesSubtotal(lines);
  const diskon = Number(rupiahToDecimal(values.diskonNota || '0'));
  const ppn = Number(rupiahToDecimal(values.ppn || '0'));
  const pembulatan = Number(rupiahToDecimalSigned(values.pembulatan || '0'));
  const total = subtotal - diskon + ppn + pembulatan;
  const angkut = values.ditanggungSupplier
    ? 0
    : Number(numericToDecimal(values.totalKoli) ?? '0') *
      Number(rupiahToDecimal(values.tarifPerKoli || '0'));

  return (
    <AppShell title="Faktur baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <Text style={styles.headNote}>Tersimpan sebagai DRAFT · nomor dibuat server</Text>

        <Card>
          <CardHead title="Header dokumen" />
          <PembelianHeaderFields
            isNew
            values={values}
            onChange={(patch) => {
              setValues((v) => ({ ...v, ...patch }));
              setErr('');
            }}
            error=""
          />
        </Card>

        <PembelianLineEditor
          lines={lines}
          onChange={setLines}
          idSupplier={values.idSupplier}
          pakaiKoli={pakaiKoli(values)}
          editable
        />

        <View style={{ alignItems: 'flex-end' }}>
          <Card className="w-[420px] max-w-full gap-2.5 p-4">
            <SumRow label="Subtotal baris" value={rp(subtotal)} />
            <SumRow label="Diskon nota" value={`− ${rp(diskon)}`} />
            <SumRow label="PPN" value={rp(ppn)} />
            <SumRow label="Pembulatan" value={rp(pembulatan)} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total faktur</Text>
              <Text style={styles.totalValue}>{rp(total)}</Text>
            </View>
            <View style={styles.angkutRow}>
              <Text style={styles.angkutLabel}>Biaya angkut</Text>
              <Text style={styles.angkutValue}>{rp(angkut)}</Text>
            </View>
            <Text style={styles.angkutNote}>
              Di luar total — itu tagihan ekspedisi, bukan utang ke supplier. Angka di atas dihitung
              ulang oleh server saat disimpan.
            </Text>
            <ErrorBanner message={err} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <SecondaryButton label="Batal" onPress={goBack} tone="text-dark2" />
              {/* The real guard is the server's; hiding the button keeps a reader
                  from filling in a form that was always going to be refused. */}
              {canWrite && (
                <PrimaryButton label={saving ? 'Menyimpan…' : 'Simpan draft'} onPress={save} />
              )}
            </View>
          </Card>
        </View>
      </ScrollView>
    </AppShell>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  headNote: { fontSize: 13, color: C.muted2 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sumLabel: { fontSize: 14, color: C.muted3 },
  sumValue: { fontSize: 15, color: C.dark2 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingTop: 10,
  },
  totalLabel: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  totalValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.2, color: C.text },
  angkutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  angkutLabel: { fontSize: 13.5, color: C.muted3 },
  angkutValue: { fontSize: 15, fontWeight: '600', color: C.dark2 },
  angkutNote: { fontSize: 12, color: C.muted2, lineHeight: 16 },
});
