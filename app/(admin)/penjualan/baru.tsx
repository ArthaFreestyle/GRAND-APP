/**
 * Penjualan — typing a new nota.
 *
 * `POST /penjualan` takes the header **and** its lines in one body and always
 * creates a `DRAFT`: `status` is not a field, and nothing here moves stock. So
 * this page saves once and lands on the nota it made; posting it is a decision
 * taken on the detail, deliberately not folded into a "simpan & posting" button
 * that would make an irreversible write feel like a save.
 *
 * The lines may genuinely be empty here — the contract expects a nota to be
 * opened while the goods are still being scanned — and only posting refuses a
 * document without them. So this form saves an empty draft without complaint
 * and says so, instead of inventing a rule the server does not have.
 *
 * The document number is not typed and not previewed. The server generates it
 * (`PJ/KODE/2026/08/0001`, reset monthly by the nota's own `tanggal`, with
 * `KODE` belonging to the unit kerja over the chosen ruang), and guessing at it
 * here would mean showing a number that may not be the one stored.
 *
 * The totals in the summary are a **preview**: `subtotal` and `total` are
 * recomputed server-side from the lines, and the document that comes back is the
 * one that counts.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  createBody,
  EMPTY_HEADER,
  PenjualanHeaderFields,
  type PenjualanHeaderValues,
} from '@/components/penjualan/form';
import {
  emptyLine,
  linesSubtotal,
  linesToInput,
  PenjualanLineEditor,
  type LineDraft,
} from '@/components/penjualan/lines';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardHead, ErrorBanner, PrimaryButton, SecondaryButton } from '@/components/shell/ui';
import { Colors as C, rp } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { rupiahToDecimal, rupiahToDecimalSigned } from '@/services/decimal';
import { createPenjualan, penjualanBus } from '@/services/penjualan';
import { useCanWrite } from '@/services/permissions';

export default function PenjualanBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('penjualan');

  const [values, setValues] = useState<PenjualanHeaderValues>(EMPTY_HEADER);
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
    else router.replace('/penjualan');
  }

  async function save() {
    if (saving) return;
    // An untouched first line is not a line somebody meant to type — it is the
    // one the form opened with. Dropping it is what lets an empty draft be
    // saved, which the contract explicitly allows.
    const isi = lines.filter((l) => l.idProduct !== null);
    const detail = isi.length === 0 ? { ok: true as const, detail: [] } : linesToInput(isi, values.tanggal);
    if (!detail.ok) return setErr(detail.error);
    const body = createBody(values, detail.detail);
    if (!body.ok) return setErr(body.error);

    setSaving(true);
    try {
      const created = await createPenjualan(body.body);
      // A new nota has no row for the list to patch and lands wherever its date
      // puts it, so the list re-reads the page it is on while the reader moves
      // to the document itself.
      penjualanBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/penjualan/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 here is a period already closed or a ruang frozen by a stock take —
      // the server names which.
      setErr(messageOf(e, 'Gagal menyimpan nota penjualan.'));
    } finally {
      setSaving(false);
    }
  }

  const subtotal = linesSubtotal(lines);
  const diskon = Number(rupiahToDecimal(values.diskonNota || '0'));
  const pembulatan = Number(rupiahToDecimalSigned(values.pembulatan || '0'));
  const total = subtotal - diskon + pembulatan;

  return (
    <AppShell title="Nota baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <Text style={styles.headNote}>Tersimpan sebagai DRAFT · nomor dibuat server</Text>

        <Card>
          <CardHead title="Header nota" />
          <PenjualanHeaderFields
            values={values}
            onChange={(patch) => {
              setValues((v) => ({ ...v, ...patch }));
              setErr('');
            }}
            error=""
          />
        </Card>

        <PenjualanLineEditor
          lines={lines}
          onChange={setLines}
          tanggal={values.tanggal}
          idRuang={values.idRuang}
          editable
        />

        <View style={{ alignItems: 'flex-end' }}>
          <Card className="w-[420px] max-w-full gap-2.5 p-4">
            <SumRow label="Subtotal baris" value={rp(subtotal)} />
            <SumRow label="Diskon nota" value={`− ${rp(diskon)}`} />
            <SumRow label="Pembulatan" value={rp(pembulatan)} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total nota</Text>
              <Text style={styles.totalValue}>{rp(total)}</Text>
            </View>
            <Text style={styles.note}>
              Dihitung ulang oleh server saat disimpan. Harga pokok dan margin baru terisi saat
              nota diposting, dari kartu stok — bukan dari layar ini.
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
  note: { fontSize: 12, color: C.muted2, lineHeight: 16 },
});
