import type { ReactNode } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type TextInput as TextInputType,
} from 'react-native';
import { forwardRef } from 'react';
import { cn } from './cn';
import { AppText } from './text';

export interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, required, children, className }: FieldShellProps) {
  return (
    <View className={cn('gap-1.5', className)}>
      {label ? (
        <View className="flex-row items-center gap-1">
          <AppText variant="label">{label}</AppText>
          {required ? <AppText className="text-danger-500">*</AppText> : null}
        </View>
      ) : null}
      {children}
      {error ? (
        <AppText variant="caption" className="text-danger-600" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
}

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  prefix?: string;
  suffix?: string;
  containerClassName?: string;
  inputClassName?: string;
}

export const Input = forwardRef<TextInputType, InputProps>(function Input(
  {
    label,
    hint,
    error,
    required,
    prefix,
    suffix,
    containerClassName,
    inputClassName,
    editable = true,
    ...props
  },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <View
        className={cn(
          'min-h-[48px] flex-row items-center rounded-2xl border bg-white px-3.5',
          error ? 'border-danger-400' : 'border-line',
          !editable && 'bg-paper-soft opacity-70',
        )}
      >
        {prefix ? <AppText variant="bodySm" className="mr-2 text-muted">{prefix}</AppText> : null}
        <TextInput
          ref={ref}
          editable={editable}
          accessibilityLabel={label}
          placeholderTextColor="#98A2B3"
          className={cn('min-h-[46px] flex-1 py-2.5 font-sans text-[15px] text-ink outline-none', inputClassName)}
          {...props}
        />
        {suffix ? <AppText variant="bodySm" className="ml-2 text-muted">{suffix}</AppText> : null}
      </View>
    </FieldShell>
  );
});

export interface TextAreaProps extends InputProps {
  rows?: number;
}

export const TextArea = forwardRef<TextInputType, TextAreaProps>(function TextArea(
  { label, hint, error, required, containerClassName, inputClassName, ...props },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <View
        className={cn(
          'rounded-2xl border bg-white p-3.5',
          error ? 'border-danger-400' : 'border-line',
        )}
      >
        <TextInput
          ref={ref}
          multiline
          textAlignVertical="top"
          accessibilityLabel={label}
          placeholderTextColor="#98A2B3"
          className={cn('min-h-[96px] font-sans text-[15px] text-ink outline-none', inputClassName)}
          {...props}
        />
      </View>
    </FieldShell>
  );
});

export function CheckRow({
  checked,
  onToggle,
  label,
  description,
  disabled = false,
  className,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onToggle(!checked)}
      className={cn(
        'flex-row items-start gap-3 rounded-2xl border p-3.5 active:opacity-80',
        checked ? 'border-vault-300 bg-vault-50' : 'border-line bg-white',
        disabled && 'opacity-50',
        className,
      )}
    >
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center rounded-md border',
          checked ? 'border-vault-600 bg-vault-600' : 'border-line bg-white',
        )}
      >
        {checked ? <AppText className="text-[12px] font-bold text-white">✓</AppText> : null}
      </View>
      <View className="flex-1">
        <AppText variant="label">{label}</AppText>
        {description ? <AppText variant="caption" className="mt-0.5">{description}</AppText> : null}
      </View>
    </Pressable>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onToggle(!value)}
      className="flex-row items-center justify-between gap-3 py-2"
    >
      <View className="flex-1">
        <AppText variant="label">{label}</AppText>
        {description ? <AppText variant="caption" className="mt-0.5">{description}</AppText> : null}
      </View>
      <View
        className={cn(
          'h-6 w-11 justify-center rounded-pill px-0.5',
          value ? 'bg-vault-600' : 'bg-paper-deep',
        )}
      >
        <View
          className={cn(
            'h-5 w-5 rounded-full bg-white',
            value ? 'self-end' : 'self-start',
          )}
        />
      </View>
    </Pressable>
  );
}
