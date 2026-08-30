/**
 * Pelanggan — the create form.
 *
 * The form was already page-sized; it was in a dialog because there was no
 * route to put it on. Saving lands on the new customer via `replace`, so
 * backing out of that record returns to the list rather than to a filled-in
 * form that would happily create a second copy.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import {
  EMPTY_PELANGGAN,
  PelangganFormFields,
  PLAFON_NOTE,
  type PelangganFormValues,
} from '@/components/pelanggan/form';
import { AppShell } from '@/components/shell/AppShell';
import { Card, PrimaryButton, SecondaryButton } from '@/components/shell/ui';
import { Box } from '@/components/ui/box';
import { Text as UIText } from '@/components/ui/text';
import { messageOf } from '@/services/api';
import { rupiahToDecimal } from '@/services/decimal';
import { createPelanggan, pelangganBus } from '@/services/pelanggan';
import { useCanWrite } from '@/services/permissions';

export default function PelangganBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('pelanggan');

  const [values, setValues] = useState<PelangganFormValues>(EMPTY_PELANGGAN);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/pelanggan');
  }

  async function save() {
    if (saving) return;
    const nama = values.nama.trim();
    if (!nama) return setErr('Nama wajib diisi.');

    setSaving(true);
    try {
      const created = await createPelanggan({
        kode: values.kode.trim() || null,
        nama,
        telepon: values.telepon.trim() || null,
        alamat: values.alamat.trim() || null,
        npwp: values.npwp.trim() || null,
        plafon_kredit: values.tanpaBatas ? null : rupiahToDecimal(values.plafon),
      });
      // A new customer has no row for the list to patch and could land on any
      // page of it, so the list re-reads the page it is on while the reader
      // moves to the record itself.
      pelangganBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/pelanggan/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 is a duplicate kode; the server names it.
      setErr(messageOf(e, 'Gagal menyimpan pelanggan.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Pelanggan baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        {/* Capped rather than stretched: a form is read down a column, and a
            single field the width of a tablet is harder to fill in than one at 640. */}
        <Card className="w-full max-w-[640px]">
          <Box className="gap-1 border-b border-line-light px-5 pb-4 pt-5">
            <UIText className="text-[17px] font-bold text-foreground">Data pelanggan</UIText>
            <UIText className="text-[13.5px] text-muted-foreground">{PLAFON_NOTE}</UIText>
          </Box>

          <PelangganFormFields
            isNew
            values={values}
            onChange={(patch) => {
              setValues((v) => ({ ...v, ...patch }));
              setErr('');
            }}
            error={err}
          />

          <Box className="flex-row justify-end gap-2.5 border-t border-line-light bg-thead px-5 py-4">
            <SecondaryButton label="Batal" onPress={goBack} tone="text-dark2" />
            {/* The real guard is the server's; hiding the button keeps a reader
                from filling in a form that was always going to be refused. */}
            {canWrite && <PrimaryButton label="Simpan pelanggan" onPress={save} />}
          </Box>
        </Card>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, gap: 16 },
});
