/**
 * The counting sheet, shared by the two routes that show one.
 *
 * A stock take is counted twice through the same screen: once when it is
 * started (`stok-opname/baru`) and again every time the draft is reopened
 * (`stok-opname/[id]`, while it is still a draft). Those used to be one `view`
 * branch; as routes they are two files, so the sheet itself moved here rather
 * than being written twice or forced back into one screen.
 *
 * `canWrite` false renders the same sheet read-only — a viewer without the role
 * can still see how far a running count has got, which the old branch could not
 * show them at all.
 */
import { StyleSheet, Text, View } from 'react-native';

import {
  Card,
  CardHead,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  OptionPicker,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from '@/components/shell/ui';
import { Colors as C, num } from '@/constants/theme-erp';
import {
  countedItems,
  netSelisih,
  prodNama,
  prodUnit,
  RUANG,
  ruangNama,
  snapshot,
  varianceItems,
  type OpItem,
} from '@/stores/opname';

export interface OpnameDraft {
  ruang: number;
  tanggal: string;
  catatan: string;
  items: OpItem[];
  /** Which rows the sheet is showing — a count of 200 items needs a way to narrow. */
  wsFilter: 'semua' | 'belum' | 'selisih';
  err: string;
}

const WS_FILTERS = [
  { key: 'semua' as const, label: 'Semua' },
  { key: 'belum' as const, label: 'Belum dihitung' },
  { key: 'selisih' as const, label: 'Ada selisih' },
];

export function netLabel(n: number) {
  return (n > 0 ? '+' : '') + num(n);
}
export function netColor(n: number) {
  return n > 0 ? C.green : n < 0 ? C.red : C.muted3;
}

export function OpnameWorksheet({
  draft,
  onChange,
  no,
  /** A reopened draft already holds counts for its room, so the room is locked. */
  ruangLocked,
  canWrite,
  onSaveDraft,
  onPost,
}: {
  draft: OpnameDraft;
  onChange: (next: OpnameDraft) => void;
  no: string | null;
  ruangLocked: boolean;
  canWrite: boolean;
  onSaveDraft: () => void;
  onPost: () => void;
}) {
  const rows = draft.items
    .map((it, i) => {
      const counted = it.fisik !== null;
      const sel = counted ? (it.fisik as number) - it.sistem : 0;
      return { i, it, counted, sel };
    })
    .filter((r) =>
      draft.wsFilter === 'semua' ? true : draft.wsFilter === 'belum' ? !r.counted : r.counted && r.sel !== 0
    );

  function setFisik(i: number, val: string) {
    const items = draft.items.map((it, j) =>
      j === i
        ? { ...it, fisik: val === '' ? null : parseInt(val.replace(/[^\d]/g, ''), 10) || 0 }
        : it
    );
    onChange({ ...draft, items, err: '' });
  }

  const countedN = countedItems(draft.items).length;
  const totalN = draft.items.length;
  const nVar = varianceItems(draft.items).length;
  const net = netSelisih(draft.items);

  return (
    <>
      {/* The number and the way back are in the header bar. What is left is
          the state of the sheet and the caveat about its number. */}
      <View style={styles.detailHead}>
        <View style={[styles.badge, { backgroundColor: C.amberBg, borderColor: C.amberBorder }]}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.amber }}>Berjalan</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 13.5, color: C.muted2 }}>Nomor final dibuat saat opname diposting</Text>
      </View>

      <Card className="flex-row flex-wrap gap-3.5 p-4">
        <View style={{ flex: 1, minWidth: 200 }}>
          <Field
            label="Ruang dihitung"
            hint={ruangLocked ? 'Terkunci — draft ini sudah berisi hitungan untuk ruang tersebut.' : undefined}>
            {ruangLocked ? (
              <View style={styles.readout}>
                <Text style={styles.readoutText}>{ruangNama(draft.ruang)}</Text>
              </View>
            ) : (
              <OptionPicker
                options={RUANG.map((r) => ({ value: String(r.id), label: r.nama }))}
                value={String(draft.ruang)}
                onChange={(v) =>
                  // A different room is a different count: the sheet is reloaded
                  // from that room's ledger rather than carrying figures over.
                  onChange({
                    ...draft,
                    ruang: parseInt(v, 10),
                    items: snapshot(parseInt(v, 10)),
                    err: '',
                  })
                }
              />
            )}
          </Field>
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Field label="Tanggal opname">
            <TextField
              value={draft.tanggal}
              onChangeText={(v) => onChange({ ...draft, tanggal: v })}
              editable={canWrite}
              placeholder="YYYY-MM-DD"
            />
          </Field>
        </View>
        <View style={{ flex: 1.4, minWidth: 220 }}>
          <Field label="Catatan (opsional)">
            <TextField
              value={draft.catatan}
              onChangeText={(v) => onChange({ ...draft, catatan: v })}
              editable={canWrite}
              placeholder="mis. opname bulanan gudang"
            />
          </Field>
        </View>
      </Card>

      <Card>
        <CardHead
          title="Lembar hitung"
          right={
            <FilterPills
              options={WS_FILTERS}
              active={draft.wsFilter}
              onPick={(k) => onChange({ ...draft, wsFilter: k })}
            />
          }
        />
        <View style={styles.wsHeadRow}>
          <Text style={{ flex: 1 }}>PRODUK</Text>
          <Text style={{ width: 120, textAlign: 'right' }}>STOK SISTEM</Text>
          <Text style={{ width: 140, textAlign: 'right' }}>STOK FISIK</Text>
          <Text style={{ width: 140, textAlign: 'right' }}>SELISIH</Text>
        </View>
        {rows.map(({ i, it, counted, sel }) => (
          <View
            key={it.kode}
            style={[styles.wsRow, { backgroundColor: counted && sel !== 0 ? '#FDF8EC' : '#fff' }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '500' }} numberOfLines={1}>
                {prodNama(it.kode)}
              </Text>
              <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: 'monospace' }}>
                {it.kode} · {prodUnit(it.kode)}
              </Text>
            </View>
            <Text style={{ width: 120, textAlign: 'right', fontSize: 16, fontWeight: '600', color: C.dark2 }}>
              {num(it.sistem)}
            </Text>
            <View style={{ width: 140, alignItems: 'flex-end' }}>
              {canWrite ? (
                <View style={{ width: 120 }}>
                  <TextField
                    value={it.fisik === null ? '' : String(it.fisik)}
                    onChangeText={(v) => setFisik(i, v)}
                    keyboardType="numeric"
                    placeholder="—"
                  />
                </View>
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '600' }}>
                  {it.fisik === null ? '—' : num(it.fisik)}
                </Text>
              )}
            </View>
            <Text
              style={{
                width: 140,
                textAlign: 'right',
                fontSize: 16,
                fontWeight: '700',
                color: !counted ? C.muted : netColor(sel),
              }}>
              {!counted ? '—' : sel === 0 ? '0' : netLabel(sel)}
            </Text>
          </View>
        ))}
        {rows.length === 0 && (
          <EmptyState title="Tidak ada item pada filter ini" sub="Ubah filter untuk melihat item lain." />
        )}
      </Card>

      <View style={{ alignItems: 'flex-end' }}>
        <Card className="w-[400px] max-w-full gap-3 p-4">
          <View style={styles.summaryRow}>
            <Text style={{ fontSize: 14.5, color: C.muted3 }}>Item dihitung</Text>
            <Text style={{ fontSize: 22, fontWeight: '800' }}>
              {countedN} / {totalN}
            </Text>
          </View>
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10 }]}>
            <Text style={{ fontSize: 14.5, color: C.muted3 }}>Item dengan selisih</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: nVar ? C.amber : C.green }}>
              {nVar ? `${nVar} item` : 'Tidak ada'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={{ fontSize: 14.5, color: C.muted3 }}>Net penyesuaian</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: netColor(net) }}>
              {netLabel(net)} unit
            </Text>
          </View>
          <ErrorBanner message={draft.err} />
          {canWrite && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SecondaryButton label="Simpan draft" onPress={onSaveDraft} flex={1} />
              <PrimaryButton label="Posting & sesuaikan" onPress={onPost} flex={1.4} />
            </View>
          )}
        </Card>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  detailNo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontFamily: 'monospace', color: C.text },
  badge: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 40,
    backgroundColor: C.tableHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  wsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLighter,
  },
  readout: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.borderCard,
    backgroundColor: C.badgeBg,
  },
  readoutText: { fontSize: 15, color: C.dark2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
