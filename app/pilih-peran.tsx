import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors as C } from '@/constants/theme-erp';
import { ApiError } from '@/services/api';
import { logout, switchContext } from '@/services/auth';
import { roleLabel } from '@/services/permissions';
import { useSession } from '@/services/session';

function clamp(min: number, val: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

/** Same fluid sizing as the login screen it is reached from, so the two match. */
function useFluid() {
  const { width, height } = useWindowDimensions();
  return {
    vh: (min: number, pct: number, max: number) => clamp(min, (height * pct) / 100, max),
    vw: (min: number, pct: number, max: number) => clamp(min, (width * pct) / 100, max),
  };
}

/**
 * The one question this screen exists to ask: which of your grants are you
 * working as right now?
 *
 * It is a route rather than a branch of the login screen because it is a
 * different state, not a different view — the person on the other side of it
 * has already authenticated, and their token exists; it just authorizes nothing
 * until a grant is picked. `app/_layout.tsx` guards it on exactly that state,
 * so it cannot be reached before signing in and cannot be reached after a grant
 * is active either.
 *
 * **Most people never see it.** A single usable grant is activated server-side
 * during login, and a repeat of a choice made before on this device is resumed
 * silently (`resumeLastGrant`). What is left is a genuinely new choice, which is
 * rare enough that a plain list is the right weight for it — the six illustrated
 * cards this replaces were sized for a decision nobody actually makes.
 */
export default function PilihPeranScreen() {
  const insets = useSafeAreaInsets();
  const { vh, vw } = useFluid();
  const session = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const grants = session?.grants ?? [];

  const choose = async (idUserRole: number | undefined) => {
    if (busy !== null || idUserRole === undefined) return;
    setError('');
    setBusy(idUserRole);
    try {
      await switchContext(idUserRole);
      // No navigation here on purpose. The session now has an active context,
      // which closes this route's guard in `app/_layout.tsx`; the navigator
      // drops the screen and falls back to the anchor, which sends the session
      // to the home its new role deserves. Racing that with a `replace` of our
      // own would only give the router two answers to the same question.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memilih peran. Coba lagi.');
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: vh(16, 2.6, 34) + insets.top,
          paddingBottom: vh(16, 2.6, 34) + insets.bottom,
          paddingLeft: vw(20, 3.4, 52) + insets.left,
          paddingRight: vw(20, 3.4, 52) + insets.right,
        },
      ]}>
      <View style={styles.wrap}>
        <View
          style={[
            styles.card,
            {
              gap: vh(14, 3, 38),
              paddingVertical: vh(22, 4.8, 68),
              paddingHorizontal: vw(22, 4.4, 76),
            },
          ]}>
          <View style={styles.head}>
            <Text style={[styles.who, { fontSize: vh(14, 2, 24) }]} numberOfLines={1}>
              {session?.user.nama_lengkap || session?.user.username || ''}
            </Text>
            <Text style={[styles.title, { fontSize: vh(22, 4, 54) }]}>Pilih peran</Text>
            <Text style={[styles.sub, { fontSize: vh(13, 1.9, 22) }]}>
              Anda memegang beberapa peran. Satu sesi berlaku untuk satu peran, dan Anda bisa
              berganti kapan saja dari dalam aplikasi.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <Text style={[styles.errorText, { fontSize: vh(14, 1.9, 21) }]}>{error}</Text>
            </View>
          ) : null}

          {grants.length === 0 ? (
            <Text style={[styles.sub, { fontSize: vh(13, 1.9, 22) }]}>
              Akun ini belum punya peran aktif. Hubungi admin unit kerja Anda.
            </Text>
          ) : (
            <View style={{ gap: vh(8, 1.4, 16) }}>
              {grants.map((g) => (
                <Pressable
                  key={g.id_user_role}
                  onPress={() => choose(g.id_user_role)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Masuk sebagai ${roleLabel(g.role)}${
                    g.nama_unit_kerja ? ` di ${g.nama_unit_kerja}` : ''
                  }`}
                  style={({ pressed }) => [
                    styles.row,
                    { minHeight: vh(56, 9, 100) },
                    pressed && styles.rowPressed,
                    busy !== null && styles.rowBusy,
                  ]}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowRole, { fontSize: vh(16, 2.4, 28) }]}>
                      {roleLabel(g.role)}
                    </Text>
                    <Text style={[styles.rowUnit, { fontSize: vh(13, 1.8, 21) }]}>
                      {g.nama_unit_kerja ?? 'Semua unit kerja'}
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { fontSize: vh(22, 3, 32) }]}>
                    {busy === g.id_user_role ? '…' : '›'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => {
              // Dropping the session closes this route's guard the other way,
              // back to the login screen — nothing to navigate by hand.
              void logout();
            }}
            disabled={busy !== null}
            accessibilityRole="button">
            <Text style={[styles.leave, { fontSize: vh(14, 1.9, 21) }]}>
              Bukan Anda? Keluar
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '100%', maxWidth: 920 },
  card: {
    borderRadius: 26,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  head: { gap: 4 },
  who: { fontWeight: '500', color: C.muted2 },
  title: { fontWeight: '800', letterSpacing: -0.2, color: C.text },
  sub: { color: C.muted2, lineHeight: 20 },

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
  errorIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  errorText: { fontWeight: '500', color: '#B03434', flex: 1 },

  row: {
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
  rowPressed: { borderColor: C.primary, backgroundColor: C.bg },
  rowBusy: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  rowRole: { fontWeight: '700', color: C.text },
  rowUnit: { color: C.muted2 },
  chevron: { fontWeight: '700', color: C.primary },

  leave: { fontWeight: '600', textAlign: 'center', color: C.muted3 },
});
