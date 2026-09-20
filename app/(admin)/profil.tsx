/**
 * Profil — tab 5, and the last of the five (issue #25).
 *
 * Almost everything on this screen already existed somewhere in the app; it
 * was just squatting inside Kasir's `more-vertical` menu because that sheet
 * used to be the *only* door out of a bar-hidden screen. Now that every tab is
 * a thumb's reach away regardless of which one is open, "ganti wewenang",
 * "printer struk" and "keluar akun" moved here, and `app/(admin)/kasir.tsx`'s
 * own menu was pared down to the two things actually about the till: the way
 * back, and the gudang it sells out of. PPN stayed there too — it is a
 * per-device setting owned by that screen, not an account setting.
 *
 * ## Identity comes from the session already in memory, not a fresh read
 *
 * The issue that asked for this tab names `GET /auth/me` as the identity read.
 * The contract's own words on that endpoint are worth taking literally:
 * *"Membaca isi token, bukan tabel `users`"* — it answers `Session`
 * (`user_id`, `username`, `grants`, `aktif`), which is strictly **less** than
 * what `services/session.ts` already holds from login (`nama_lengkap`,
 * `email`, and the same grants and active context, all decoded from the same
 * token). Calling `auth/me` here would spend a round trip to read a smaller
 * copy of data already in memory — this screen reads `useSession()` instead,
 * the same source `app/(admin)/beranda.tsx`'s identity block and
 * `components/shell/role-switcher.tsx`'s chip already trust.
 *
 * ## Printer state is screen-local, on purpose
 *
 * `services/bluetooth-printer.ts` persists the *chosen device* itself
 * (`loadSavedPrinter`/`saveSelectedPrinter`), so Kasir and this screen agree on
 * which printer is selected without sharing any React state — each just reads
 * the same store on mount. The paired-device list and the busy/error flags
 * around it stay local to whichever screen is currently showing them, the same
 * shape `app/(admin)/kasir.tsx` and `app/penjualan/[id].tsx` each already use;
 * there is no shared picker hook in this codebase to reach for instead.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  RamahChip,
  RamahField,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahStackRow,
} from '@/components/shell/ramah';
import { RoleSwitcherSheet } from '@/components/shell/role-switcher';
import { RamahColors as C, RamahIcon, RamahLayout as L, RamahRadius as R, RamahType as T } from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { changePassword, logout } from '@/services/auth';
import * as printer from '@/services/bluetooth-printer';
import { roleLabel, useCanWrite } from '@/services/permissions';
import { PAPER_LABEL, PAPER_OPTIONS, encodeTestReceipt, type PaperColumns } from '@/services/receipt';
import { useSession } from '@/services/session';

export default function ProfilScreen() {
  const router = useRouter();
  const session = useSession();
  /**
   * Gates only "Presensi tim" and "Rekap bulanan" below — "Riwayat presensi" is
   * everyone's own, the tombol on Beranda needs no `WriteArea` at all, and this
   * is the one entry permission `services/permissions.ts` adds for the whole
   * module (issue #45).
   */
  const canOpenPresensiTim = useCanWrite('presensi');

  const [roleOpen, setRoleOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);

  // ---- ganti password --------------------------------------------------
  const [pwLama, setPwLama] = useState('');
  const [pwBaru, setPwBaru] = useState('');
  const [pwUlang, setPwUlang] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwKabar, setPwKabar] = useState('');

  const tutupPw = useCallback(() => {
    setPwOpen(false);
    setPwLama('');
    setPwBaru('');
    setPwUlang('');
    setPwErr('');
  }, []);

  async function simpanPassword() {
    if (pwBusy) return;
    if (pwLama === '') return setPwErr('Isi password lama.');
    if (pwBaru.length < 8) return setPwErr('Password baru minimal 8 karakter.');
    if (pwBaru !== pwUlang) return setPwErr('Konfirmasi tidak sama dengan password baru.');
    setPwBusy(true);
    setPwErr('');
    try {
      await changePassword(pwLama, pwBaru);
      tutupPw();
      setPwKabar('Password berhasil diganti.');
    } catch (e) {
      setPwErr(messageOf(e, 'Gagal mengganti password.'));
    } finally {
      setPwBusy(false);
    }
  }

  // ---- printer -----------------------------------------------------------
  const [dev, setDev] = useState<printer.PrinterDevice | null>(null);
  const [paired, setPaired] = useState<printer.PrinterDevice[]>([]);
  const [paper, setPaper] = useState<PaperColumns>(32);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerErr, setPrinterErr] = useState('');

  // Read once, the moment this tab first mounts — every tab in `(admin)`
  // mounts eagerly with the bar, so this is not deferred behind a focus check.
  useEffect(() => {
    let alive = true;
    printer.loadSavedPrinter().then((saved) => {
      if (alive && saved) setDev(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function loadPaired() {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureReady();
      setPaired(await printer.listBonded());
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Daftar printer tidak terbaca.');
    } finally {
      setPrinterBusy(false);
    }
  }

  function bukaPrinter() {
    setPrinterOpen(true);
    if (printer.isPrinterSupported() && !paired.length) void loadPaired();
  }

  async function pilihPrinter(d: printer.PrinterDevice) {
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureConnected(d.address);
      await printer.saveSelectedPrinter(d);
      setDev(d);
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Printer tidak bisa disambungkan.');
    } finally {
      setPrinterBusy(false);
    }
  }

  async function tesCetak() {
    if (!dev) return;
    setPrinterBusy(true);
    setPrinterErr('');
    try {
      await printer.ensureConnected(dev.address);
      await printer.write(dev.address, encodeTestReceipt(dev.name, paper));
    } catch (e) {
      setPrinterErr(e instanceof Error ? e.message : 'Tes cetak gagal.');
    } finally {
      setPrinterBusy(false);
    }
  }

  // ---- identity ------------------------------------------------------------
  const activeUnit = session?.grants.find((g) => g.id_user_role === session.active?.id_user_role)?.nama_unit_kerja;
  const konteks = `${roleLabel(session?.active?.role)}${activeUnit ? ` · ${activeUnit}` : ''}`;
  const switchable = (session?.grants.length ?? 0) > 1;
  const printerLabel = !printer.isPrinterSupported()
    ? 'Butuh dev build'
    : dev
      ? `${dev.name} · ${PAPER_LABEL[paper]}`
      : 'Belum dipilih';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profil</Text>

        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Feather name="user" size={RamahIcon.header} color={C.brandInk} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.nama} numberOfLines={1}>
              {session?.user.nama_lengkap || session?.user.username || '—'}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {session?.user.email || `@${session?.user.username ?? '—'}`}
            </Text>
          </View>
        </View>

        {pwKabar ? <RamahNote icon="check-circle">{pwKabar}</RamahNote> : null}

        {/*
          Presensi, above Wewenang: this is the one surface every role actually
          reaches. `homeRouteFor` sends CASHIER straight to `/kasir`, whose bar
          stays hidden until "Kembali" is pressed — a cashier never opens
          Beranda at all, so Profil is where their own "Riwayat presensi" has
          to live. "Presensi tim" and "Rekap bulanan" are SUPERADMIN only.
        */}
        <View style={styles.group}>
          <RamahSectionHeader>Presensi</RamahSectionHeader>
          <View style={styles.card}>
            <RamahStackRow
              icon="clock"
              tone="akun"
              title="Riwayat presensi"
              onPress={() => router.push('/presensi')}
            />
            {canOpenPresensiTim ? (
              <>
                <View style={styles.divider} />
                <RamahStackRow
                  icon="users"
                  tone="akun"
                  title="Presensi tim"
                  onPress={() => router.push('/presensi/tim')}
                />
                <View style={styles.divider} />
                <RamahStackRow
                  icon="bar-chart-2"
                  tone="akun"
                  title="Rekap bulanan"
                  onPress={() => router.push('/presensi/rekap')}
                />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Wewenang</RamahSectionHeader>
          <View style={styles.card}>
            <RamahStackRow
              icon="shield"
              tone="akun"
              title={konteks}
              subtitle={switchable ? 'Ketuk untuk pilih peran atau unit kerja lain' : 'Wewenang tunggal akun ini'}
              onPress={switchable ? () => setRoleOpen(true) : undefined}
            />
          </View>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Akun</RamahSectionHeader>
          <View style={styles.card}>
            <RamahStackRow icon="lock" tone="akun" title="Ganti password" onPress={() => setPwOpen(true)} />
          </View>
        </View>

        <View style={styles.group}>
          <RamahSectionHeader>Printer</RamahSectionHeader>
          <View style={styles.card}>
            <RamahStackRow icon="printer" tone="akun" title="Printer struk" subtitle={printerLabel} onPress={bukaPrinter} />
          </View>
        </View>

        <View style={styles.keluarWrap}>
          <RamahSecondaryButton label="Keluar akun" icon="log-out" fullWidth height={L.controlH} onPress={() => void logout()} />
        </View>

        {/*
          Empty space below the last control, on direct request: the native
          tab bar's automatic bottom inset (see CLAUDE.md's "Safe areas") pads
          this tab's `SafeAreaView` for the bar itself, but that inset alone
          left "Keluar akun" reading as flush against it rather than clear of
          it. A dedicated spacer after the button, rather than a bigger
          `content.paddingBottom`, keeps every earlier group's spacing exactly
          as it was.
        */}
        <View style={styles.bottomSpace} />
      </ScrollView>

      <RoleSwitcherSheet visible={roleOpen} onClose={() => setRoleOpen(false)} />

      <RamahSheet visible={pwOpen} title="Ganti password" onClose={tutupPw}>
        <View style={styles.sheetBody}>
          <RamahField
            label="Password lama"
            value={pwLama}
            onChangeText={setPwLama}
            secureTextEntry
            autoCapitalize="none"
            required
          />
          <RamahField
            label="Password baru"
            value={pwBaru}
            onChangeText={setPwBaru}
            secureTextEntry
            autoCapitalize="none"
            helper="Minimal 8 karakter."
            required
          />
          <RamahField
            label="Ulangi password baru"
            value={pwUlang}
            onChangeText={setPwUlang}
            secureTextEntry
            autoCapitalize="none"
            required
          />
          {pwErr ? <RamahInlineError message={pwErr} /> : null}
          <RamahNote icon="info">Perangkat lain akan keluar otomatis.</RamahNote>
          <RamahPrimaryButton label="Simpan password baru" onPress={() => void simpanPassword()} busy={pwBusy} disabled={pwBusy} />
        </View>
      </RamahSheet>

      <RamahSheet visible={printerOpen} title="Printer struk" onClose={() => setPrinterOpen(false)}>
        <View style={styles.sheetBody}>
          {!printer.isPrinterSupported() ? (
            <Text style={styles.hint}>
              Printer bluetooth hanya jalan di dev build — modul nativenya tidak ada di Expo Go.
            </Text>
          ) : (
            <>
              {printerErr ? <RamahInlineError message={printerErr} onRetry={() => void loadPaired()} /> : null}
              <Text style={styles.hint}>Perangkat yang sudah di-pair lewat Pengaturan Android.</Text>
              {printerBusy ? <ActivityIndicator color={C.brand} /> : null}
              {paired.map((d) => (
                <RamahSheetOption key={d.address} label={d.name} sub={d.address} selected={dev?.address === d.address} onPress={() => void pilihPrinter(d)} />
              ))}
              <View style={styles.chipRow}>
                {PAPER_OPTIONS.map((cols) => (
                  <RamahChip key={cols} label={PAPER_LABEL[cols]} selected={paper === cols} onPress={() => setPaper(cols)} />
                ))}
              </View>
              <View style={styles.headRow}>
                <View style={styles.grow}>
                  <RamahSecondaryButton label="Buka Pengaturan Bluetooth" onPress={() => printer.openBluetoothSettings()} />
                </View>
                {dev ? (
                  <View style={styles.grow}>
                    <RamahSecondaryButton label="Tes cetak" onPress={() => void tesCetak()} />
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </RamahSheet>
    </View>
  );
}

/**
 * No safe-area padding: this is a tab root, and `app/(admin)/_layout.tsx`
 * pads top and sides outside the navigator while the native bar owns the
 * bottom edge itself.
 */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space6, gap: L.stack },

  title: { ...T.titleModerate, color: C.textTitle },

  identity: { flexDirection: 'row', alignItems: 'center', gap: L.space3 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brandTint,
  },
  nama: { ...T.titleSmall, color: C.textTitle },
  email: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },

  // Every group on this screen starts with its own heading and is about a
  // different thing, so each one opens at `group` from what is above it.
  group: { gap: L.related, marginTop: L.group - L.stack },
  card: {
    borderRadius: R.card,
    backgroundColor: C.surfaceCard,
    borderWidth: 1,
    borderColor: C.borderHairline,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },

  // Signing out is not one more setting, so it stands a group away from them.
  keluarWrap: { marginTop: L.group - L.stack },
  // Clears the native tab bar past what its own automatic inset reserves —
  // see the comment at the spacer's call site.
  bottomSpace: { height: L.section + L.group },

  sheetBody: { paddingHorizontal: L.gutter, gap: L.space3, paddingBottom: L.space4 },
  hint: { ...T.bodySmall, color: C.textBody },
  chipRow: { flexDirection: 'row', gap: L.related },
  headRow: { flexDirection: 'row', gap: L.related },
});
