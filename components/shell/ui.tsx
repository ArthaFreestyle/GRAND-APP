import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors as C } from '@/constants/theme-erp';

export function KpiCard({ label, value, sub, color = C.text }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </View>
  );
}

export function Badge({
  label,
  color,
  bg,
  border,
  small,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  small?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: border },
        small && { height: 20, paddingHorizontal: 8 },
      ]}>
      <Text style={[styles.badgeText, { color }, small && { fontSize: 12.5 }]}>{label}</Text>
    </View>
  );
}

export function NeutralBadge({ label = 'Nonaktif' }: { label?: string }) {
  return <Badge label={label} color={C.muted3} bg={C.badgeBg} border={C.borderCard} small />;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  maxWidth = 420,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  maxWidth?: number;
}) {
  return (
    <View style={[styles.searchWrap, { maxWidth }]}>
      <View style={styles.searchIcon} />
      <View style={styles.searchIconHandle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.searchInput}
      />
    </View>
  );
}

export function FilterPills<T extends string>({
  options,
  active,
  onPick,
}: {
  options: { key: T; label: string }[];
  active: T;
  onPick: (k: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            style={[
              styles.pillBtn,
              { backgroundColor: on ? C.primaryTintBg : '#fff', borderColor: on ? C.primaryTintBorder : C.border },
            ]}>
            <Text style={[styles.pillText, { color: on ? C.primaryDark : C.dark2 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TabSwitch<T extends string>({
  options,
  active,
  onPick,
}: {
  options: { key: T; label: string }[];
  active: T;
  onPick: (k: T) => void;
}) {
  return (
    <View style={styles.tabWrap}>
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            style={[styles.tabBtn, { backgroundColor: on ? C.primary : 'transparent' }]}>
            <Text style={[styles.tabText, { color: on ? '#fff' : C.dark2 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PagingBar({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.pagingBar}>
      <Text style={styles.pagingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={onPrev} style={styles.pageBtn}>
          <Text style={styles.pageBtnText}>Sebelumnya</Text>
        </Pressable>
        <Pressable onPress={onNext} style={styles.pageBtn}>
          <Text style={styles.pageBtnText}>Berikutnya</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, flex }: { label: string; onPress: () => void; flex?: number }) {
  return (
    <Pressable onPress={onPress} style={[styles.primaryBtn, flex ? { flex } : null]}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  color,
  flex,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  flex?: number;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.secondaryBtn, flex ? { flex } : null]}>
      <Text style={[styles.secondaryBtnText, color ? { color } : null]}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.ghostBtn}>
      <Text style={styles.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

export function TinyButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.tinyBtn, danger && { borderColor: C.redBorder2 }]}>
      <Text style={[styles.tinyBtnText, danger && { color: C.red }]}>{label}</Text>
    </Pressable>
  );
}

export function BackButton({ label = '← Daftar', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backBtn}>
      <Text style={styles.backBtnText}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardHeadText}>{title}</Text>
      {right}
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  color = C.text,
  subColor = C.muted,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  subColor?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub ? <Text style={[styles.kpiSub, { color: subColor }]}>{sub}</Text> : null}
    </View>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

// ---- modal building blocks ----

export function ModalShell({
  visible,
  width,
  onRequestClose,
  children,
}: {
  visible: boolean;
  width: number;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { maxWidth: width, width: '100%' }]}>{children}</View>
      </View>
    </Modal>
  );
}

export function ModalHead({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.headBlock}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{sub}</Text>
    </View>
  );
}

export function ModalFooter({
  onCancel,
  onSave,
  saveLabel,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <View style={styles.footer}>
      <Pressable onPress={onCancel} style={styles.btnSecondary}>
        <Text style={styles.btnSecondaryText}>Batal</Text>
      </Pressable>
      <Pressable onPress={onSave} style={styles.btnPrimary}>
        <Text style={styles.btnPrimaryText}>{saveLabel}</Text>
      </Pressable>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function CheckBox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.checkboxRow}>
      <View style={[styles.checkboxBox, checked && { backgroundColor: C.primary, borderColor: C.primary }]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  editable = true,
  mono,
  keyboardType,
  multiline,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  mono?: boolean;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      style={[
        styles.input,
        mono && styles.mono,
        !editable && styles.inputLocked,
        multiline && { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
      ]}
    />
  );
}

export function OptionPicker({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.pickerOption, active && styles.pickerOptionActive]}>
            <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiCard: {
    flexGrow: 1,
    flexBasis: 190,
    minWidth: 180,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
    gap: 4,
  },
  kpiLabel: { fontSize: 12.5, color: C.muted2 },
  kpiValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.2 },
  kpiSub: { fontSize: 12.5, color: C.muted },
  badge: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12.5, fontWeight: '600' },
  searchWrap: { position: 'relative', flex: 1, minWidth: 220, justifyContent: 'center' },
  searchIcon: {
    position: 'absolute',
    left: 13,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.muted,
    zIndex: 1,
  },
  searchIconHandle: {
    position: 'absolute',
    left: 24,
    top: 25,
    width: 8,
    height: 2,
    backgroundColor: C.muted,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  searchInput: {
    height: 44,
    paddingLeft: 36,
    paddingRight: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
    fontSize: 15,
    color: C.text,
  },
  pillBtn: { height: 44, paddingHorizontal: 15, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
  tabWrap: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard },
  tabBtn: { height: 38, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14.5, fontWeight: '600' },
  pagingBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.tableHeaderBg,
  },
  pagingLabel: { fontSize: 14, color: C.muted3 },
  pageBtn: { height: 30, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pageBtnText: { fontSize: 13, fontWeight: '600', color: C.dark2 },
  emptyState: { padding: 44, alignItems: 'center' },
  emptyTitle: { fontSize: 15.5, fontWeight: '500', color: C.dark2 },
  emptySub: { marginTop: 5, fontSize: 14, color: C.muted2, textAlign: 'center' },
  primaryBtn: { height: 44, paddingHorizontal: 16, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 14.5, fontWeight: '600', color: '#fff' },
  secondaryBtn: { height: 40, paddingHorizontal: 15, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  ghostBtn: { height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: C.primary },
  tinyBtn: { height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tinyBtnText: { fontSize: 13.5, fontWeight: '600', color: C.dark2 },
  backBtn: { height: 38, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, overflow: 'hidden' },
  cardHead: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  cardHeadText: { fontSize: 16.5, fontWeight: '700', color: C.text },
  statTile: {
    flexGrow: 1,
    flexBasis: 190,
    minWidth: 180,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderCard,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.2 },
  toast: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: C.toastBg,
    maxWidth: 420,
  },
  toastText: { fontSize: 14, fontWeight: '500', color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,24,28,0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 14, maxHeight: '100%', overflow: 'hidden' },
  headBlock: { paddingHorizontal: 20, paddingTop: 18 },
  title: { fontSize: 19, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  subtitle: { marginTop: 4, fontSize: 14, color: C.muted3, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.tableHeaderBg,
  },
  btnSecondary: { height: 44, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 14.5, fontWeight: '600', color: C.dark2 },
  btnPrimary: { height: 44, paddingHorizontal: 18, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontSize: 14.5, fontWeight: '600', color: '#fff' },
  errorBanner: { padding: 11, borderRadius: 9, backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder },
  errorText: { fontSize: 14, fontWeight: '500', color: C.red, lineHeight: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  checkboxBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#B9C1C6', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkboxLabel: { fontSize: 14, color: C.dark2, flex: 1, lineHeight: 19 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.dark2 },
  fieldHint: { fontSize: 13, color: C.muted, lineHeight: 18 },
  input: { height: 44, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, fontSize: 15, color: C.text },
  inputLocked: { backgroundColor: C.badgeBg, color: C.muted3 },
  mono: { fontFamily: 'monospace' },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerOption: { paddingHorizontal: 12, height: 40, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', maxWidth: 260 },
  pickerOptionActive: { backgroundColor: C.primaryTintBg, borderColor: C.primaryTintBorder },
  pickerOptionText: { fontSize: 14, color: C.dark2 },
  pickerOptionTextActive: { color: C.primaryDark, fontWeight: '600' },
});
