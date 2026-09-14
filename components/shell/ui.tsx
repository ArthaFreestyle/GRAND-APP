/**
 * The shared building blocks every back-office screen is assembled from.
 *
 * Built on gluestack-ui primitives (`Button`, `Input`, `Checkbox`) for the
 * pieces where behaviour matters — focus, pressed and disabled states — and
 * styled with NativeWind classes drawn from the palette in
 * `tailwind.config.js`, which mirrors `constants/theme-erp.ts`. The look is the
 * ported design's, not gluestack's defaults.
 *
 * `ModalShell` (React Native's own `Modal`, for a dialog decided about a record
 * already on screen) lived here until the pembelian section — its last
 * caller — moved to `RamahSheet`. Every dialog left in the app is now either a
 * Ramah sheet or a route; see the screen-architecture note on the two, in
 * CLAUDE.md, for why a dialog and a route are never the same component.
 *
 * Where a colour is genuinely chosen at runtime (a status badge whose tint comes
 * from data), it stays a `className` string picked by the caller rather than a
 * hex value: NativeWind resolves classes at build time, so a computed hex would
 * have to fall back to inline styles and drift away from the palette.
 *
 * Every class here has to exist in `tailwind.config.js` — including the
 * semantic ones the provider supplies values for (`bg-card`, `text-foreground`,
 * `border-border`). A class Tailwind has never heard of does not fail loudly;
 * it compiles to nothing, and the surface renders with no background at all.
 */
import Feather from '@expo/vector-icons/Feather';
import { type ComponentProps, type ReactNode } from 'react';

import { Badge as GBadge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import {
  Checkbox as GCheckbox,
  CheckboxIndicator,
  CheckboxLabel,
} from '@/components/ui/checkbox';
import { Input, InputField } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme-erp';

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

/**
 * A single action as an icon, for the header bar.
 *
 * A detail screen's actions used to be a row of bordered text buttons sitting
 * above the record. On a phone two of them already wrap, and they are the same
 * two on every record — which is what makes them chrome rather than content, and
 * chrome belongs in the bar with the title.
 *
 * Feather rather than a hand-drawn glyph: a trash can is past the point where
 * three `View`s stay honest, and `@expo/vector-icons` already ships with Expo.
 *
 * `label` is not decoration. An icon on its own is a guess, so every one of
 * these carries the words a screen reader reads out, and the destructive ones
 * are the ones that most need them.
 */
export function IconAction({
  name,
  label,
  tone = 'default',
  onPress,
  disabled,
}: {
  name: ComponentProps<typeof Feather>['name'];
  /** What the action does, in words. Read out by a screen reader. */
  label: string;
  tone?: 'default' | 'danger' | 'primary';
  onPress: () => void;
  disabled?: boolean;
}) {
  // The icon takes a colour prop, not a class - one of the few genuinely
  // runtime colours in the app, and the reason `Colors` is imported here.
  const colour =
    tone === 'danger' ? Colors.red : tone === 'primary' ? Colors.primary : Colors.dark2;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className={`h-10 w-10 items-center justify-center rounded-full data-[active=true]:bg-line-lighter ${
        disabled ? 'opacity-40' : ''
      }`}>
      <Feather name={name} size={19} color={colour} />
    </Pressable>
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
