/**
 * Stok Opname — starting a new count.
 *
 * The sheet opens on a snapshot of what the ledger currently believes the room
 * holds. Saving — as a draft or posted — lands on the session's own route via
 * `replace`, so the count is continued (or read) at its address and backing out
 * returns to the list, never to a second blank sheet for the same room.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { OpnameWorksheet, type OpnameDraft } from '@/components/opname/worksheet';
import { AppShell } from '@/components/shell/AppShell';
import { GhostButton } from '@/components/shell/ui';
import { Colors as C } from '@/constants/theme-erp';
import { useCanWrite } from '@/services/permissions';
import { countedItems, RUANG, saveOpname, snapshot, TODAY } from '@/stores/opname';

function freshDraft(): OpnameDraft {
  // The warehouse is where a count usually starts; the picker stays open.
  const ruangId = RUANG[1].id;
  return {
    ruang: ruangId,
    tanggal: TODAY,
    catatan: '',
    items: snapshot(ruangId),
    wsFilter: 'semua',
    err: '',
  };
}

export default function StokOpnameBaruScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('opname');
  const [draft, setDraft] = useState<OpnameDraft>(freshDraft);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/stok-opname');
  }

  function commit(post: boolean) {
    const counted = countedItems(draft.items);
    if (!counted.length) return setDraft({ ...draft, err: '400 — isi minimal satu hitungan fisik.' });
    if (post && counted.length < draft.items.length) {
      return setDraft({
        ...draft,
        err: `400 — ${draft.items.length - counted.length} item belum dihitung. Posting butuh seluruh item terhitung — simpan draft untuk lanjut nanti.`,
      });
    }
    const saved = saveOpname(
      { id: null, ruang: draft.ruang, tanggal: draft.tanggal, catatan: draft.catatan.trim(), items: draft.items },
      post
    );
    // A posted session is announced on the document route; a draft is simply
    // continued there, so only the posting carries `baru`.
    router.replace({
      pathname: '/stok-opname/[id]',
      params: post ? { id: saved.id, baru: '1' } : { id: saved.id },
    });
  }

  if (!canWrite) {
    return (
      <AppShell title="Stok Opname">
        <View style={styles.centerBox}>
          <Text style={styles.errText}>Peran ini tidak bisa memulai opname.</Text>
          <GhostButton label="Kembali ke daftar" onPress={goBack} />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Stok Opname">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, padding: 22 }}>
        <OpnameWorksheet
          draft={draft}
          onChange={setDraft}
          no={null}
          ruangLocked={false}
          canWrite
          backLabel="← Batal"
          onBack={goBack}
          onSaveDraft={() => commit(false)}
          onPost={() => commit(true)}
        />
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  centerBox: { padding: 40, alignItems: 'center', gap: 12 },
  errText: { fontSize: 15, fontWeight: '600', color: C.red, textAlign: 'center' },
});
