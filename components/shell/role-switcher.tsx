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
// The palette here is still the old blue-and-gold, because this sheet is
// raised over ported and unported screens alike. The *typeface* is not
// palette: a switcher opened from the till in one font and from an invoice
// in another is one control that looks like two, so it takes Poppins now.
// The spacing grid is not palette either, for the same reason.
import { RamahElevation as E, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
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

          <ScrollView style={styles.list} contentContainerStyle={{ gap: L.related }}>
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,36,51,0.35)' },
  sheetWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space5 },
  sheet: {
    width: '100%',
    maxWidth: 420,
    gap: L.space3,
    padding: L.space4,
    borderRadius: 20,
    backgroundColor: C.card,
    // `high`, in place of the border it had: this is the one sheet in the app
    // drawn by hand rather than by the platform, and it floats clear of every
    // screen it is raised over — the same height the native sheets sit at.
    ...E.high,
  },
  sheetTitle: { ...T.titleSmall, color: C.text },
  // muted3, not muted2: muted2 is 3.19:1 on white and this is a sentence.
  sheetSub: { ...T.bodySmall, color: C.muted3 },
  error: { ...T.bodySmall, color: '#B03434' },
  // Capped rather than free-growing: an account with many grants must not push
  // the Batal button off a phone in landscape, which is where kasir lives.
  list: { maxHeight: 260 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    minHeight: 56,
    paddingVertical: L.space3,
    paddingHorizontal: L.space4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  rowActive: { borderColor: C.primary, backgroundColor: C.bg },
  rowPressed: { borderColor: C.primary },
  rowBusy: { opacity: 0.6 },
  rowText: { flex: 1, gap: L.inline },
  rowRole: { ...T.titleTiny, color: C.text },
  rowUnit: { ...T.bodySmall, color: C.muted3 },
  // primaryDark: primary is 4.27:1 on the active row's `bg`.
  rowMark: { ...T.titleSmall, color: C.primaryDark },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...T.titleTiny, color: C.muted3 },
});
