/**
 * Pembelian — the entry form for a new invoice.
 *
 * Already a full page before this was a route; it just had no address and no
 * back button. Saving lands on the stored invoice via `replace`, so backing out
 * returns to the list rather than to a form still holding the items that were
 * just posted.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/shell/AppShell';
import {
  BackButton,
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
import { Colors as C, addDays, rp, tanggal } from '@/constants/theme-erp';
import { useCanWrite } from '@/services/permissions';
import {
  addFaktur,
  prod,
  prodNama,
  PRODS,
  sup,
  SUPPLIERS,
  TODAY,
  type FakturItem,
} from '@/stores/pembelian';

interface Draft {
  supId: string;
  tanggal: string;
  dibayar: string;
  items: FakturItem[];
  /** The item being assembled, above the item table. */
  rowKode: string;
  rowSatuan: string | null;
  rowQty: string;
  rowHarga: string;
  err: string;
}

const FRESH: Draft = {
  supId: '',
  tanggal: TODAY,
  dibayar: '0',
  items: [],
  rowKode: '',
  rowSatuan: null,
  rowQty: '',
  rowHarga: '',
  err: '',
};

export default function PembelianBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('pembelian');
  const [draft, setDraft] = useState<Draft>(FRESH);

  const rowProd = draft.rowKode ? prod(draft.rowKode) : null;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/pembelian');
  }

  function addRow() {
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) {
      return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    }
    const harga = parseInt(String(draft.rowHarga || '').replace(/\D/g, ''), 10);
    if (Number.isNaN(harga) || harga <= 0) {
      return setDraft({ ...draft, err: '400 — harga beli wajib diisi.' });
    }
    const items = [...draft.items, { kode: draft.rowKode, qty, satuan: draft.rowSatuan ?? '', harga }];
    setDraft({ ...draft, items, rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' });
  }

  function save() {
    if (!draft.supId) return setDraft({ ...draft, err: '400 — pilih supplier dulu.' });
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    const total = draft.items.reduce((s, it) => s + it.qty * it.harga, 0);
    const dibayar = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
    if (dibayar > total) return setDraft({ ...draft, err: '400 — pembayaran melebihi total faktur.' });

    const created = addFaktur({
      supId: parseInt(draft.supId, 10),
      tanggal: draft.tanggal,
      dibayar,
      items: draft.items,
    });
    router.replace({ pathname: '/pembelian/[id]', params: { id: created.id, baru: '1' } });
  }

  const total = draft.items.reduce((a, it) => a + it.qty * it.harga, 0);
  const dibayarNum = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
  const sisa = total - dibayarNum;

  return (
    <AppShell title="Pembelian">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <View style={styles.detailHead}>
          <BackButton label="← Batal" onPress={goBack} />
          <Text style={styles.pageTitle}>Faktur pembelian baru</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 13.5, color: C.muted2 }}>
            Nomor faktur dibuat otomatis saat disimpan
          </Text>
        </View>

        <Card className="flex-row flex-wrap gap-3.5 p-4">
          <View style={{ flex: 2, minWidth: 240 }}>
            <Field label="Supplier">
              <OptionPicker
                options={SUPPLIERS.map((s) => ({ value: String(s.id), label: `${s.kode} · ${s.nama}` }))}
                value={draft.supId || null}
                onChange={(v) => setDraft({ ...draft, supId: v, err: '' })}
              />
            </Field>
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Tanggal faktur">
              <TextField
                value={draft.tanggal}
                onChangeText={(v) => setDraft({ ...draft, tanggal: v })}
                placeholder="YYYY-MM-DD"
              />
            </Field>
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field label="Tempo / jatuh tempo">
              {/* Read-only: the term belongs to the supplier record, and the due
                  date is derived from it and the invoice date. */}
              <View style={styles.readout}>
                <Text style={styles.readoutText}>{tempoReadout(draft.supId, draft.tanggal)}</Text>
              </View>
            </Field>
          </View>
        </Card>

        <Card>
          <CardHead title="Item pembelian" />
          <View style={styles.addRow}>
            <View style={{ flex: 2, minWidth: 180 }}>
              <Field label="PRODUK">
                <OptionPicker
                  options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))}
                  value={draft.rowKode || null}
                  onChange={(v) => {
                    const p = prod(v);
                    const satuan = p ? p.satuan[0].u : null;
                    // The base buy price times the unit factor: whoever is
                    // typing corrects it, but the common case is already right.
                    const harga = p ? String(p.hargaBeli * p.satuan[0].f) : '';
                    setDraft({ ...draft, rowKode: v, rowSatuan: satuan, rowHarga: harga, err: '' });
                  }}
                />
              </Field>
            </View>
            <View style={{ width: 100 }}>
              <Field label="QTY">
                <TextField
                  value={draft.rowQty}
                  onChangeText={(v) => setDraft({ ...draft, rowQty: v, err: '' })}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </Field>
            </View>
            <View style={{ width: 130 }}>
              <Field label="SATUAN">
                <OptionPicker
                  options={(rowProd?.satuan ?? []).map((u) => ({ value: u.u, label: u.u }))}
                  value={draft.rowSatuan}
                  onChange={(v) => {
                    const sf = rowProd?.satuan.find((u) => u.u === v);
                    const harga = sf && rowProd ? String(rowProd.hargaBeli * sf.f) : draft.rowHarga;
                    setDraft({ ...draft, rowSatuan: v, rowHarga: harga });
                  }}
                />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="HARGA BELI / SATUAN">
                <TextField
                  value={draft.rowHarga}
                  onChangeText={(v) => setDraft({ ...draft, rowHarga: v, err: '' })}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </Field>
            </View>
            <PrimaryButton label="Tambah" onPress={addRow} />
          </View>
          <View style={styles.itemsHeadRow}>
            <Text style={{ flex: 1 }}>PRODUK</Text>
            <Text style={{ width: 100, textAlign: 'right' }}>QTY</Text>
            <Text style={{ width: 130, textAlign: 'right' }}>HARGA</Text>
            <Text style={{ width: 140, textAlign: 'right' }}>SUBTOTAL</Text>
            <View style={{ width: 80 }} />
          </View>
          {draft.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                {prodNama(it.kode)}
              </Text>
              <Text style={{ width: 100, textAlign: 'right', fontSize: 14.5 }}>
                {it.qty.toLocaleString('id-ID')} {it.satuan}
              </Text>
              <Text style={{ width: 130, textAlign: 'right', fontSize: 14.5, color: C.dark2 }}>
                {rp(it.harga)}
              </Text>
              <Text style={{ width: 140, textAlign: 'right', fontSize: 16, fontWeight: '600' }}>
                {rp(it.qty * it.harga)}
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
            <EmptyState title="Belum ada item" sub="Pilih produk, isi qty dan harga beli, lalu klik Tambah." />
          )}
        </Card>

        <View style={{ alignItems: 'flex-end' }}>
          <Card className="w-[380px] max-w-full gap-3 p-4">
            <View style={styles.summaryRow}>
              <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total faktur</Text>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{rp(total)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={{ fontSize: 14.5, color: C.dark2 }}>Bayar sekarang</Text>
              <View style={{ width: 170 }}>
                <TextField
                  value={draft.dibayar}
                  onChangeText={(v) => setDraft({ ...draft, dibayar: v, err: '' })}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Sisa hutang</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: sisa > 0 ? C.red : C.green }}>
                {rp(Math.max(0, sisa))}
              </Text>
            </View>
            <ErrorBanner message={draft.err} />
            {canWrite && <PrimaryButton label="Simpan faktur" onPress={save} />}
          </Card>
        </View>
      </ScrollView>
    </AppShell>
  );
}

function tempoReadout(supId: string, tanggalFaktur: string): string {
  if (!supId) return 'Pilih supplier dulu';
  const s = sup(parseInt(supId, 10));
  if (!s) return '';
  return s.tempo > 0
    ? `${s.tempo} hari → jatuh ${tanggal(addDays(tanggalFaktur, s.tempo))}`
    : 'Tunai — bayar di tempat';
}

const styles = StyleSheet.create({
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  pageTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, color: C.text },
  itemsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  readout: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: '#F7FBFE',
  },
  readoutText: { fontSize: 13.5, color: C.dark2 },
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
