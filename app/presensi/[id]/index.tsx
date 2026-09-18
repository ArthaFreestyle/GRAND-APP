/**
 * Detail presensi — **SUPERADMIN**, and the reason it exists is everything a
 * list row cannot carry: `sumber_masuk`/`sumber_pulang` (a tap on the tombol
 * versus a typed correction), who corrected it and when, why, and the raw
 * `ip_masuk`/`ip_pulang` the request arrived from.
 *
 * ## The IP fields are printed with no claim attached
 *
 * The contract is explicit that `ip_masuk`/`ip_pulang` prove nothing on their
 * own: this project has no trusted-proxy configuration anywhere, so behind a
 * reverse proxy every request can show the same address. They are shown
 * because they will be useful the day that setting exists, not because they
 * are evidence today — the `RamahNote` under them says exactly that in one
 * sentence, and if that sentence could not be written honestly the fields
 * would not be printed at all.
 *
 * ## Why "Koreksi presensi" is a header icon, not a body button
 *
 * The same shape as `app/produk/[id]/index.tsx`'s pencil: one standing action
 * that every SUPERADMIN sees on every record, which is chrome rather than
 * content — CLAUDE.md's own line for this. It differs from the transition
 * buttons a document detail draws (Ajukan / Posting / Tolak), which stay text
 * in the body because their label is the whole point; here the pencil already
 * says everything "koreksi" needs to.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  RamahBadge,
  RamahHeader,
  RamahIconButton,
  RamahNote,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSummaryCard,
} from '@/components/shell/ramah';
import { formatTanggal } from '@/constants/produk';
import { RamahColors as C, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import {
  formatDurasi,
  formatJam,
  getPresensi,
  presensiBus,
  PRESENSI_STATUS,
  SHIFT_LABEL,
  type PresensiRow,
} from '@/services/presensi';

function formatTanggalJam(iso: string | null): string {
  if (!iso) return '—';
  return `${formatTanggal(iso)} · ${formatJam(iso)}`;
}

export default function DetailPresensiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const idValid = Number.isFinite(id) && id > 0;
  const canOpen = useCanWrite('presensi');

  const [row, setRow] = useState<PresensiRow | null>(null);
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(() => {
    if (!idValid || !canOpen) return;
    let alive = true;
    getPresensi(id)
      .then((r) => {
        if (alive) setRow(r);
      })
      .catch((e) => {
        if (alive) setLoadErr(messageOf(e, 'Gagal memuat detail presensi.'));
      });
    return () => {
      alive = false;
    };
  }, [id, idValid, canOpen]);

  useEffect(() => load(), [load]);

  useRecordBus(presensiBus, (change) => {
    if (change.kind === 'saved' && change.row.id === id) setRow(change.row);
  });

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/presensi');
  }, [router]);

  const openUbah = useCallback(() => {
    router.push({ pathname: '/presensi/[id]/ubah', params: { id: String(id) } });
  }, [router, id]);

  if (!canOpen) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail presensi" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Tidak berwenang</Text>
          <Text style={styles.centerSub}>Halaman ini hanya untuk superadmin.</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!idValid || loadErr) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail presensi" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Presensi tidak ditemukan</Text>
          <Text style={styles.centerSub}>{idValid ? loadErr : 'Alamat presensi tidak dikenali.'}</Text>
          <View style={styles.centerAction}>
            <RamahSecondaryButton label="Kembali" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.screen}>
        <RamahHeader title="Detail presensi" onBack={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} />
        </View>
      </View>
    );
  }

  const meta = PRESENSI_STATUS[row.status];

  return (
    <View style={styles.screen}>
      <RamahHeader
        title="Detail presensi"
        onBack={goBack}
        right={<RamahIconButton icon="edit-2" label="Koreksi presensi" onPress={openUbah} />}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.headBlock}>
          <Text style={styles.nama} numberOfLines={1}>
            {row.namaUser || '—'}
          </Text>
          <View style={styles.headRow}>
            <Text style={styles.headSub}>
              {formatTanggal(row.tanggal)} · Shift {SHIFT_LABEL[row.shift]}
            </Text>
            <RamahBadge label={meta.label} tone={meta.tone} />
          </View>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Waktu</RamahSectionHeader>
          <RamahSummaryCard
            rows={[
              { label: 'Jam masuk', value: formatJam(row.jamMasuk) },
              { label: 'Jam pulang', value: row.jamPulang ? formatJam(row.jamPulang) : '—' },
              { label: 'Durasi kerja', value: formatDurasi(row.durasiMenit) },
              { label: 'Unit kerja', value: row.namaUnitKerja || 'Tanpa unit kerja' },
            ]}
          />
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Sumber</RamahSectionHeader>
          <RamahSummaryCard
            rows={[
              { label: 'Sumber jam masuk', value: row.sumberMasuk === 'KOREKSI' ? 'Koreksi' : 'Tombol' },
              {
                label: 'Sumber jam pulang',
                value: row.sumberPulang ? (row.sumberPulang === 'KOREKSI' ? 'Koreksi' : 'Tombol') : '—',
              },
            ]}
          />
        </View>

        {row.dikoreksiOleh !== null ? (
          <View style={styles.group}>
            <RamahSectionHeader>Riwayat koreksi</RamahSectionHeader>
            <RamahSummaryCard
              rows={[
                { label: 'Dikoreksi oleh', value: `User #${row.dikoreksiOleh}` },
                { label: 'Waktu koreksi', value: formatTanggalJam(row.tsKoreksi) },
                { label: 'Alasan', value: row.alasanKoreksi || '—' },
              ]}
            />
          </View>
        ) : null}

        <View style={styles.group}>
          <RamahSectionHeader>Jaringan</RamahSectionHeader>
          <RamahSummaryCard
            rows={[
              { label: 'IP jam masuk', value: row.ipMasuk || '—' },
              { label: 'IP jam pulang', value: row.ipPulang || '—' },
            ]}
          />
          <RamahNote icon="info">Belum bukti — proyek ini belum punya trusted-proxy.</RamahNote>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space8, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle, textAlign: 'center' },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: L.gutter, paddingTop: L.space1, paddingBottom: L.space10, gap: L.group },

  headBlock: { gap: L.inline },
  nama: { ...T.titleModerate, color: C.textTitle },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: L.space3 },
  headSub: { ...T.bodySmall, color: C.textBody, flex: 1, minWidth: 0 },

  group: { gap: L.related },
});
