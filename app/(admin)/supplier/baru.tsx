/**
 * Supplier — the create form.
 *
 * Saving lands on the new supplier via `replace`, so backing out of that record
 * returns to the list rather than to a filled-in form that would happily create
 * a second copy.
 *
 * The client-side duplicate check went away with the in-memory dataset: `kode`
 * is unique case-insensitively and only the server can say whether one is taken,
 * so a duplicate comes back as a 409 that names it. Guessing here would have
 * meant reading the whole table first to be wrong less often.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import { BackButton, Card, PrimaryButton, SecondaryButton } from '@/components/shell/ui';
import {
  EMPTY_SUPPLIER,
  SUPPLIER_NOTE,
  SupplierFormFields,
  type SupplierFormValues,
} from '@/components/supplier/form';
import { Box } from '@/components/ui/box';
import { Text as UIText } from '@/components/ui/text';
import { Colors as C } from '@/constants/theme-erp';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { createSupplier, supplierBus } from '@/services/supplier';

export default function SupplierBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('supplier');

  const [values, setValues] = useState<SupplierFormValues>(EMPTY_SUPPLIER);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/supplier');
  }

  async function save() {
    if (saving) return;
    const nama = values.nama.trim();
    // The only field the contract requires. `kode` used to be mandatory here
    // because the mock keyed its rows by it; the server lets several suppliers
    // share no code at all.
    if (!nama) return setErr('Nama wajib diisi.');

    setSaving(true);
    try {
      const created = await createSupplier({
        kode: values.kode.trim() || null,
        nama,
        telepon: values.telepon.trim() || null,
        alamat: values.alamat.trim() || null,
        npwp: values.npwp.trim() || null,
      });
      // A new supplier has no row for the list to patch and could land on any
      // page of it, so the list re-reads the page it is on while the reader
      // moves to the record itself.
      supplierBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/supplier/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 is a duplicate kode; the server names it.
      setErr(messageOf(e, 'Gagal menyimpan supplier.'));
    } finally {
      setSaving(false);
    }
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
            <UIText className="text-[13.5px] text-muted-foreground">{SUPPLIER_NOTE}</UIText>
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
            {/* The real guard is the server's; hiding the button keeps a reader
                from filling in a form that was always going to be refused. */}
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
