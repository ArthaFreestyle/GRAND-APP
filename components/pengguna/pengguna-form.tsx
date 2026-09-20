/**
 * The identity half of a pengguna form — username, nama lengkap, email — shared
 * by `baru.tsx` and `ubah.tsx` the same way `PemasokFields` is: both routes send
 * the same keys, `POST /user` and `PATCH /user/{id}` alike.
 *
 * Password is deliberately **not** in here. `baru.tsx` needs one (the contract
 * requires it on create) and `ubah.tsx` never does — resetting somebody else's
 * password is its own action with its own sheet (issue #42 §0.7), not a field
 * that sits quietly in an edit form waiting to be left blank or overwritten by
 * accident. `PenggunaPasswordField` below is `baru.tsx`'s own field; the reset
 * sheet on the detail screen draws its two fields by hand since they need a
 * "cocokkan" pair a single `RamahField` does not model.
 */
import { StyleSheet, View } from 'react-native';

import { RamahField } from '@/components/shell/ramah';
import { RamahLayout as L } from '@/constants/theme-ramah';
import { ApiError } from '@/services/api';

export interface PenggunaIdentityValues {
  username: string;
  namaLengkap: string;
  email: string;
}

export const EMPTY_PENGGUNA_IDENTITY: PenggunaIdentityValues = {
  username: '',
  namaLengkap: '',
  email: '',
};

export function penggunaIdentityBody(v: PenggunaIdentityValues) {
  return {
    username: v.username.trim(),
    nama_lengkap: v.namaLengkap.trim() || null,
    email: v.email.trim() || null,
  };
}

/** Only `username` is required — `POST /user` and `PATCH /user/{id}` agree on that. */
export function penggunaIdentityError(v: PenggunaIdentityValues): string {
  if (v.username.trim() === '') return 'Username wajib diisi.';
  return '';
}

/** The client checks only the floor. The byte-vs-rune ceiling at 72 is the server's own rule (§0.6) and is never re-derived here — its message is shown exactly as the server writes it. */
export function penggunaPasswordError(password: string): string {
  if (password.length < 8) return 'Password minimal 8 karakter.';
  return '';
}

export interface PenggunaFieldErrors {
  username?: string;
  email?: string;
  password?: string;
}

/**
 * Splits a thrown save error by which field it is actually about (§0.5).
 *
 * A 400 from `validation_errors` is matched by key — the contract's own map,
 * keyed by the Go struct field name. A 409 on a duplicate username or email
 * carries **no structured field at all**: `components/responses/Error` is a
 * bare string, so the only way to know which field a collision names is to
 * read the sentence the server wrote. That is a real limit of the contract,
 * not a shortcut taken here — an unrecognised 409 falls through to `general`
 * rather than being guessed at.
 */
export function penggunaFieldErrors(e: unknown): PenggunaFieldErrors & { general?: string } {
  if (!(e instanceof ApiError)) return { general: undefined };
  const out: PenggunaFieldErrors & { general?: string } = {};
  for (const [key, msg] of Object.entries(e.validationErrors ?? {})) {
    const k = key.toLowerCase();
    if (k.includes('username')) out.username = msg;
    else if (k.includes('email')) out.email = msg;
    else if (k.includes('password')) out.password = msg;
  }
  if (e.status === 409 && !out.username && !out.email) {
    const lower = e.message.toLowerCase();
    if (lower.includes('username')) out.username = e.message;
    else if (lower.includes('email')) out.email = e.message;
  }
  if (!out.username && !out.email && !out.password) out.general = e.message;
  return out;
}

export function PenggunaIdentityFields({
  values,
  onChange,
  errors,
  autoFocus = false,
}: {
  values: PenggunaIdentityValues;
  onChange: (patch: Partial<PenggunaIdentityValues>) => void;
  errors?: PenggunaFieldErrors;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fields}>
      <RamahField
        label="Username"
        required
        value={values.username}
        onChangeText={(username) => onChange({ username })}
        placeholder="kasir_pagi"
        autoCapitalize="none"
        autoFocus={autoFocus}
        maxLength={255}
        error={errors?.username}
      />
      <RamahField
        label="Nama lengkap"
        value={values.namaLengkap}
        onChangeText={(namaLengkap) => onChange({ namaLengkap })}
        placeholder="Opsional"
        autoCapitalize="words"
        maxLength={255}
      />
      <RamahField
        label="Email"
        value={values.email}
        onChangeText={(email) => onChange({ email })}
        placeholder="Opsional"
        autoCapitalize="none"
        maxLength={255}
        error={errors?.email}
      />
    </View>
  );
}

/** `baru.tsx`'s own field — never rendered on `ubah.tsx`. See the file header. */
export function PenggunaPasswordField({
  value,
  onChangeText,
  error,
  confirmValue,
  onChangeConfirm,
  confirmError,
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  confirmValue: string;
  onChangeConfirm: (v: string) => void;
  confirmError?: string;
}) {
  return (
    <View style={styles.fields}>
      <RamahField
        label="Password"
        required
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        helper={error ? undefined : 'Minimal 8 karakter.'}
        error={error}
      />
      <RamahField
        label="Ulangi password"
        required
        value={confirmValue}
        onChangeText={onChangeConfirm}
        secureTextEntry
        autoCapitalize="none"
        error={confirmError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: L.space5 },
});
