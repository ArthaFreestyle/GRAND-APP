import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import type { SvgProps } from 'react-native-svg';

import LogoSvg from '@/assets/images/login/logo.svg';
import RoleAdminSvg from '@/assets/images/login/role-admin.svg';
import RoleGudangSvg from '@/assets/images/login/role-gudang.svg';
import RoleKasirSvg from '@/assets/images/login/role-kasir.svg';
import RoleOwnerSvg from '@/assets/images/login/role-owner.svg';
import RolePembelianSvg from '@/assets/images/login/role-pembelian.svg';
import RoleSupervisorSvg from '@/assets/images/login/role-supervisor.svg';
import { Colors as C } from '@/constants/theme-erp';

type RoleId = 'admin' | 'kasir' | 'gudang' | 'pembelian' | 'supervisor' | 'owner';

interface RoleDef {
  id: RoleId;
  name: string;
  desc: string;
  Icon: FC<SvgProps>;
  prefill: string;
}

const ROLES: RoleDef[] = [
  { id: 'admin', name: 'Admin', desc: 'Akses penuh sistem', Icon: RoleAdminSvg, prefill: 'admin.rina' },
  { id: 'kasir', name: 'Kasir', desc: 'Penjualan & kas', Icon: RoleKasirSvg, prefill: 'kasir.budi' },
  { id: 'gudang', name: 'Gudang', desc: 'Stok & mutasi barang', Icon: RoleGudangSvg, prefill: 'gudang.sari' },
  { id: 'pembelian', name: 'Pembelian', desc: 'Pesanan ke supplier', Icon: RolePembelianSvg, prefill: 'beli.andi' },
  { id: 'supervisor', name: 'Supervisor', desc: 'Pantau & persetujuan', Icon: RoleSupervisorSvg, prefill: 'spv.dewi' },
  { id: 'owner', name: 'Owner', desc: 'Laporan & analitik', Icon: RoleOwnerSvg, prefill: 'owner.tan' },
];
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
  const { width, height } = useWindowDimensions();
  const { vh, vw } = useFluid();
  const isPortrait = height >= width;
  const roleRows = useMemo(() => chunk(ROLES, isPortrait ? 2 : 3), [isPortrait]);
  const [view, setView] = useState<'home' | 'login'>('home');
  const [roleId, setRoleId] = useState<RoleId | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const active = ROLES.find((r) => r.id === roleId) ?? ROLES[0];

  const pickRole = (r: RoleDef) => {
    setRoleId(r.id);
    setUsername(r.prefill);
    setPassword('');
    setError('');
    setView('login');
  };

  const back = () => {
    setView('home');
    setError('');
  };

  const submit = () => {
    if (!username.trim() || !password.trim()) {
      setError('Nama pengguna dan kata sandi wajib diisi.');
      return;
    }
    setError('');
    // Design routes to the POS Kasir mock on every role; here only the
    // Kasir role actually lands on that screen, everyone else goes to the
    // back-office entry point (there's no real per-role routing table yet).
    router.replace((roleId === 'kasir' ? '/kasir' : '/produk') as never);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {view === 'login' ? (
          <View style={[styles.navbar, { height: vh(52, 7.2, 68), paddingHorizontal: vw(6, 1.4, 16) }]}>
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
            { paddingVertical: vh(16, 2.6, 34), paddingHorizontal: vw(20, 3.4, 52) },
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

                  {error ? (
                    <View style={styles.errorBanner}>
                      <View style={styles.errorIcon}>
                        <Text style={styles.errorIconText}>!</Text>
                      </View>
                      <Text style={[styles.errorText, { fontSize: vh(14, 1.9, 21) }]}>{error}</Text>
                    </View>
                  ) : null}

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
                      style={[
                        styles.submitBtn,
                        { height: vh(54, 8.8, 100), marginTop: vh(2, 0.6, 8) },
                      ]}>
                      <Text style={[styles.submitText, { fontSize: vh(18, 2.8, 32) }]}>Masuk</Text>
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
  submitText: { fontWeight: '700', color: '#fff' },

  forgotLink: { fontWeight: '600', textAlign: 'center', color: C.primary },
});
