/**
 * Master Produk — the create form.
 *
 * A page-sized form that used to be shown in a dialog because there was no
 * route to put it on. As a route it gets the Android back button, an address of
 * its own, and room to breathe on a tablet.
 *
 * Saving lands on the new product's detail via `replace`, not `push`: the form
 * is finished with, and backing out of a record onto the form that created it
 * would invite a second copy of the same product.
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductFormFields, Toast, type ProductFormValues } from '@/components/produk/modals';
import { AppShell } from '@/components/shell/AppShell';
import { Card, PrimaryButton, SecondaryButton } from '@/components/shell/ui';
import { Box } from '@/components/ui/box';
import { Text as UIText } from '@/components/ui/text';
import { ProdukColors as C } from '@/constants/produk';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { createProduct, listSatuan, produkBus } from '@/services/produk';
import type { components } from '@/types/api';

const EMPTY: ProductFormValues = {
  kode: '',
  nama: '',
  stokMin: '0',
  aktif: true,
  idDasar: null,
};

export default function ProdukBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('produk');

  const [values, setValues] = useState<ProductFormValues>(EMPTY);
  const [satuanMaster, setSatuanMaster] = useState<components['schemas']['Satuan'][]>([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    listSatuan()
      .then((list) => {
        setSatuanMaster(list);
        // Pre-selected rather than left blank: nearly every product uses the
        // first unit in the master, and an unset picker is one more thing to
        // fail validation on.
        setValues((v) => (v.idDasar === null ? { ...v, idDasar: list[0]?.id ?? null } : v));
      })
      .catch(() => {
        setToastMsg('Daftar satuan gagal dimuat — satuan dasar tidak bisa dipilih.');
      });
  }, []);

  const satuanMasterOptions = useMemo(
    () => satuanMaster.map((x) => ({ value: String(x.id), label: x.nama ?? '' })),
    [satuanMaster]
  );

  function goBack() {
    // Deep-linked straight onto the form there is nothing to pop back to.
    if (router.canGoBack()) router.back();
    else router.replace('/produk');
  }

  async function save() {
    if (saving) return;
    const nama = values.nama.trim();
    if (!nama) return setErr('Nama wajib diisi.');
    const kode = values.kode.trim();
    if (!kode) return setErr('Kode barang wajib diisi.');
    if (!values.idDasar) return setErr('Pilih satuan dasar dulu.');
    const stokMin = parseInt(values.stokMin || '0', 10);
    if (Number.isNaN(stokMin) || stokMin < 0) {
      return setErr('Stok minimum harus bilangan bulat ≥ 0.');
    }

    setSaving(true);
    try {
      const created = await createProduct({
        kode_barang: kode,
        nama,
        id_satuan_dasar: values.idDasar,
        stok_minimum: stokMin,
      });
      // A new product has no row for the list to patch, and no position this
      // screen could honestly guess - `GET /product` has no sort parameter - so
      // the list re-reads its first page while the reader moves on to the
      // record. `baru=1` is what makes the detail explain the satuan dasar that
      // was registered along with it.
      produkBus.publish({ kind: 'reload' });
      router.replace({ pathname: '/produk/[id]', params: { id: created.id, baru: '1' } });
    } catch (e) {
      // 409 is the duplicate kode_barang; the server's message names it.
      setErr(messageOf(e, 'Gagal menyimpan produk.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Master Produk">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <View style={styles.head}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Daftar</Text>
          </Pressable>
          <Text style={styles.title}>Produk baru</Text>
        </View>

        {/* Capped rather than stretched: a form is read down a column, and a
            single field 900pt wide is harder to fill in than one at 640. */}
        <Card className="w-full max-w-[640px]">
          <Box className="gap-1 border-b border-line-light px-5 pb-4 pt-5">
            <UIText className="text-[17px] font-bold text-foreground">Data produk</UIText>
            <UIText className="text-[13.5px] text-muted-foreground">
              Produk dan satuan dasarnya ditulis dalam satu transaksi — satuan dasar terdaftar
              otomatis dengan faktor 1.
            </UIText>
          </Box>

          <ProductFormFields
            isNew
            values={values}
            onChange={(patch) => {
              setValues((v) => ({ ...v, ...patch }));
              setErr('');
            }}
            satuanMasterOptions={satuanMasterOptions}
            satuanDasarLabel=""
            error={err}
          />

          <Box className="flex-row justify-end gap-2.5 border-t border-line-light bg-thead px-5 py-4">
            <SecondaryButton label="Batal" onPress={goBack} tone="text-dark2" />
            {/* The role guard is the server's; hiding the button keeps a reader
                from filling in a form that was always going to be refused. */}
            {canWrite && <PrimaryButton label="Simpan produk" onPress={save} />}
          </Box>
        </Card>
      </ScrollView>
      <Toast message={toastMsg} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: { padding: 22, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  backBtn: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
});
