import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { cn } from './cn';
import { AppText } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-vault-600 border border-vault-600',
  secondary: 'bg-white border border-line',
  ghost: 'bg-transparent border border-transparent',
  danger: 'bg-danger-600 border border-danger-600',
  brass: 'bg-brass-500 border border-brass-500',
  dark: 'bg-ink border border-ink',
};

const TEXT_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  ghost: 'text-vault-700',
  danger: 'text-white',
  brass: 'text-white',
  dark: 'text-white',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 rounded-xl min-h-[36px]',
  md: 'px-5 py-3 rounded-2xl min-h-[46px]',
  lg: 'px-6 py-3.5 rounded-2xl min-h-[54px]',
};

const TEXT_SIZES: Record<ButtonSize, string> = {
  sm: 'text-[13px]',
  md: 'text-[14px]',
  lg: 'text-[15px]',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center gap-2 active:opacity-80',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' || variant === 'brass' || variant === 'dark' ? '#FFFFFF' : '#0B1F1C'} />
      ) : (
        leftIcon
      )}
      <AppText variant="label" className={cn(TEXT_VARIANTS[variant], TEXT_SIZES[size])}>
        {label}
      </AppText>
      {!loading ? rightIcon : null}
    </Pressable>
  );
}
