import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { SvgProps } from 'react-native-svg';

import LogoSvg from '@/assets/images/login/logo.svg';
import RoleAdminSvg from '@/assets/images/login/role-admin.svg';
import RoleGudangSvg from '@/assets/images/login/role-gudang.svg';
import RoleKasirSvg from '@/assets/images/login/role-kasir.svg';
import RoleOwnerSvg from '@/assets/images/login/role-owner.svg';
import RolePembelianSvg from '@/assets/images/login/role-pembelian.svg';
import RoleSupervisorSvg from '@/assets/images/login/role-supervisor.svg';
import { Colors as C } from '@/constants/theme-erp';
import { ApiError } from '@/services/api';
import { login, switchContext } from '@/services/auth';
import { clearSession, getSession, hasActiveContext, type Grant, type Session } from '@/services/session';

type RoleId = 'admin' | 'kasir' | 'gudang' | 'pembelian' | 'supervisor' | 'owner';

interface RoleDef {
  id: RoleId;
  name: string;
  desc: string;
  Icon: FC<SvgProps>;
}

const ROLES: RoleDef[] = [
  { id: 'admin', name: 'Admin', desc: 'Akses penuh sistem', Icon: RoleAdminSvg },
  { id: 'kasir', name: 'Kasir', desc: 'Penjualan & kas', Icon: RoleKasirSvg },
  { id: 'gudang', name: 'Gudang', desc: 'Stok & mutasi barang', Icon: RoleGudangSvg },
  { id: 'pembelian', name: 'Pembelian', desc: 'Pesanan ke supplier', Icon: RolePembelianSvg },
  { id: 'supervisor', name: 'Supervisor', desc: 'Pantau & persetujuan', Icon: RoleSupervisorSvg },
  { id: 'owner', name: 'Owner', desc: 'Laporan & analitik', Icon: RoleOwnerSvg },
];
/**
 * Where a signed-in session lands. Driven by the active grant's role that the
 * API put in the token, not by the card tapped on the way in — the role picker
 * is branding, it never knew who anyone was.
 */
function homeRouteFor(session: Session): '/kasir' | '/produk' {
  return session.active?.role === 'CASHIER' ? '/kasir' : '/produk';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

function clamp(min: number, val: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

/** Mirrors the design's CSS clamp(min, Nvh|vw, max) fluid sizing on a fixed window size. */
function useFluid() {
  const { width, height } = useWindowDimensions();
  return {
    vh: (min: number, pct: number, max: number) => clamp(min, (height * pct) / 100, max),
    vw: (min: number, pct: number, max: number) => clamp(min, (width * pct) / 100, max),
  };
}

function RoleCard({
  role,
  onPress,
  iconCap,
  nameSize,
  descSize,
}: {
  role: RoleDef;
  onPress: () => void;
  iconCap: number;
  nameSize: number;
  descSize: number;
}) {
  const [box, setBox] = useState(0);
  const iconSize = box > 0 ? Math.min(box * 0.94, iconCap) : 0;
  return (
    <Pressable onPress={onPress} style={styles.roleCard}>
      <View
        style={styles.roleIconSlot}
        onLayout={(e) => setBox(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height))}>
        {iconSize > 0 ? <role.Icon width={iconSize} height={iconSize} /> : null}
      </View>
      <View style={styles.roleTextWrap}>
        <Text style={[styles.roleName, { fontSize: nameSize }]} numberOfLines={1}>
          {role.name}
        </Text>
        <Text style={[styles.roleDesc, { fontSize: descSize }]} numberOfLines={2}>
          {role.desc}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const bp = useBreakpoint();
  // This screen draws its own navbar instead of a navigator header, so the
  // insets go on the two elements that actually touch the edges — that way the
  // navbar's card colour still runs up under the status bar rather than leaving
  // a strip of page background above it.
  const insets = useSafeAreaInsets();
  const { vh, vw } = useFluid();
  // Two cards to a row on a phone, three from a tablet up. This used to ask
  // `height >= width`, which gave a tablet held upright the phone's two columns
  // and left a third of its 820pt of width unused.
  const roleRows = useMemo(() => chunk(ROLES, bp === 'phone' ? 2 : 3), [bp]);
  const [view, setView] = useState<'home' | 'login' | 'context'>('home');
  const [roleId, setRoleId] = useState<RoleId | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Populated only when login came back with more than one usable grant and no
  // active context, which the contract answers with `aktif: null`.
  const [grants, setGrants] = useState<Grant[]>([]);

  const active = ROLES.find((r) => r.id === roleId) ?? ROLES[0];

  // Arriving here with a session already in hand means one of two things: a
  // restored session is ready to go, or a refresh came back without an active
  // context because the grant was revoked or retired. The second case is a
  // choice to make, not an error — show the picker rather than the login form.
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    if (hasActiveContext(session)) {
      router.replace(homeRouteFor(session) as never);
      return;
    }
    if (session.grants.length > 0) {
      setUsername(session.user.username ?? '');
      setGrants(session.grants);
      setView('context');
    }
  }, [router]);

  const pickRole = (r: RoleDef) => {
    setRoleId(r.id);
    setUsername('');
    setPassword('');
    setError('');
    setGrants([]);
    setView('login');
  };

  const back = () => {
    // Leaving mid-flow drops whatever token login already handed us — a session
    // stuck without an active context authorizes nothing anyway.
    clearSession();
    setGrants([]);
    setView('home');
    setError('');
  };

  const failed = (e: unknown, fallback: string) =>
    setError(e instanceof ApiError ? e.message : fallback);

  const submit = async () => {
    if (busy) return;
    if (!username.trim() || !password.trim()) {
      setError('Nama pengguna dan kata sandi wajib diisi.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const session = await login(username.trim(), password);
      // Exactly one usable grant is activated server-side, so the token is ready
      // to use; more than one leaves the choice — and the authorization — to us.
      if (session.active) {
        router.replace(homeRouteFor(session) as never);
        return;
      }
      if (session.grants.length === 0) {
        clearSession();
        setError('Akun ini belum punya peran aktif. Hubungi admin unit kerja Anda.');
        return;
      }
      setGrants(session.grants);
      setView('context');
    } catch (e) {
      failed(e, 'Gagal masuk. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const chooseGrant = async (grant: Grant) => {
    if (busy || grant.id_user_role === undefined) return;
    setError('');
    setBusy(true);
    try {
      const session = await switchContext(grant.id_user_role);
      router.replace(homeRouteFor(session) as never);
    } catch (e) {
      failed(e, 'Gagal memilih peran. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const errorBanner = error ? (
    <View style={styles.errorBanner}>
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>
      <Text style={[styles.errorText, { fontSize: vh(14, 1.9, 21) }]}>{error}</Text>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {view !== 'home' ? (
          <View
            style={[
              styles.navbar,
              {
                height: vh(52, 7.2, 68) + insets.top,
                paddingTop: insets.top,
                paddingLeft: vw(6, 1.4, 16) + insets.left,
                paddingRight: vw(6, 1.4, 16) + insets.right,
              },
            ]}>
            <Pressable
              onPress={back}
              accessibilityRole="button"
              accessibilityLabel="Pilih peran lain"
              hitSlop={8}
              style={styles.navBackBtn}>
              <Text style={[styles.navBackIcon, { fontSize: vh(24, 3.2, 32) }]}>‹</Text>
              <Text style={[styles.navBackLabel, { fontSize: vh(15, 2, 20) }]}>Pilih peran lain</Text>
            </Pressable>
          </View>
        ) : null}
        <View
          style={[
            styles.root,
            {
              // The navbar already absorbs the top inset when it is on screen.
              paddingTop: vh(16, 2.6, 34) + (view === 'home' ? insets.top : 0),
              paddingBottom: vh(16, 2.6, 34) + insets.bottom,
              paddingLeft: vw(20, 3.4, 52) + insets.left,
              paddingRight: vw(20, 3.4, 52) + insets.right,
            },
          ]}>
          <View style={[styles.brandRow, { marginBottom: vh(8, 2, 28) }]}>
            <LogoSvg width={vh(38, 4.6, 58)} height={vh(38, 4.6, 58)} />
            <Text style={[styles.brandText, { fontSize: vh(17, 2, 24) }]}>Manajemen POS</Text>
          </View>

          {view === 'home' ? (
            <View style={[styles.homeWrap, { gap: vh(10, 2.2, 34) }]}>
              <View style={[styles.homeHead, { gap: vh(4, 0.9, 12) }]}>
                <Text style={[styles.homeTitle, { fontSize: vh(26, 4.6, 62) }]}>Masuk sebagai</Text>
                <Text style={[styles.homeSub, { fontSize: vh(14, 2.1, 26) }]}>
                  Pilih peran untuk membuka area kerja Anda.
                </Text>
              </View>

              <View style={[styles.roleGrid, { gap: vh(8, 1.6, 26) }]}>
                {roleRows.map((row, i) => (
                  <View key={i} style={[styles.roleRow, { gap: vh(8, 1.6, 26) }]}>
                    {row.map((r) => (
                      <RoleCard
                        key={r.id}
                        role={r}
                        onPress={() => pickRole(r)}
                        iconCap={vh(90, 20, 260)}
                        nameSize={vh(16, 2.6, 30)}
                        descSize={vh(12, 1.9, 20)}
                      />
                    ))}
                  </View>
                ))}
              </View>

              <Text style={[styles.footNote, { fontSize: vh(12, 1.8, 20) }]}>
                Butuh akun? Hubungi admin unit kerja Anda.
              </Text>
            </View>
          ) : view === 'context' ? (
            <View style={styles.loginWrap}>
              <View
                style={[
                  styles.card,
                  {
                    gap: vh(14, 3, 38),
                    paddingVertical: vh(22, 4.8, 68),
                    paddingHorizontal: vw(22, 4.4, 76),
                  },
                ]}>
                <View style={styles.contextHead}>
                  <Text style={[styles.activeLabel, { fontSize: vh(14, 2, 24) }]}>{username}</Text>
                  <Text style={[styles.activeName, { fontSize: vh(22, 4, 54) }]}>Pilih peran</Text>
                  <Text style={[styles.contextSub, { fontSize: vh(13, 1.9, 22) }]}>
                    Akun Anda memegang beberapa peran. Satu sesi hanya berlaku untuk satu — Anda
                    bisa keluar dan masuk lagi untuk berganti.
                  </Text>
                </View>

                {errorBanner}

                <View style={{ gap: vh(8, 1.4, 16) }}>
                  {grants.map((g) => (
                    <Pressable
                      key={g.id_user_role}
                      onPress={() => chooseGrant(g)}
                      disabled={busy}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.grantRow,
                        { minHeight: vh(56, 9, 100) },
                        pressed && styles.grantRowPressed,
                        busy && styles.grantRowBusy,
                      ]}>
                      <View style={styles.grantTextWrap}>
                        <Text style={[styles.grantRole, { fontSize: vh(16, 2.4, 28) }]}>
                          {g.role}
                        </Text>
                        <Text style={[styles.grantUnit, { fontSize: vh(13, 1.8, 21) }]}>
                          {g.nama_unit_kerja ?? 'Semua unit kerja'}
                        </Text>
                      </View>
                      <Text style={[styles.grantChevron, { fontSize: vh(22, 3, 32) }]}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : (
              <View style={styles.loginWrap}>
                <View
                  style={[
                    styles.card,
                    {
                      gap: vh(14, 3, 38),
                      paddingVertical: vh(22, 4.8, 68),
                      paddingHorizontal: vw(22, 4.4, 76),
                    },
                  ]}>
                  <View style={[styles.activeRow, { gap: vw(12, 2, 24) }]}>
                    <active.Icon width={vh(64, 12, 140)} height={vh(64, 12, 140)} />
                    <View style={styles.activeTextWrap}>
                      <Text style={[styles.activeLabel, { fontSize: vh(14, 2, 24) }]}>Masuk sebagai</Text>
                      <Text style={[styles.activeName, { fontSize: vh(22, 4, 54) }]}>{active.name}</Text>
                    </View>
                  </View>

                  {errorBanner}

                  <View style={[styles.form, { gap: vh(12, 2.4, 26) }]}>
                    <View style={[styles.field, { gap: vh(6, 1.1, 12) }]}>
                      <Text style={[styles.fieldLabel, { fontSize: vh(15, 2, 24) }]}>Nama pengguna</Text>
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        placeholder="mis. admin.rina"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        editable={!busy}
                        returnKeyType="next"
                        style={[
                          styles.input,
                          { height: vh(52, 8.6, 96), fontSize: vh(17, 2.6, 28) },
                        ]}
                      />
                    </View>

                    <View style={[styles.field, { gap: vh(6, 1.1, 12) }]}>
                      <Text style={[styles.fieldLabel, { fontSize: vh(15, 2, 24) }]}>Kata sandi</Text>
                      <View style={styles.pwWrap}>
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder="Masukkan kata sandi"
                          secureTextEntry={!showPw}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="current-password"
                          editable={!busy}
                          returnKeyType="go"
                          onSubmitEditing={submit}
                          style={[
                            styles.input,
                            styles.pwInput,
                            { height: vh(52, 8.6, 96), fontSize: vh(17, 2.6, 28) },
                          ]}
                        />
                        <Pressable
                          onPress={() => setShowPw((v) => !v)}
                          style={[styles.pwToggle, { height: vh(40, 5.6, 60) }]}>
                          <Text style={[styles.pwToggleText, { fontSize: vh(14, 1.9, 21) }]}>
                            {showPw ? 'Sembunyikan' : 'Lihat'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <Pressable
                      onPress={submit}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy, busy }}
                      style={[
                        styles.submitBtn,
                        busy && styles.submitBtnBusy,
                        { height: vh(54, 8.8, 100), marginTop: vh(2, 0.6, 8) },
                      ]}>
                      <Text style={[styles.submitText, { fontSize: vh(18, 2.8, 32) }]}>
                        {busy ? 'Masuk…' : 'Masuk'}
                      </Text>
                    </Pressable>
                  </View>

                  <Pressable>
                    <Text style={[styles.forgotLink, { fontSize: vh(14, 1.9, 21) }]}>Lupa kata sandi?</Text>
                  </Pressable>
                </View>
              </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  root: {
    flex: 1,
    minHeight: 440,
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  brandText: { fontWeight: '700', letterSpacing: -0.2, color: C.text },

  // ---- role picker ----
  homeWrap: { flex: 1, width: '100%', maxWidth: 1680, justifyContent: 'center' },
  homeHead: { alignItems: 'center' },
  homeTitle: { fontWeight: '800', letterSpacing: -0.4, color: C.text, textAlign: 'center' },
  homeSub: { color: C.muted3, textAlign: 'center' },
  roleGrid: { flex: 1, minHeight: 220, flexDirection: 'column' },
  roleRow: { flex: 1, flexDirection: 'row' },
  roleCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  roleIconSlot: { flex: 1, minHeight: 0, width: '100%', alignItems: 'center', justifyContent: 'center' },
  roleTextWrap: { alignItems: 'center', gap: 2, paddingTop: 2 },
  roleName: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: C.text },
  roleDesc: { fontSize: 12.5, color: C.muted2, textAlign: 'center', lineHeight: 16 },
  footNote: { color: C.muted, textAlign: 'center' },

  // ---- login form ----
  navbar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  navBackBtn: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  navBackIcon: { fontWeight: '700', color: C.primary },
  navBackLabel: { fontWeight: '600', color: C.primary },

  loginWrap: { flex: 1, width: '100%', maxWidth: 920, justifyContent: 'center' },
  card: {
    borderRadius: 26,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  activeRow: { flexDirection: 'row', alignItems: 'center' },
  activeTextWrap: { gap: 4 },
  activeLabel: { fontWeight: '500', color: C.muted2 },
  activeName: { fontWeight: '800', letterSpacing: -0.2, color: C.text },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F3C7C7',
  },
  errorIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center' },
  errorIconText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  errorText: { fontWeight: '500', color: '#B03434', flex: 1 },

  form: {},
  field: {},
  fieldLabel: { fontWeight: '600', color: C.dark2 },
  input: {
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
  },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 132 },
  pwToggle: { position: 'absolute', right: 10, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pwToggleText: { fontWeight: '600', color: C.muted3 },

  submitBtn: {
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnBusy: { opacity: 0.6 },
  submitText: { fontWeight: '700', color: '#fff' },

  // ---- context picker (more than one usable grant) ----
  contextHead: { gap: 4 },
  contextSub: { color: C.muted2, lineHeight: 20 },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  grantRowPressed: { borderColor: C.primary, backgroundColor: C.bg },
  grantRowBusy: { opacity: 0.6 },
  grantTextWrap: { flex: 1, gap: 2 },
  grantRole: { fontWeight: '700', letterSpacing: 0.2, color: C.text },
  grantUnit: { color: C.muted2 },
  grantChevron: { fontWeight: '700', color: C.primary },

  forgotLink: { fontWeight: '600', textAlign: 'center', color: C.primary },
});
