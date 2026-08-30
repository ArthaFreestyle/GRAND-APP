import { Feather } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/services/api';
import { login, resumeLastGrant } from '@/services/auth';
import { homeRouteFor } from '@/services/permissions';
import { clearSession, hasActiveContext, useSession } from '@/services/session';

/**
 * Sign in, and nothing else.
 *
 * This screen used to open on a grid of six role cards — Admin, Kasir, Gudang,
 * Pembelian, Supervisor, Owner — tapped *before* authenticating. Three things
 * were wrong with that, and they are why it is gone rather than restyled:
 *
 *  - It was branding. The card never reached the server and never decided
 *    anything; the session's role comes back from `auth/login` inside the token.
 *  - Four of the six names are not roles this contract has. There is no ADMIN,
 *    GUDANG, PEMBELIAN, SUPERVISOR, or OWNER — only `SUPERADMIN`, `INVENTARIS`,
 *    and `CASHIER`. It was a menu of mostly fictional choices.
 *  - It published the shape of the organisation to anyone holding the device,
 *    signed in or not, and five taps out of six led to a dead end.
 *
 * Picking a role is now something that happens *after* the server says which
 * ones you hold, on `/pilih-peran`, and only when you hold more than one.
 *
 * **Proportions are fixed, not derived from the window.** Every size here used
 * to be a `clamp(min, Nvh, max)` ported from the web design, which meant the
 * type scale grew with the *height* of the screen: on a tall phone the title
 * came out at 34px and the fields at 73pt tall with 22px text, and on a tablet
 * the same form reached a 54px heading, 96pt fields and a 100pt button, all
 * spread across a 920pt-wide card. Nothing about a sign-in form gets easier as
 * the screen gets taller. Two fields and a button are the same two fields and a
 * button on every device, so they are one column, one type scale, and one width
 * cap — the screen only decides how much air is left around them.
 */

/**
 * **This screen's palette is local, the way `app/kasir.tsx`'s `K` is.**
 *
 * The values below are the Ramah design system's tokens read straight off
 * `_ds/…/tokens/colors.css`: a green brand (`--brand` #008A0C) on a white page,
 * with grey filled fields. The rest of the back office is the blue-and-gold
 * palette in `constants/theme-erp.ts`, and the two never meet — `(admin)` and
 * `kasir` sit behind `Stack.Protected` guards this screen does not render
 * inside, so no frame shows both.
 *
 * It is deliberately *not* pushed into `constants/theme-erp.ts`,
 * `tailwind.config.js` and the gluestack provider config. Those three hold the
 * same palette three times and are read by all nine other sections; swapping
 * the brand hue there would silently restyle every list, badge, dialog and
 * status colour in the app, which is a far larger change than a new login page.
 * When the rest of the app moves onto this system, this block is what gets
 * promoted — until then it stays where its only consumer is.
 */
const D = {
  surfacePage: '#FFFFFF',
  /** `--surface-field`, grey-100. The fields are filled, not outlined, and there is no card. */
  surfaceField: '#F5F5F5',

  brand: '#008A0C',
  brandPress: '#00530A',
  brandInk: '#006B09',
  brandTintSoft: '#F1FAF2',

  textTitle: '#2B2B2B',
  textBody: '#6B6B6B',
  textMuted: '#9B9B9B',
  textOnBrand: '#FFFFFF',

  borderStrong: '#DCDCDC',
  /** `--border-focus`. A focused field is the only thing on this screen that shows a border. */
  borderFocus: '#006B09',

  danger: '#E02020',
  dangerTint: '#FDECEC',
  accentBlueInk: '#1F5478',
  accentBlueTint: '#F0F6FA',
} as const;

/**
 * The column the form lives in. A login form is read straight down; past ~420pt
 * the label and its field stop reading as a pair, and the eye has to travel the
 * width of a tablet between them. The board is drawn at 390pt with 24pt
 * gutters, so on a phone this cap never binds — it is here for the tablet.
 */
const COLUMN = 420;

/** `--gutter`: the screen's left/right margin, and what the CTA is inset by. */
const GUTTER = 24;

/** `--control-h`: the height a field and the primary button share. */
const CONTROL_H = 52;

/** `--tap-min`, which the token file annotates "never smaller". */
const TAP_MIN = 48;

/**
 * One message slot, two tones, sitting directly under the fields.
 *
 * This screen can say three different kinds of thing and the board draws a
 * place for only one of them: the credential failure, which it puts in the
 * username field's own error slot. The other two — a request that never reached
 * the server, and an account the server accepted but which holds no usable
 * grant — are not about the username, so hanging them under that label would
 * blame the wrong thing. They land here instead, together with the answer to
 * "Lupa sandi?", which is a fact rather than a failure and so is drawn in the
 * blue accent rather than the danger red.
 */
type Notice = { tone: 'danger' | 'info'; text: string } | null;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  /** The credential failure only — it renders inside the username field, per the board. */
  const [credentialError, setCredentialError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  /**
   * `--border-focus` is a per-field colour, so focus is tracked per field. One
   * piece of state naming the focused field rather than a boolean each, because
   * only one field can hold focus at a time and two booleans can disagree.
   */
  const [focused, setFocused] = useState<'username' | 'password' | null>(null);

  /**
   * Checked, this resumes the grant this user last worked as on this device and
   * skips `/pilih-peran` — which is exactly what `rememberGrant` / `recallGrant`
   * in `services/session.ts` already store, keyed per user id because a POS
   * terminal is shared hardware. Unchecked, the resume is skipped and the
   * picker is shown, so someone signing in on a colleague's device lands on the
   * question instead of silently inheriting yesterday's answer.
   *
   * It changes nothing for the majority who hold exactly one grant: that one is
   * activated server-side during `auth/login`, so there is no second step left
   * to skip. Defaulted on, as the board has it, because for the people it does
   * affect the answer is the same nearly every day.
   */
  const [ingatPerangkat, setIngatPerangkat] = useState(true);

  /** Moving from username to password with the keyboard's own "next" key. */
  const passwordRef = useRef<TextInput>(null);

  /**
   * Press feedback is held in state rather than read from `Pressable`'s own
   * `style={({ pressed }) => …}` callback, **and it has to stay that way in this
   * app.**
   *
   * `babel.config.js` sets `jsxImportSource: 'nativewind'`, so every element in
   * the app is routed through NativeWind's jsx runtime and `Pressable` is
   * swapped for the `cssInterop` wrapper whether or not it carries a
   * `className`. That wrapper normalises `style` in `collectInlineRules`
   * (`react-native-css-interop/…/native-interop.js`): anything that is not an
   * array is pushed into one. A *function* is not an array, so it is pushed in
   * as though it were a style object, and React Native's `Pressable` — which
   * only invokes `style` when it is itself a function, never one nested inside
   * an array — hands `[fn]` to `StyleSheet.flatten`, which drops it.
   *
   * The button then renders with no styles whatsoever: no fill, no radius, no
   * height. Its label keeps `styles.submitText`, because a plain object
   * survives that path — so the screen showed white 16pt text on a white page
   * and the button looked like it had simply vanished, while still being there
   * and still being tappable. An array of plain objects is the shape the
   * wrapper handles correctly, and it is what every other screen in this repo
   * already passes.
   */
  const [submitPressed, setSubmitPressed] = useState(false);
  const [forgotPressed, setForgotPressed] = useState(false);

  /**
   * How much of the screen the Android keyboard is currently covering.
   *
   * `app.json` sets `"edgeToEdgeEnabled": true`, and under edge-to-edge the
   * Android window is **not resized** when the IME opens — the app keeps
   * drawing at full height behind it. That is what makes the usual advice fail
   * here: `KeyboardAvoidingView` with `behavior={undefined}` relies on the
   * window having already shrunk, so on this app it does nothing at all, and
   * anything sitting at the bottom of the screen — the "Masuk" button — is
   * simply covered by the keyboard with no way to reach it.
   *
   * Measuring the keyboard and adding it to the scroll content's bottom padding
   * is what makes the content taller than the viewport, so the button can be
   * scrolled up to. iOS resizes properly and is handled by the
   * `KeyboardAvoidingView` below, so this stays Android-only rather than
   * fighting it for control of the same space.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  const clearMessages = () => {
    if (credentialError) setCredentialError('');
    if (notice) setNotice(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setCredentialError('');
    setNotice(null);
    setBusy(true);
    try {
      const fresh = await login(username.trim(), password);
      // A token that authorizes nothing is not a sign-in. Dropping it here is
      // what keeps the redirects below from sending an empty session on to a
      // picker with no rows in it.
      if (!fresh.active && fresh.grants.length === 0) {
        clearSession();
        setNotice({
          tone: 'danger',
          text: 'Akun ini belum punya peran aktif. Hubungi admin unit kerja Anda.',
        });
        return;
      }
      // Exactly one usable grant is activated server-side, so `active` is set
      // already and this is a no-op. More than one leaves the choice to us — and
      // for someone who has made that choice on this device before, the answer
      // is nearly always the same as last time, so resume it instead of asking,
      // unless they have just said this is not their device.
      if (ingatPerangkat) await resumeLastGrant(fresh);
    } catch (e) {
      // The contract answers every credential failure with one message, which is
      // the case the board points at the username field. Anything else — no
      // network, a 500 — is not about what was typed, and goes to the notice
      // slot rather than implying the username was wrong.
      if (e instanceof ApiError && e.status === 401) {
        setCredentialError(e.message);
      } else {
        setNotice({
          tone: 'danger',
          text: e instanceof ApiError ? e.message : 'Gagal masuk. Periksa koneksi, lalu coba lagi.',
        });
      }
    } finally {
      // Leaving the screen is the redirects' job below, and they are held off
      // while this is true — otherwise the picker flashes for the moment between
      // login returning and the resumed grant coming back.
      setBusy(false);
    }
  };

  // Declarative, rather than a `router.replace` in an effect. This screen is the
  // stack's anchor and stays mounted, so it is the one place that can answer
  // "where does this session belong" for a cold start, a fresh sign-in, and a
  // session dropped from somewhere else, with the same two conditions.
  if (!busy && hasActiveContext(session)) {
    return <Redirect href={homeRouteFor(session.active.role)} />;
  }
  if (!busy && session !== null && session.grants.length > 0) {
    return <Redirect href="/pilih-peran" />;
  }

  const usernameBorder = credentialError
    ? D.danger
    : focused === 'username'
      ? D.borderFocus
      : 'transparent';
  const passwordBorder = focused === 'password' ? D.borderFocus : 'transparent';

  return (
    <View style={styles.root}>
      {/* The board gives the login screen a dark status bar over a white page.
          The root layout sets `auto`, which follows the colour scheme — but this
          screen is white in either scheme, so it names its own. */}
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        // The pairing Expo documents: `padding` on iOS, and on Android the mere
        // presence of the view is enough — `adjustResize` has already shrunk the
        // window by the time RN sees it, and adding `padding` on top of that
        // double-counts the keyboard and drives the button up into the fields.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollBody,
            {
              paddingTop: insets.top + 44,
              // Longhands, and every edge given one. `styles.scrollBody` used to
              // carry a `paddingHorizontal` that these two silently overrode —
              // a longhand beats a shorthand no matter which was written first —
              // so on a phone, where the left and right insets are both 0, the
              // gutter collapsed and the form sat flush against the screen
              // edges. Nothing here may set a padding shorthand any more.
              paddingLeft: insets.left + GUTTER,
              paddingRight: insets.right + GUTTER,
              paddingBottom: insets.bottom + 22 + keyboardHeight,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // The form fits without scrolling on any phone; the scroll view is
          // here for the keyboard and for a raised system font size, and an
          // indicator on a two-field form is noise.
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.head}>
              {/* The board draws the wordmark as type rather than as a logo, so
                  `assets/images/login/logo.svg` is no longer referenced here.
                  The name stays this app's own rather than the design system's
                  demo brand. */}
              <Text style={styles.wordmark}>Manajemen POS</Text>
              <Text style={styles.title}>Masuk dulu, ya</Text>
              <Text style={styles.lede}>
                Pakai akun yang dibuat admin unit kerja. Satu akun bisa punya beberapa wewenang.
              </Text>
            </View>

            <View style={styles.fields}>
              <View>
                <Text style={styles.label}>Nama pengguna</Text>
                <View style={[styles.control, { borderColor: usernameBorder }]}>
                  <Feather name="user" size={20} color={D.textMuted} />
                  <TextInput
                    value={username}
                    onChangeText={(v) => {
                      setUsername(v);
                      clearMessages();
                    }}
                    onFocus={() => setFocused('username')}
                    onBlur={() => setFocused(null)}
                    placeholder="mis. rina.gudang"
                    placeholderTextColor={D.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    editable={!busy}
                    returnKeyType="next"
                    // Keep the keyboard up while focus moves to the password —
                    // the default would dismiss it and then raise it again.
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    style={styles.input}
                  />
                </View>
                {credentialError ? (
                  <Text style={styles.fieldError}>{credentialError}</Text>
                ) : null}
              </View>

              <View>
                <Text style={styles.label}>Sandi</Text>
                <View style={[styles.control, { borderColor: passwordBorder }]}>
                  <Feather name="lock" size={20} color={D.textMuted} />
                  <TextInput
                    ref={passwordRef}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      clearMessages();
                    }}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder="Sandi akun"
                    placeholderTextColor={D.textMuted}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    editable={!busy}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    style={styles.input}
                  />
                  {/* Not on the board, which draws the password field with a
                      lock and nothing else. It is kept because a phone keyboard
                      mistypes a password often enough that every password field
                      people already use offers this, and here a wrong sandi
                      costs a round trip to find out about. It borrows the
                      field's own icon slot — 20pt, `--icon-muted` — so it reads
                      as part of the field rather than a control parked on top of
                      it, and takes its tap target from `hitSlop` rather than
                      from padding, which would push the input's text off
                      centre. */}
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    hitSlop={(TAP_MIN - 20) / 2}
                    accessibilityRole="button"
                    accessibilityLabel={showPw ? 'Sembunyikan sandi' : 'Lihat sandi'}>
                    <Feather name={showPw ? 'eye-off' : 'eye'} size={20} color={D.textMuted} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.row}>
                <Pressable
                  onPress={() => setIngatPerangkat((v) => !v)}
                  hitSlop={12}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ingatPerangkat }}
                  accessibilityLabel="Ingat perangkat ini"
                  style={styles.checkRow}>
                  <View style={[styles.box, ingatPerangkat ? styles.boxOn : styles.boxOff]}>
                    {ingatPerangkat ? (
                      <Feather name="check" size={16} color={D.textOnBrand} />
                    ) : null}
                  </View>
                  <Text style={styles.checkLabel}>Ingat perangkat ini</Text>
                </Pressable>

                {/* The board wires this to a no-op. A control that does nothing
                    is worse than no control, so rather than drop it or fake it,
                    it answers with the fact: this contract has no password reset
                    endpoint, because resetting one is an admin's job. That line
                    used to sit at the bottom of the screen as permanent small
                    print, read by nobody who did not need it. */}
                <Pressable
                  onPress={() =>
                    setNotice({
                      tone: 'info',
                      text: 'Sandi hanya bisa direset oleh admin unit kerja Anda.',
                    })
                  }
                  accessibilityRole="button"
                  onPressIn={() => setForgotPressed(true)}
                  onPressOut={() => setForgotPressed(false)}
                  style={[styles.ghost, forgotPressed && styles.ghostPressed]}>
                  <Text style={styles.ghostText}>Lupa sandi?</Text>
                </Pressable>
              </View>

              {notice ? (
                <View
                  style={[
                    styles.notice,
                    notice.tone === 'danger' ? styles.noticeDanger : styles.noticeInfo,
                  ]}>
                  <Feather
                    name={notice.tone === 'danger' ? 'alert-circle' : 'info'}
                    size={16}
                    color={notice.tone === 'danger' ? D.danger : D.accentBlueInk}
                  />
                  <Text style={styles.noticeText}>{notice.text}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* The board draws the CTA against the bottom edge rather than stacked
              under the fields: it is the one action here, and the bottom edge is
              where a thumb already is.

              It is *inside* the scroll view, not pinned below it. Pinned, it
              sits at the bottom of a window that edge-to-edge never shrinks, so
              the keyboard covers it and nothing can bring it back. In here, the
              content container's `flexGrow` plus `space-between` still park it
              on the bottom edge whenever the form leaves room, and once the
              keyboard is up the padding above has made the content taller than
              the viewport, so the same button scrolls into reach.
              `keyboardShouldPersistTaps="handled"` is what lets it be pressed
              without a dismissing tap first. */}
          <View style={styles.cta}>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy }}
              onPressIn={() => setSubmitPressed(true)}
              onPressOut={() => setSubmitPressed(false)}
              style={[
                styles.submit,
                submitPressed && styles.submitPressed,
                !canSubmit && styles.submitDisabled,
              ]}>
              <Text style={styles.submitText}>{busy ? 'Masuk…' : 'Masuk'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: D.surfacePage },

  /**
   * `flexGrow` with `space-between` is what puts the form at the top and the
   * button on the bottom edge while there is room, and turns the same thing
   * into an ordinary scrolling column once the keyboard's padding makes it
   * taller than the screen. Deliberately no padding *shorthand* here — see the
   * note on the inline style that pairs with it.
   */
  scrollBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  column: { width: '100%', maxWidth: COLUMN, gap: 28 },
  // 28 clear of the fields when the two ends meet on a short screen, so the
  // button never ends up touching the checkbox row.
  cta: { width: '100%', maxWidth: COLUMN, marginTop: 28 },

  head: { gap: 10 },
  wordmark: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.78,
    color: D.brand,
  },
  // `--type-h1`, with `--tracking-title` (-0.01em) resolved against 28px.
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.28,
    color: D.textTitle,
  },
  lede: { fontSize: 15, lineHeight: 22, color: D.textBody },

  fields: { gap: 16 },
  // `--type-caption` at `--fw-medium`, 8pt clear of its field.
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: D.textBody, marginBottom: 8 },
  /**
   * The filled field. `minHeight` rather than `height` so a raised system font
   * size grows it instead of being clipped by it, and the border is always 1.5
   * and only ever changes colour — animating a border *width* would shift the
   * text inside the field by a pixel every time it took focus.
   */
  control: {
    minHeight: CONTROL_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: D.surfaceField,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: D.textTitle,
  },
  fieldError: { fontSize: 13, lineHeight: 18, marginTop: 8, color: D.danger },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: D.brand, borderColor: D.brand },
  boxOff: { backgroundColor: D.surfacePage, borderColor: D.borderStrong },
  checkLabel: { fontSize: 15, lineHeight: 22, color: D.textBody },

  // `--control-h-sm`, ghost variant: no fill until pressed, brand ink text.
  ghost: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostPressed: { backgroundColor: D.brandTintSoft },
  ghostText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: D.brandInk },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  noticeDanger: { backgroundColor: D.dangerTint },
  noticeInfo: { backgroundColor: D.accentBlueTint },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: D.textBody },

  submit: {
    minHeight: CONTROL_H,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: D.brand,
  },
  // `--press-scale`. The system is flat by rule — there is no shadow to lift, so
  // a press reads as the fill darkening and the button shrinking.
  submitPressed: { backgroundColor: D.brandPress, transform: [{ scale: 0.98 }] },
  submitDisabled: { opacity: 0.4 },
  submitText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.16,
    color: D.textOnBrand,
  },
});
