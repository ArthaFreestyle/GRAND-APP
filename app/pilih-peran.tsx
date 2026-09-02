import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/services/api';
import { logout, switchContext } from '@/services/auth';
import { asRoleName, roleLabel, type RoleName } from '@/services/permissions';
import { markContextChosen, recallGrant, rememberGrant, useSession } from '@/services/session';

/**
 * The one question this screen exists to ask: which of your grants are you
 * working as right now?
 *
 * It is a route rather than a branch of the login screen because it is a
 * different state, not a different view — the person on the other side of it
 * has already authenticated, and their token exists. `app/_layout.tsx` guards
 * it on exactly that state, so it cannot be reached before signing in and is
 * dropped the moment a grant is chosen.
 *
 * **Every sign-in comes through here, including the single-grant one.** The
 * contract activates a grant server-side whenever exactly one is usable, so
 * that login arrives already authorizing things — which is the case that most
 * needs a screen, because its holder was never asked anything and a wrong
 * account on a shared counter terminal is otherwise found out by writing to the
 * wrong unit kerja. `Session.contextChosen` is what tells the two apart; with
 * one grant this screen is a confirmation, with several it is a choice, and it
 * is the same list either way. The list itself is `grants` from the
 * `auth/login` response — the server's own account of what this login may
 * become — never anything the client kept.
 *
 * **Drawn from the Ramah board's "Pilih konteks" screen**, which is the second
 * frame of the same flow `app/index.tsx` implements the first of: a 56pt
 * `AppHeader` with a back arrow, a heading that counts the grants, a divided
 * list of rows (tinted glyph, peran, unit kerja, chevron), and one blue note
 * saying the choice is not permanent. Everything below is that board's tokens
 * read off `_ds/…/tokens/*.css`, not an approximation of it.
 *
 * **Proportions are fixed, not derived from the window** — the same correction
 * `app/index.tsx` carries. Both screens used to size every value through a
 * local `useFluid()` porting the web design's `clamp(min, Nvh, max)`, which
 * tied the type scale to the *window height*: a 22px heading and 56pt rows on a
 * short phone, 54px and 100pt rows on a tablet, inside a card capped at 920pt.
 * A list of three rows is the same list of three rows on every device. Only the
 * air around it should change, and the safe-area insets are what change it.
 */

/**
 * **This screen's palette is local, the way `app/index.tsx`'s is.**
 *
 * The two are the only screens outside `Stack.Protected`'s signed-in guards, so
 * they are the only ones that can render the Ramah green-on-white system
 * without sitting in the same frame as the back office's blue-and-gold
 * (`constants/theme-erp.ts`). Promoting these values into that file, the
 * Tailwind config and the gluestack provider — which hold the same palette
 * three times — would restyle all nine sections at once. It stays here until
 * the rest of the app moves onto this system.
 */
const D = {
  surfacePage: '#FFFFFF',

  brand: '#008A0C',

  /** `--grey-50`: the only thing a pressed list row changes, per `ListItem`. */
  surfacePressed: '#FAFAFA',
  surfaceField: '#F5F5F5',

  textTitle: '#2B2B2B',
  textBody: '#6B6B6B',
  textMuted: '#9B9B9B',

  /** `--border-hairline`. Lists in this system are divided, never split into cards. */
  borderHairline: '#EBEBEB',

  danger: '#E02020',
  dangerTint: '#FDECEC',
  accentBlue: '#2E74A0',
  accentBlueInk: '#1F5478',
  accentBlueTint: '#F0F6FA',
} as const;

/** `--gutter`, and what the header, the rows and the note are all inset by. */
const GUTTER = 24;

/** `--header-h`. */
const HEADER_H = 56;

/** `ListItem`'s leading tile: 40pt at `--radius-field`, with a 20pt glyph inside. */
const TILE = 40;

/** `--space-3`, the gap between that tile and the row's text. */
const ROW_GAP = 12;

type IconName = React.ComponentProps<typeof Feather>['name'];

/**
 * A glyph and a tint per role.
 *
 * The board draws its three demo grants — staf gudang, supervisor, pemilik —
 * each in a different product colour, which is the system's rule for category
 * markers: they mark *which kind of thing this is*, and are never global
 * chrome. This contract's roles are a different three, so the mapping is
 * rebuilt against `RoleName` rather than transliterated; the colours are the
 * board's own (`--blue-100`/`--accent-blue`, `--sky-50`/`--sky-600`,
 * `--navy-50`/`--navy-500`).
 *
 * Roles are told apart by colour *and* by glyph, never by colour alone —
 * `INVENTARIS` and `CASHIER` sit on adjacent blues, and a red-green blind
 * reader is not the only one who reads a list of three tinted circles by shape.
 */
const ROLE_LOOK: Record<RoleName, { icon: IconName; tint: string; color: string }> = {
  SUPERADMIN: { icon: 'shield', tint: '#EDF1F5', color: '#103352' },
  INVENTARIS: { icon: 'package', tint: '#DCEAF3', color: D.accentBlue },
  CASHIER: { icon: 'shopping-bag', tint: '#EBF7FD', color: '#2B8ABA' },
};

/**
 * A role the contract does not list still gets a row rather than being hidden.
 * `roleLabel` already prints an unknown role as-is on purpose — a grant the
 * server offers and the app silently drops is a session that can never be
 * started — so it needs a neutral look to wear.
 */
const UNKNOWN_LOOK = { icon: 'user' as IconName, tint: D.surfaceField, color: D.textBody };

export default function PilihPeranScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  /**
   * Press feedback is held in state rather than read from `Pressable`'s own
   * `style={({ pressed }) => …}` callback, and it has to stay that way in this
   * app: `babel.config.js` sets `jsxImportSource: 'nativewind'`, so every
   * `Pressable` is the cssInterop wrapper, which normalises a non-array `style`
   * by wrapping it in an array — and RN only calls `style` when it is a
   * function *itself*, not one nested in an array. The function is dropped by
   * `StyleSheet.flatten` and the element renders with no styles at all. See the
   * long note on the same hazard in `app/index.tsx`.
   *
   * `-1` is the back arrow: no grant can carry that id, and one piece of state
   * cannot disagree with itself the way a boolean per control can.
   */
  const [pressedId, setPressedId] = useState<number | null>(null);

  /**
   * The grant this user last worked as **on this device**, which used to be
   * resumed silently and skip this screen entirely. Now that the question is
   * always asked, the same stored answer is worth showing rather than acting
   * on: it turns "which of these three" into "the same one as yesterday, or
   * not", which is the shape the choice actually has for someone who signs into
   * the same terminal every morning.
   *
   * Async, so it lands a frame or two after the rows do. That is why it only
   * ever *adds* a caption — nothing moves when it arrives, and a row that never
   * gets one is not missing anything.
   */
  const [lastUsed, setLastUsed] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void recallGrant(session?.user.id).then((id) => {
      if (alive) setLastUsed(id);
    });
    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  const grants = session?.grants ?? [];

  /**
   * The board greets by given name ("Hai Rina"), which is what makes the line a
   * greeting rather than a record header. A full `nama_lengkap` in a 22px
   * heading wraps to three lines on a phone and reads like a form field.
   */
  const fullName = (session?.user.nama_lengkap || session?.user.username || '').trim();
  const firstName = fullName.split(/\s+/)[0] ?? '';

  const choose = async (idUserRole: number | undefined) => {
    if (busy !== null || idUserRole === undefined) return;
    setError('');
    setBusy(idUserRole);
    try {
      if (session?.active?.id_user_role === idUserRole) {
        // Already running as this grant — the single-grant login the server
        // activated for us. `auth/switch-context` would happily issue a second
        // token for the context the session is already in, but that is a round
        // trip that can fail on a bad connection and leave someone unable to
        // confirm a session that was never in doubt. Confirming it locally is
        // the whole of what is left to do; the id is still recorded, because
        // "last used here" is about this device and not about the token.
        markContextChosen();
        void rememberGrant(session.user.id, idUserRole);
        return;
      }
      await switchContext(idUserRole);
      // No navigation here on purpose. The session now has an active context,
      // which closes this route's guard in `app/_layout.tsx`; the navigator
      // drops the screen and falls back to the anchor, which sends the session
      // to the home its new role deserves. Racing that with a `replace` of our
      // own would only give the router two answers to the same question.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memilih wewenang. Coba lagi.');
      setBusy(null);
    }
  };

  const gutterLeft = GUTTER + insets.left;
  const gutterRight = GUTTER + insets.right;

  /**
   * Three counts, three different questions, so the heading says which one this
   * is rather than printing "1 wewenang" and leaving the reader to work out
   * that there is nothing to choose between.
   */
  const heading =
    grants.length === 0
      ? 'Akun ini belum punya wewenang'
      : grants.length === 1
        ? firstName
          ? `Hai ${firstName}, ini wewenang Anda`
          : 'Ini wewenang Anda'
        : firstName
          ? `Hai ${firstName}, ada ${grants.length} wewenang di akun ini`
          : `Ada ${grants.length} wewenang di akun ini`;

  const lede =
    grants.length === 0
      ? 'Minta admin unit kerja Anda memberi wewenang, lalu masuk lagi.'
      : grants.length === 1
        ? 'Periksa unit kerjanya, lalu ketuk untuk mulai bekerja.'
        : 'Pilih satu untuk dipakai sekarang. Sebelum dipilih, sesi belum boleh apa-apa.';

  return (
    <View style={styles.root}>
      {/* The page is white in either colour scheme, so it names its own bar
          rather than inheriting the root layout's `auto`. */}
      <StatusBar style="dark" />

      <View
        style={[
          styles.header,
          { paddingTop: insets.top, paddingLeft: gutterLeft, paddingRight: gutterRight },
        ]}>
        {/*
          The board's `AppHeader` back arrow returns to the login screen, and
          from here that means *ending the half-finished sign-in* — there is no
          screen to pop back to, because `app/_layout.tsx` renders exactly one
          of the two. Dropping the session is what closes this route's guard the
          other way, so like `choose` above it navigates nothing by hand.

          Its label says so in full. A chevron that signs you out is the
          convention every sign-in flow uses and still not something a glyph can
          state, and this replaces a "Bukan Anda? Keluar" link at the bottom of
          the screen: the same action, twice, on the axis a phone has least of.
        */}
        <Pressable
          onPress={() => void logout()}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Keluar dan kembali ke halaman masuk"
          hitSlop={8}
          onPressIn={() => setPressedId(-1)}
          onPressOut={() => setPressedId(null)}
          style={[styles.backButton, pressedId === -1 && styles.backButtonPressed]}>
          <Feather name="arrow-left" size={20} color={D.textTitle} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Pilih wewenang
        </Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.head, { paddingLeft: gutterLeft, paddingRight: gutterRight }]}>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.lede}>{lede}</Text>
        </View>

        {error ? (
          <View style={[styles.notice, { marginLeft: gutterLeft, marginRight: gutterRight }]}>
            <Feather name="alert-circle" size={16} color={D.danger} />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        {/*
          The list runs to the screen edge and each row carries the gutter
          itself, which is what `ListItem` does in the design system and what
          every phone list people already use does: the tap target is the full
          width of the screen, not a column inset inside one. The divider is
          inset to where the row's *title* starts — gutter + tile + gap — so it
          separates two rows rather than drawing a line under a glyph.
        */}
        <View>
          {grants.map((g, i) => {
            const role = asRoleName(g.role);
            const look = role ? ROLE_LOOK[role] : UNKNOWN_LOOK;
            const id = g.id_user_role;
            const isBusy = busy !== null && busy === id;
            return (
              <View key={id ?? `grant-${i}`}>
                <Pressable
                  onPress={() => choose(id)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy !== null, busy: isBusy }}
                  accessibilityLabel={`Pakai wewenang ${roleLabel(g.role)}${
                    g.nama_unit_kerja ? `, ${g.nama_unit_kerja}` : ', semua unit kerja'
                  }`}
                  onPressIn={() => setPressedId(id ?? null)}
                  onPressOut={() => setPressedId(null)}
                  style={[
                    styles.row,
                    { paddingLeft: gutterLeft, paddingRight: gutterRight },
                    pressedId === id && styles.rowPressed,
                    busy !== null && !isBusy && styles.rowDimmed,
                  ]}>
                  <View style={[styles.tile, { backgroundColor: look.tint }]}>
                    <Feather name={look.icon} size={20} color={look.color} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{roleLabel(g.role)}</Text>
                    <Text style={styles.rowSubtitle}>{g.nama_unit_kerja ?? 'Semua unit kerja'}</Text>
                    {/* Only when there is something to tell apart. With one
                        grant on the account it is the only row on the screen,
                        and saying it was also the last one is a line nobody
                        acts on. */}
                    {grants.length > 1 && id !== undefined && id === lastUsed ? (
                      <Text style={styles.rowHint}>Terakhir dipakai di perangkat ini</Text>
                    ) : null}
                  </View>
                  {isBusy ? (
                    <ActivityIndicator size="small" color={D.brand} />
                  ) : (
                    <Feather name="chevron-right" size={20} color={D.textMuted} />
                  )}
                </Pressable>
                {i < grants.length - 1 ? (
                  <View style={[styles.divider, { marginLeft: gutterLeft + TILE + ROW_GAP }]} />
                ) : null}
              </View>
            );
          })}
        </View>

        {grants.length > 0 ? (
          <View style={[styles.info, { marginLeft: gutterLeft, marginRight: gutterRight }]}>
            <Feather name="info" size={20} color={D.accentBlueInk} />
            <Text style={styles.infoText}>
              Wewenang menempel pada unit kerja. Ganti kapan saja dari menu di dalam aplikasi, tanpa
              keluar akun.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: D.surfacePage },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /**
   * `IconButton` at its 40pt default, pulled back by 10 so the *glyph* lands on
   * the gutter rather than the button's edge — the header's own inset then
   * matches the rows below it, which have no such padding to give back.
   */
  backButton: {
    width: 40,
    height: HEADER_H,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `--press-dim` / `--press-scale`: the system is flat, so a press is a dim and
  // a shrink rather than a shadow being lifted.
  backButtonPressed: { opacity: 0.6, transform: [{ scale: 0.98 }] },
  // `--type-h3`, with `--tracking-title` (-0.01em) resolved against 18px.
  headerTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.18,
    color: D.textTitle,
  },

  // The board's 20pt rhythm between the heading, the list and the note.
  body: { flexGrow: 1, paddingTop: 4, gap: 20 },

  head: { gap: 8 },
  // `--type-h2` + `--tracking-title`.
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.22,
    color: D.textTitle,
  },
  lede: { fontSize: 15, lineHeight: 22, color: D.textBody },

  /**
   * `minHeight` rather than `height`, so a raised system font size grows the
   * row instead of being clipped by it — and 56 is `--tap-min` plus the 12pt
   * padding either side, so the row is never smaller than a thumb.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: 56,
    paddingVertical: 12,
    backgroundColor: D.surfacePage,
  },
  rowPressed: { backgroundColor: D.surfacePressed },
  // One switch is in flight; the others are still on screen but no longer
  // choices, and the row being waited on keeps full contrast so it reads as the
  // one that was tapped.
  rowDimmed: { opacity: 0.5 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1, minWidth: 0 },
  // `--type-body-strong`.
  rowTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: D.textTitle },
  // `--type-caption`, `--text-muted`.
  rowSubtitle: { fontSize: 13, lineHeight: 18, color: D.textMuted },
  // A hint, not a status: `--fs-micro` in the accent blue the note at the foot
  // of the screen already speaks in, so it reads as the app remembering rather
  // than as something being wrong with the row.
  rowHint: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: D.accentBlueInk, marginTop: 2 },
  divider: { height: 1, backgroundColor: D.borderHairline },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: D.dangerTint,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: D.textBody },

  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    // `--radius-card`.
    borderRadius: 16,
    backgroundColor: D.accentBlueTint,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: D.textBody },
});
