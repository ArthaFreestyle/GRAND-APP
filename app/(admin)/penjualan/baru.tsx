/**
 * Penjualan — the entry form for a new note.
 *
 * Already a full page before this was a route; it just had no address and no
 * back button. Saving lands on the stored note via `replace`, so backing out
 * returns to the list rather than to a form still holding items already posted.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { Colors as C, addDays, rp, tanggal } from '@/constants/theme-erp';
import { useCanWrite } from '@/services/permissions';
import {
  addNota,
  cust,
  CUSTOMERS,
  piutangCust,
  prod,
  prodNama,
  PRODS,
  TODAY,
  type NotaItem,
} from '@/stores/penjualan';

interface Draft {
  custId: string;
  tanggal: string;
  dibayar: string;
  items: NotaItem[];
  /** The item being assembled, above the item table. */
  rowKode: string;
  rowSatuan: string | null;
  rowQty: string;
  rowHarga: string;
  err: string;
}

const FRESH: Draft = {
  custId: '',
  tanggal: TODAY,
  dibayar: '0',
  items: [],
  rowKode: '',
  rowSatuan: null,
  rowQty: '',
  rowHarga: '',
  err: '',
};

export default function PenjualanBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('penjualan');
  const [draft, setDraft] = useState<Draft>(FRESH);

  const rowProd = draft.rowKode ? prod(draft.rowKode) : null;

  function goBack() {
    // `dismiss()` targets the closest Stack — this section's own. `back()` is
    // offered to the drawer first, and a drawer holding an earlier section in
    // its history answers it by switching to that section instead of popping
    // this screen. The fallback is for a deep link with nothing to pop at all.
    if (router.canDismiss()) router.dismiss();
    else router.replace('/penjualan');
  }

  function addRow() {
    if (!draft.rowKode) return setDraft({ ...draft, err: '400 — pilih produk dulu.' });
    const qty = parseInt(draft.rowQty || '', 10);
    if (Number.isNaN(qty) || qty < 1) {
      return setDraft({ ...draft, err: '400 — qty harus bilangan bulat ≥ 1.' });
    }
    const harga = parseInt(String(draft.rowHarga || '').replace(/\D/g, ''), 10);
    if (Number.isNaN(harga) || harga <= 0) {
      return setDraft({ ...draft, err: '400 — harga jual wajib diisi.' });
    }
    const items = [...draft.items, { kode: draft.rowKode, qty, satuan: draft.rowSatuan ?? '', harga }];
    setDraft({ ...draft, items, rowKode: '', rowSatuan: null, rowQty: '', rowHarga: '', err: '' });
  }

  function save() {
    if (draft.custId === '') return setDraft({ ...draft, err: '400 — pilih pelanggan dulu.' });
    if (!draft.items.length) return setDraft({ ...draft, err: '400 — tambahkan minimal satu item.' });
    const custId = parseInt(draft.custId, 10);
    const c = cust(custId);
    const total = draft.items.reduce((s, it) => s + it.qty * it.harga, 0);
    const dibayar = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
    if (dibayar > total) return setDraft({ ...draft, err: '400 — pembayaran melebihi total nota.' });
    const sisaBaru = total - dibayar;
    // The credit limit is the server's rule; refusing here keeps the reader from
    // filling in a note that would be rejected on posting.
    if (c && c.limit > 0) {
      const terpakai = piutangCust(custId, null) + sisaBaru;
      if (terpakai > c.limit) {
        return setDraft({
          ...draft,
          err: `409 — piutang ${rp(terpakai)} melebihi limit kredit ${rp(c.limit)}. Kurangi tempo atau minta pembayaran di muka.`,
        });
      }
    }

    const created = addNota({ custId, tanggal: draft.tanggal, dibayar, items: draft.items });
    router.replace({ pathname: '/penjualan/[id]', params: { id: created.id, baru: '1' } });
  }

  const total = draft.items.reduce((a, it) => a + it.qty * it.harga, 0);
  const dibayarNum = parseInt(String(draft.dibayar || '0').replace(/\D/g, ''), 10) || 0;
  const sisa = total - dibayarNum;

  return (
    <AppShell title="Nota baru" onBack={goBack}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <Text style={{ fontSize: 13.5, color: C.muted2 }}>
          Nomor nota dibuat otomatis saat disimpan
        </Text>

        <Card className="flex-row flex-wrap gap-3.5 p-4">
          <View style={{ flex: 2, minWidth: 240 }}>
            <Field label="Pelanggan">
              <OptionPicker
                options={CUSTOMERS.map((c) => ({
                  value: String(c.id),
                  label: c.id === 0 ? c.nama : `${c.kode} · ${c.nama}`,
                }))}
                value={draft.custId || null}
                onChange={(v) => setDraft({ ...draft, custId: v, err: '' })}
              />
            </Field>
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Tanggal nota">
              <TextField
                value={draft.tanggal}
                onChangeText={(v) => setDraft({ ...draft, tanggal: v })}
                placeholder="YYYY-MM-DD"
              />
            </Field>
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field label="Tempo & limit">
              {/* Read-only: both belong to the customer record, and the due date
                  is derived from the term and the note date. */}
              <View style={styles.readout}>
                <Text style={styles.readoutText}>{tempoReadout(draft.custId, draft.tanggal)}</Text>
              </View>
            </Field>
          </View>
        </Card>

        <Card>
          <CardHead title="Item penjualan" />
          <View style={styles.addRow}>
            <View style={{ flex: 2, minWidth: 180 }}>
              <Field label="PRODUK">
                <OptionPicker
                  options={PRODS.map((p) => ({ value: p.kode, label: `${p.kode} · ${p.nama}` }))}
                  value={draft.rowKode || null}
                  onChange={(v) => {
                    const p = prod(v);
                    const satuan = p ? p.satuan[0].u : null;
                    const harga = p ? String(p.satuan[0].harga) : '';
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
                    const harga = sf ? String(sf.harga) : draft.rowHarga;
                    setDraft({ ...draft, rowSatuan: v, rowHarga: harga });
                  }}
                />
              </Field>
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="HARGA JUAL / SATUAN">
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
            <EmptyState title="Belum ada item" sub="Pilih produk, isi qty dan harga jual, lalu klik Tambah." />
          )}
        </Card>

        <View style={{ alignItems: 'flex-end' }}>
          <Card className="w-[380px] max-w-full gap-3 p-4">
            <View style={styles.summaryRow}>
              <Text style={{ fontSize: 14.5, color: C.muted3 }}>Total nota</Text>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{rp(total)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={{ fontSize: 14.5, color: C.dark2 }}>Terima pembayaran</Text>
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
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.dark2 }}>Sisa piutang</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: sisa > 0 ? C.red : C.green }}>
                {rp(Math.max(0, sisa))}
              </Text>
            </View>
            <ErrorBanner message={draft.err} />
            {canWrite && <PrimaryButton label="Simpan nota" onPress={save} />}
          </Card>
        </View>
      </ScrollView>
    </AppShell>
  );
}

function tempoReadout(custId: string, tanggalNota: string): string {
  if (!custId) return 'Pilih pelanggan dulu';
  const c = cust(parseInt(custId, 10));
  if (!c) return '';
  let t =
    c.tempo > 0
      ? `${c.tempo} hari → jatuh ${tanggal(addDays(tanggalNota, c.tempo))}`
      : 'Tunai — bayar di tempat';
  if (c.limit > 0) {
    const dipakai = piutangCust(c.id, null);
    t += `\nSisa limit ${rp(Math.max(0, c.limit - dipakai))} / ${rp(c.limit)}`;
  }
  return t;
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
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: '#F7FBFE',
  },
  readoutText: { fontSize: 13, color: C.dark2, lineHeight: 18 },
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
