/**
 * Supplier — the create form.
 *
 * The form was always taller than a dialog wanted to be; as a route it scrolls
 * with the page. Saving lands on the new supplier via `replace`, so backing out
 * of it returns to the list rather than to a filled-in form.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { BackButton, Card, PrimaryButton, SecondaryButton } from '@/components/shell/ui';
import {
  EMPTY_SUPPLIER,
  SupplierFormFields,
  SUPPLIER_NEW_NOTE,
  type SupplierFormValues,
} from '@/components/supplier/form';
import { Box } from '@/components/ui/box';
import { Text as UIText } from '@/components/ui/text';
import { Colors as C } from '@/constants/theme-erp';
import { useCanWrite } from '@/services/permissions';
import { addSupplier, kodeTaken } from '@/stores/supplier';

export default function SupplierBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('supplier');

  const [values, setValues] = useState<SupplierFormValues>(EMPTY_SUPPLIER);
  const [err, setErr] = useState('');

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/supplier');
  }

  function save() {
    const nama = values.nama.trim();
    if (!nama) return setErr('400 — nama wajib diisi.');
    const kode = values.kode.trim();
    if (!kode) return setErr('400 — kode supplier wajib diisi.');
    if (kodeTaken(kode)) return setErr(`409 — kode ${kode} sudah dipakai supplier lain.`);

    const created = addSupplier({
      kode,
      nama,
      tipe: values.tipe,
      narahubung: values.narahubung.trim(),
      telepon: values.telepon.trim(),
      email: values.email.trim(),
      npwp: values.npwp.trim(),
      kota: values.kota.trim(),
      alamat: values.alamat.trim(),
      tempo: parseInt(values.tempo || '0', 10) || 0,
    });
    router.replace({ pathname: '/supplier/[id]', params: { id: created.id, baru: '1' } });
  }

  return (
    <AppShell title="Supplier">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <View style={styles.head}>
          <BackButton onPress={goBack} />
          <Text style={styles.title}>Supplier baru</Text>
        </View>

        {/* Capped rather than stretched: a form is read down a column, and a
            single field the width of a tablet is harder to fill in than one at 640. */}
        <Card className="w-full max-w-[640px]">
          <Box className="gap-1 border-b border-line-light px-5 pb-4 pt-5">
            <UIText className="text-[17px] font-bold text-foreground">Data supplier</UIText>
            <UIText className="text-[13.5px] text-muted-foreground">{SUPPLIER_NEW_NOTE}</UIText>
          </Box>

          <SupplierFormFields
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
            {canWrite && <PrimaryButton label="Simpan supplier" onPress={save} />}
          </Box>
        </Card>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
});
