/**
 * The shared building blocks every back-office screen is assembled from.
 *
 * Built on gluestack-ui primitives (`Button`, `Input`, `Modal`, `Checkbox`) for
 * the pieces where behaviour matters — focus, pressed and disabled states,
 * overlay and backdrop handling — and styled with NativeWind classes drawn from
 * the palette in `tailwind.config.js`, which mirrors `constants/theme-erp.ts`.
 * The look is the ported design's, not gluestack's defaults.
 *
 * Where a colour is genuinely chosen at runtime (a status badge whose tint comes
 * from data), it stays a `className` string picked by the caller rather than a
 * hex value: NativeWind resolves classes at build time, so a computed hex would
 * have to fall back to inline styles and drift away from the palette.
 */
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge as GBadge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import {
  Checkbox as GCheckbox,
  CheckboxIndicator,
  CheckboxLabel,
} from '@/components/ui/checkbox';
import { Input, InputField } from '@/components/ui/input';
import {
  Modal as GModal,
  ModalBackdrop,
  ModalContent,
} from '@/components/ui/modal';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';

/** Tailwind classes for a badge tint, so callers pass a palette entry, not a hex. */
export interface BadgeTone {
  /** e.g. `'bg-green-bg border-green-line'` */
  box: string;
  /** e.g. `'text-green'` */
  text: string;
}

export const TONES = {
  neutral: { box: 'bg-muted border-line-card', text: 'text-muted-foreground' },
  primary: { box: 'bg-primary-tint border-primary-tintline', text: 'text-primary-dark' },
  green: { box: 'bg-green-bg border-green-line', text: 'text-green' },
  amber: { box: 'bg-amber-bg border-amber-line', text: 'text-amber' },
  red: { box: 'bg-danger-bg border-danger-line', text: 'text-danger' },
} as const satisfies Record<string, BadgeTone>;

export type ToneName = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  sub,
  valueClass = 'text-foreground',
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <Box className="grow shrink-0 basis-[190px] min-w-[180px] gap-1 rounded-xl border border-line-card bg-card p-3.5">
      <Text className="text-[12.5px] text-faint-2">{label}</Text>
      <Text className={`text-[22px] font-bold tracking-tight ${valueClass}`}>{value}</Text>
      <Text className="text-[12.5px] text-faint">{sub}</Text>
    </Box>
  );
}

export function Badge({
  label,
  tone = 'neutral',
  small,
}: {
  label: string;
  tone?: ToneName;
  small?: boolean;
}) {
  const t = TONES[tone];
  return (
    <GBadge
      className={`items-center justify-center self-start rounded-full border ${t.box} ${
        small ? 'h-5 px-2' : 'h-6 px-2.5'
      }`}>
      <BadgeText
        className={`font-semibold normal-case ${t.text} ${small ? 'text-[12.5px]' : 'text-[13px]'}`}>
        {label}
      </BadgeText>
    </GBadge>
  );
}

export function NeutralBadge({ label = 'Nonaktif' }: { label?: string }) {
  return <Badge label={label} tone="neutral" small />;
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
    <Input
      className="h-9 flex-1 rounded-lg border border-border bg-card px-0 data-[focus=true]:border-primary"
      style={{ maxWidth }}>
      <InputField
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        className="px-3 text-[14.5px] text-foreground placeholder:text-faint"
      />
    </Input>
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
    <Box className="flex-row flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            className={`h-8 items-center justify-center rounded-[7px] border px-3 ${
              on ? 'border-primary-tintline bg-primary-tint' : 'border-border bg-card'
            }`}>
            <Text
              className={`text-[13px] font-semibold ${on ? 'text-primary-dark' : 'text-dark2'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
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
    <Box className="flex-row gap-1 self-start rounded-[10px] border border-line-card bg-muted p-1">
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            className={`h-8 items-center justify-center rounded-[7px] px-3.5 ${
              on ? 'bg-primary' : 'bg-transparent'
            }`}>
            <Text className={`text-[13.5px] font-semibold ${on ? 'text-white' : 'text-dark2'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
  );
}

export function PagingBar({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <Box className="h-12 flex-row items-center justify-between border-t border-line-light bg-thead px-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Box className="flex-row gap-1.5">
        <PageButton label="Sebelumnya" onPress={onPrev} />
        <PageButton label="Berikutnya" onPress={onNext} />
      </Box>
    </Box>
  );
}

function PageButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      onPress={onPress}
      className="h-[30px] rounded-[7px] border border-border bg-card px-3 data-[active=true]:bg-line-lighter">
      <ButtonText className="text-[13px] font-semibold text-dark2">{label}</ButtonText>
    </Button>
  );
}

export function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <Box className="items-center gap-1.5 px-5 py-10">
      <Text className="text-[15px] font-semibold text-dark2">{title}</Text>
      <Text className="text-center text-[13.5px] text-faint-2">{sub}</Text>
    </Box>
  );
}

export function PrimaryButton({
  label,
  onPress,
  flex,
}: {
  label: string;
  onPress: () => void;
  flex?: number;
}) {
  return (
    <Button
      onPress={onPress}
      style={flex ? { flex } : undefined}
      className="h-9 rounded-lg bg-primary px-3.5 data-[active=true]:bg-primary-dark">
      <ButtonText className="text-[13.5px] font-semibold text-white">{label}</ButtonText>
    </Button>
  );
}

export function SecondaryButton({
  label,
  onPress,
  tone = 'text-primary',
  flex,
}: {
  label: string;
  onPress: () => void;
  /** A text-colour class, e.g. `'text-danger'` for a destructive action. */
  tone?: string;
  flex?: number;
}) {
  return (
    <Button
      onPress={onPress}
      style={flex ? { flex } : undefined}
      className="h-9 rounded-lg border border-border bg-card px-3.5 data-[active=true]:bg-line-lighter">
      <ButtonText className={`text-[13.5px] font-semibold ${tone}`}>{label}</ButtonText>
    </Button>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      onPress={onPress}
      className="h-[30px] rounded-[7px] border border-border bg-card px-2.5 data-[active=true]:bg-line-lighter">
      <ButtonText className="text-[12.5px] font-semibold text-dark2">{label}</ButtonText>
    </Button>
  );
}

export function TinyButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      className={`h-7 rounded-md border bg-card px-2 data-[active=true]:bg-line-lighter ${
        danger ? 'border-danger-line2' : 'border-border'
      }`}>
      <ButtonText className={`text-xs font-semibold ${danger ? 'text-danger' : 'text-dark2'}`}>
        {label}
      </ButtonText>
    </Button>
  );
}

export function BackButton({
  label = '← Daftar',
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={onPress}
      className="h-8 rounded-lg border border-border bg-card px-2.5 data-[active=true]:bg-line-lighter">
      <ButtonText className="text-[13px] font-semibold text-dark2">{label}</ButtonText>
    </Button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Box className={`overflow-hidden rounded-xl border border-line-card bg-card ${className ?? ''}`}>
      {children}
    </Box>
  );
}

export function CardHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <Box className="h-[52px] flex-row items-center justify-between border-b border-line-light px-4">
      <Text className="text-[15px] font-bold text-foreground">{title}</Text>
      {right}
    </Box>
  );
}

export function StatTile({
  label,
  value,
  sub,
  valueClass = 'text-foreground',
  subClass = 'text-faint',
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <Box className="grow shrink-0 basis-[190px] min-w-[170px] gap-1 rounded-xl border border-line-card bg-card p-3.5">
      <Text className="text-[12.5px] text-faint-2">{label}</Text>
      <Text className={`text-[19px] font-bold tracking-tight ${valueClass}`}>{value}</Text>
      {sub ? <Text className={`text-[12.5px] ${subClass}`}>{sub}</Text> : null}
    </Box>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Box
      pointerEvents="none"
      className="absolute bottom-5 left-5 right-5 self-center rounded-[10px] bg-toast px-4 py-3">
      <Text className="text-[13.5px] font-medium text-white">{message}</Text>
    </Box>
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
    <GModal isOpen={visible} onClose={onRequestClose} size="lg">
      <ModalBackdrop />
      <ModalContent
        className="w-full overflow-hidden rounded-2xl border border-line-card bg-card p-0"
        style={{ maxWidth: width }}>
        {children}
      </ModalContent>
    </GModal>
  );
}

export function ModalHead({ title, sub }: { title: string; sub: string }) {
  return (
    <Box className="gap-1 border-b border-line-light px-5 pb-4 pt-5">
      <Text className="text-[17px] font-bold text-foreground">{title}</Text>
      <Text className="text-[13.5px] text-muted-foreground">{sub}</Text>
    </Box>
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
    <Box className="flex-row justify-end gap-2.5 border-t border-line-light bg-thead px-5 py-4">
      <SecondaryButton label="Batal" onPress={onCancel} tone="text-dark2" />
      <PrimaryButton label={saveLabel} onPress={onSave} />
    </Box>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Box className="rounded-[10px] border border-danger-line bg-danger-bg px-3.5 py-3">
      <Text className="text-[13.5px] font-medium text-danger">{message}</Text>
    </Box>
  );
}

export function CheckBox({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <GCheckbox
      value={label}
      isChecked={checked}
      onChange={onPress}
      className="flex-row items-center gap-2.5">
      <CheckboxIndicator
        className={`h-[19px] w-[19px] items-center justify-center rounded-[5px] border ${
          checked ? 'border-primary bg-primary' : 'border-border bg-card'
        }`}>
        {checked ? <Text className="text-xs font-bold leading-none text-white">✓</Text> : null}
      </CheckboxIndicator>
      <CheckboxLabel className="text-[13.5px] text-dark2">{label}</CheckboxLabel>
    </GCheckbox>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <Box className="gap-1.5">
      <Text className="text-[13px] font-semibold text-dark2">{label}</Text>
      {children}
      {hint ? <Text className="text-xs text-faint-2">{hint}</Text> : null}
    </Box>
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
    <Input
      isDisabled={!editable}
      className={`rounded-lg border border-border px-0 data-[focus=true]:border-primary ${
        editable ? 'bg-card' : 'bg-line-lighter'
      } ${multiline ? 'h-auto min-h-[64px] items-start' : 'h-10'}`}>
      <InputField
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        className={`px-3 text-[14.5px] text-foreground placeholder:text-faint ${
          mono ? 'font-mono' : ''
        } ${multiline ? 'pt-2.5 align-top' : ''}`}
      />
    </Input>
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
    <Box className="flex-row flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={`h-9 items-center justify-center rounded-lg border px-3 ${
              active ? 'border-primary-tintline bg-primary-tint' : 'border-border bg-card'
            }`}>
            <Text
              numberOfLines={1}
              className={`text-[13.5px] font-medium ${
                active ? 'text-primary-dark' : 'text-dark2'
              }`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
  );
}

/**
 * A table that can be scrolled in both directions, and says so.
 *
 * The columns are fixed-width by design, so on a narrow window their total
 * outgrows the viewport and the right-hand ones simply disappear off the edge.
 * Two things fix that: the body scrolls horizontally down to `minWidth`, and the
 * edges fade wherever there is more content past them.
 *
 * The fades are the affordance that matters. Platform scroll bars only appear
 * *while* a scroll is happening, which is no use to someone who does not know
 * there is anything to scroll to; a fade is visible standing still.
 */
export function DataTable({
  minWidth,
  head,
  footer,
  children,
}: {
  /** Width below which the body scrolls horizontally instead of squeezing. */
  minWidth: number;
  /** Column header row — stays put while the body scrolls vertically. */
  head: ReactNode;
  /** Usually a `PagingBar`; kept outside both scroll axes. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Viewport and content are tracked separately per axis: neither onScroll nor
  // onContentSizeChange knows both, and the fades need the difference.
  const [box, setBox] = useState({
    hView: 0,
    hContent: 0,
    hOffset: 0,
    vView: 0,
    vContent: 0,
    vOffset: 0,
  });
  const patch = (p: Partial<typeof box>) => setBox((b) => ({ ...b, ...p }));

  const moreRight = box.hContent - (box.hOffset + box.hView) > 1;
  const moreDown = box.vContent - (box.vOffset + box.vView) > 1;
  const atStart = box.hOffset <= 1;

  return (
    <Box className="flex-1 overflow-hidden rounded-[14px] border border-line-card bg-card">
      <Box className="flex-1">
        <ScrollView
          horizontal
          persistentScrollbar
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEventThrottle={16}
          onLayout={(e) => patch({ hView: e.nativeEvent.layout.width })}
          onContentSizeChange={(w) => patch({ hContent: w })}
          onScroll={(e) => patch({ hOffset: e.nativeEvent.contentOffset.x })}>
          <View style={{ minWidth, flex: 1 }}>
            {head}
            <ScrollView
              style={{ flex: 1 }}
              persistentScrollbar
              scrollEventThrottle={16}
              onLayout={(e) => patch({ vView: e.nativeEvent.layout.height })}
              onContentSizeChange={(_w, h) => patch({ vContent: h })}
              onScroll={(e) => patch({ vOffset: e.nativeEvent.contentOffset.y })}>
              {children}
            </ScrollView>
          </View>
        </ScrollView>

        {moreDown && <EdgeFade side="bottom" />}
        {moreRight && <EdgeFade side="right" />}
        {moreRight && atStart && (
          <Box
            pointerEvents="none"
            className="absolute bottom-2.5 left-4 rounded-full bg-toast/70 px-2.5 py-1">
            <Text className="text-[11.5px] font-bold tracking-wide text-white">
              geser untuk kolom lain →
            </Text>
          </Box>
        )}
      </Box>
      {footer}
    </Box>
  );
}

/** A stepped fade — no gradient library, and none needed at this size. */
function EdgeFade({ side }: { side: 'right' | 'bottom' }) {
  const steps = [0.015, 0.03, 0.05, 0.08, 0.12];
  const horizontal = side === 'right';
  return (
    <Box
      pointerEvents="none"
      className={
        horizontal
          ? 'absolute bottom-0 right-0 top-0 w-3.5 flex-row'
          : 'absolute bottom-0 left-0 right-0 h-3.5 flex-col'
      }>
      {steps.map((opacity, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(14,36,51,${opacity})` }} />
      ))}
    </Box>
  );
}

/**
 * The chrome every back-office screen repeats: page padding, the toolbar above
 * a table, the table's header row and its cells, a data row, the detail header.
 *
 * These were nine near-identical StyleSheet entries copied into each of the nine
 * screens, drifting a pixel here and a colour there. As class strings they are
 * written once and read at the point of use, which is the whole reason to be on
 * NativeWind rather than StyleSheet.
 */
export const cx = {
  /** Page body: fills the shell below the header. */
  screen: 'flex-1 gap-3 p-[18px]',
  /** Search + filters + primary action, above a table. */
  toolbar: 'flex-row items-center gap-3',
  /** "N produk" beside the toolbar. */
  countLabel: 'text-sm text-muted-foreground',
  /**
   * A table's column header. Rows carry more padding on the right than the left
   * so the last column clears `DataTable`'s fade instead of sitting under it.
   */
  tableHead:
    'h-12 flex-row items-center gap-3 border-b border-line-light bg-thead pl-[18px] pr-[34px]',
  /** A column heading inside `tableHead`. */
  th: 'text-[11.5px] font-bold tracking-wider text-faint',
  /** One data row. */
  row: 'flex-row items-center border-b border-line-lighter pl-[18px] pr-[34px]',
  /** The pressable part of a row, left of its action buttons. */
  rowMain: 'flex-1 flex-row items-center gap-3 py-3',
  /** A row's primary label. */
  nameText: 'text-[15.5px] font-semibold',
  /** The second line under it. */
  metaText: 'text-[13px] text-faint-2',
  /** Back button + title + actions, at the top of a detail view. */
  detailHead: 'flex-row items-center gap-3.5',
  detailTitle: 'text-[22px] font-bold tracking-tight text-foreground',
  /** A centred block for a spinner, an error, or an empty message. */
  centerBox: 'items-center gap-3 p-10',
} as const;
