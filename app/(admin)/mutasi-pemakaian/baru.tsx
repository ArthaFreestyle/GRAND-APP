/**
 * Mutasi & Pemakaian — the entry form.
 *
 * One form for both document kinds; the toggle at the top swaps which one is
 * being written, and switching resets the draft because the destination means
 * something different on each side (a room versus a consuming unit).
 *
 * Saving lands on the stored document via `replace`, so backing out returns to
 * the list rather than to a form still holding items already posted.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  Card,
  CardHead,
  EmptyState,
  ErrorBanner,
  Field,
  OptionPicker,
  PrimaryButton,
  TextField,
  TinyButton,
} from '@/components/shell/ui';
import { Colors as C } from '@/constants/theme-erp';
import { useCanWrite } from '@/services/permissions';
import {
  addTrx,
  PRODS,
  prodNama,
  prodUnit,
  RUANG,
  ruangNama,
  TODAY,
  UNITS,
  type Jenis,
  type TrxItem,
} from '@/stores/mutasi';

interface Draft {
  jenis: Jenis;
  tanggal: string;
  dari: string;
  tujuan: string;
  catatan: string;
  items: TrxItem[];
  /** The item being assembled, above the item table. */
  rowKode: string;
  rowQty: string;
  err: string;
}

function freshDraft(jenis: Jenis): Draft {
  return {
    jenis,
    // A transfer usually starts in the warehouse; consumption is drawn from the
    // shop floor. Both are only defaults, and both pickers stay open.
    dari: String(RUANG[jenis === 'mutasi' ? 1 : 0].id),
    tujuan: String(jenis === 'mutasi' ? RUANG[0].id : UNITS[0].id),
    tanggal: TODAY,
    catatan: '',
    items: [],
    rowKode: '',
    rowQty: '',
    err: '',
  };
}

export default function MutasiBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('mutasi');
  const [draft, setDraft] = useState<Draft>(() => freshDraft('mutasi'));

  const isMutasi = draft.jenis === 'mutasi';

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/mutasi-pemakaian');
  }

  function addRow() {
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) {
      return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    }
    // The same product twice is one line with the quantities added, not two
    // lines the warehouse has to reconcile by eye.
    const exist = draft.items.find((it) => it.kode === draft.rowKode);
    const items = exist
      ? draft.items.map((it) => (it.kode === draft.rowKode ? { kode: it.kode, qty: it.qty + qty } : it))
      : [...draft.items, { kode: draft.rowKode, qty }];
    setDraft({ ...draft, items, rowKode: '', rowQty: '', err: '' });
  }

  function save() {
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    if (draft.jenis === 'mutasi' && draft.dari === draft.tujuan) {
      return setDraft({ ...draft, err: '400 — ruang asal dan tujuan tidak boleh sama.' });
    }
    const created = addTrx({
      jenis: draft.jenis,
      tanggal: draft.tanggal,
      dari: parseInt(draft.dari, 10),
      tujuan: parseInt(draft.tujuan, 10),
      catatan: draft.catatan.trim(),
      items: draft.items,
    });
    router.replace({ pathname: '/mutasi-pemakaian/[id]', params: { id: created.id, baru: '1' } });
  }

  return (
    <AppShell title="Transaksi baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <Text style={{ fontSize: 13.5, color: C.muted2 }}>
          Nomor dokumen dibuat otomatis saat disimpan
        </Text>

        <Card className="gap-3.5 p-4">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['mutasi', 'pemakaian'] as Jenis[]).map((j) => {
              const on = draft.jenis === j;
              return (
                <Pressable
                  key={j}
                  onPress={() => setDraft(freshDraft(j))}
                  style={[
                    styles.jenisToggle,
                    {
                      borderColor: on ? C.primaryTintBorder : C.border,
                      backgroundColor: on ? C.primaryTintBg : '#fff',
                    },
                  ]}>
                  <Text style={{ fontSize: 15.5, fontWeight: '600', color: on ? C.primaryDark : C.dark2 }}>
                    {j === 'mutasi' ? 'Mutasi antar ruang' : 'Pemakaian internal'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: on ? C.primaryDark : C.muted }}>
                    {j === 'mutasi' ? 'Pindah stok antar lokasi' : 'Konsumsi oleh unit kerja'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label="Dari ruang">
                <OptionPicker
                  options={RUANG.map((r) => ({ value: String(r.id), label: r.nama }))}
                  value={draft.dari}
                  onChange={(v) => setDraft({ ...draft, dari: v, err: '' })}
                />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label={isMutasi ? 'Ke ruang' : 'Unit pemakai'}>
                <OptionPicker
                  options={(isMutasi ? RUANG : UNITS).map((r) => ({ value: String(r.id), label: r.nama }))}
                  value={draft.tujuan}
                  onChange={(v) => setDraft({ ...draft, tujuan: v, err: '' })}
                />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Field label="Tanggal">
                <TextField
                  value={draft.tanggal}
                  onChangeText={(v) => setDraft({ ...draft, tanggal: v })}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </View>
          </View>
          <Field label="Catatan (opsional)">
            <TextField
              value={draft.catatan}
              onChangeText={(v) => setDraft({ ...draft, catatan: v })}
              placeholder={
                isMutasi ? 'mis. isi ulang display toko' : 'mis. kebutuhan kantor bulan ini'
              }
            />
          </Field>
        </Card>

        <Card>
          <CardHead title="Item" />
          <View style={styles.addRow}>
            <View style={{ flex: 2, minWidth: 180 }}>
              <Field label="PRODUK">
                <OptionPicker
                  options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))}
                  value={draft.rowKode || null}
                  onChange={(v) => setDraft({ ...draft, rowKode: v, err: '' })}
                />
              </Field>
            </View>
            <View style={{ width: 140 }}>
              <Field label={`QTY (${draft.rowKode ? prodUnit(draft.rowKode) : 'unit'})`}>
                <TextField
                  value={draft.rowQty}
                  onChangeText={(v) => setDraft({ ...draft, rowQty: v, err: '' })}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </Field>
            </View>
            <PrimaryButton label="Tambah" onPress={addRow} />
          </View>
          <View style={styles.itemsHeadRow}>
            <Text style={{ flex: 1 }}>PRODUK</Text>
            <Text style={{ width: 180, textAlign: 'right' }}>QTY</Text>
            <View style={{ width: 80 }} />
          </View>
          {draft.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                {prodNama(it.kode)}
              </Text>
              <Text style={{ width: 180, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>
                {it.qty.toLocaleString('id-ID')} {prodUnit(it.kode)}
              </Text>
              <View style={{ width: 80, alignItems: 'flex-end' }}>
                <TinyButton
                  label="Hapus"
                  danger
                  onPress={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                />
              </View>
            </View>
          ))}
          {draft.items.length === 0 && (
            <EmptyState title="Belum ada item" sub="Pilih produk, isi qty, lalu klik Tambah." />
          )}
        </Card>

        <View style={{ alignItems: 'flex-end' }}>
          <Card className="w-[380px] max-w-full gap-3 p-4">
            <View style={styles.summaryRow}>
              <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total baris item</Text>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{draft.items.length}</Text>
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Efek stok</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.dark2, textAlign: 'right' }}>
                {isMutasi
                  ? `− ${ruangNama(parseInt(draft.dari, 10))}\n+ ${ruangNama(parseInt(draft.tujuan, 10))}`
                  : `− ${ruangNama(parseInt(draft.dari, 10))}\nkeluar untuk unit`}
              </Text>
            </View>
            <ErrorBanner message={draft.err} />
            {canWrite && (
              <PrimaryButton
                label={isMutasi ? 'Simpan mutasi' : 'Catat pemakaian'}
                onPress={save}
              />
            )}
          </Card>
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  newTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  itemsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 38,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  jenisToggle: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    justifyContent: 'center',
    gap: 2,
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
