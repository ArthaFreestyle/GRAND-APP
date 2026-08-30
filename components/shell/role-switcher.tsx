/**
 * Switching the active grant from inside the app, and the chip that shows which
 * one is active.
 *
 * Two things this replaces, both of them worse:
 *
 *  - **Logging out to change role.** The only way to become someone else used
 *    to be Keluar, then sign in again, then pick. That is friction on an action
 *    a supervisor does several times a shift, and friction of exactly the kind
 *    that makes people share one account instead — which destroys the audit
 *    trail the split roles exist to produce.
 *  - **Not showing the role at all.** The active grant decides whether a Posting
 *    button appears and whose name a posted document carries, so the person
 *    about to press it has to be able to see what they are acting as. The chip
 *    is not decoration; it is what stops someone posting as the wrong grant.
 *
 * The switch itself is `POST /auth/switch-context`, which issues a **new token**
 * carrying the new grant. That is why the app sends no `X-Active-Role` header
 * anywhere: the active context is inside the credential, checked server-side on
 * every request, and cannot be spoofed by editing local state.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Box } from '@/components/ui/box';
import { Pressable as UiPressable } from '@/components/ui/pressable';
import { Text as UiText } from '@/components/ui/text';
import { Colors as C } from '@/constants/theme-erp';
import { reloadAllRecords } from '@/hooks/use-record-bus';
import { ApiError } from '@/services/api';
import { switchContext } from '@/services/auth';
import { homeRouteFor, roleLabel } from '@/services/permissions';
import { useSession } from '@/services/session';

/**
 * The sheet listing the grants this account holds. Rendered from a `Modal` and
 * styled with the ERP palette rather than NativeWind classes, so the kasir
 * screen — which has its own palette and does not use the shell's components —
 * can open the same one.
 */
export function RoleSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const grants = session?.grants ?? [];
  const activeId = session?.active?.id_user_role;

  const choose = async (idUserRole: number | undefined) => {
    if (busy !== null || idUserRole === undefined) return;
    if (idUserRole === activeId) {
      onClose();
      return;
    }
    setError('');
    setBusy(idUserRole);
    try {
      const next = await switchContext(idUserRole);
      onClose();
      // Every list in the app was answered for the *previous* grant, and a grant
      // carries a unit kerja: the rows on screen are not stale, they are rows
      // this session can no longer see. Telling the mounted ones to re-read is
      // the cheap half of the fix.
      reloadAllRecords();
      // The expensive half is depth. A record open on top of a list belongs to
      // the old context too, and re-reading cannot rescue it — so the pushed
      // screens go, and the session lands on the home its new role deserves.
      // (A detail left open in a *different* section's stack survives this; it
      // is re-read when its screen is next focused and the drawer restores it.)
      if (router.canDismiss()) router.dismissAll();
      router.replace(homeRouteFor(next.active?.role));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal berganti peran. Coba lagi.');
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Tutup" />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Bertindak sebagai</Text>
          <Text style={styles.sheetSub}>
            Peran menentukan apa yang boleh Anda kerjakan dan atas nama siapa dokumen tercatat.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
            {grants.map((g) => {
              const isActive = g.id_user_role === activeId;
              return (
                <Pressable
                  key={g.id_user_role}
                  onPress={() => choose(g.id_user_role)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    styles.row,
                    isActive && styles.rowActive,
                    pressed && styles.rowPressed,
                    busy !== null && styles.rowBusy,
                  ]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowRole}>{roleLabel(g.role)}</Text>
                    <Text style={styles.rowUnit} numberOfLines={1}>
                      {g.nama_unit_kerja ?? 'Semua unit kerja'}
                    </Text>
                  </View>
                  <Text style={styles.rowMark}>
                    {busy === g.id_user_role ? '…' : isActive ? '✓' : '›'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={onClose} disabled={busy !== null} style={styles.cancel}>
            <Text style={styles.cancelText}>Batal</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The header chip. Always shows the active role; only opens the sheet when
 * there is something to switch to, so the majority of staff — who hold exactly
 * one grant — get a label rather than a button that leads to a list of one.
 */
export function RoleChip() {
  const session = useSession();
  const [open, setOpen] = useState(false);

  if (!session?.active) return null;
  const switchable = session.grants.length > 1;
  const label = roleLabel(session.active.role);

  const body = (
    <>
      {/* The gold dot from the drawer's Buka Kasir button: the same accent, used
          again for the same reason — this is state, not a warning. */}
      <Box className="h-[7px] w-[7px] rounded-full bg-gold" />
      <UiText className="text-[12.5px] font-semibold tracking-wide text-dark2" numberOfLines={1}>
        {label}
      </UiText>
      {switchable && <UiText className="text-[11px] text-faint-2">▾</UiText>}
    </>
  );

  return (
    <>
      {switchable ? (
        <UiPressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Bertindak sebagai ${label}. Ganti peran`}
          className="h-9 flex-row items-center gap-2 rounded-full border border-line-card bg-thead px-3 data-[active=true]:bg-line-lighter">
          {body}
        </UiPressable>
      ) : (
        <Box
          accessibilityLabel={`Bertindak sebagai ${label}`}
          className="h-9 flex-row items-center gap-2 rounded-full border border-line-card bg-thead px-3">
          {body}
        </Box>
      )}
      <RoleSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,36,51,0.35)' },
  sheetWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: {
    width: '100%',
    maxWidth: 420,
    gap: 10,
    padding: 18,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: C.text },
  sheetSub: { fontSize: 13, lineHeight: 19, color: C.muted2 },
  error: { fontSize: 13, fontWeight: '500', color: '#B03434' },
  // Capped rather than free-growing: an account with many grants must not push
  // the Batal button off a phone in landscape, which is where kasir lives.
  list: { maxHeight: 260 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  rowActive: { borderColor: C.primary, backgroundColor: C.bg },
  rowPressed: { borderColor: C.primary },
  rowBusy: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  rowRole: { fontSize: 15.5, fontWeight: '700', color: C.text },
  rowUnit: { fontSize: 12.5, color: C.muted2 },
  rowMark: { fontSize: 18, fontWeight: '700', color: C.primary },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: C.muted3 },
});
