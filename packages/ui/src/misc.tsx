import type { ReactNode } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { cn } from './cn';
import { AppText } from './text';

export function LogoMark({
  size = 'md',
  initials = 'CV',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  initials?: string;
  className?: string;
}) {
  const dimensions = {
    sm: 'h-8 w-8 rounded-lg',
    md: 'h-10 w-10 rounded-xl',
    lg: 'h-14 w-14 rounded-2xl',
  }[size];
  const textSize = { sm: 'text-[11px]', md: 'text-[13px]', lg: 'text-[18px]' }[size];
  return (
    <View className={cn('items-center justify-center bg-ink', dimensions, className)}>
      <View className="absolute left-1.5 top-1.5 h-1 w-1 rounded-full bg-brass-400" />
      <AppText className={cn('font-display text-white', textSize)}>{initials}</AppText>
    </View>
  );
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const dimensions = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  }[size];
  return (
    <View className={cn('items-center justify-center rounded-full bg-vault-100', dimensions, className)}>
      <AppText variant="label" className="text-vault-800">{initials}</AppText>
    </View>
  );
}

export function Page({
  children,
  className,
  maxWidth = 'lg',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: 'md' | 'lg' | 'xl';
}) {
  const widthClass = { md: 'max-w-[820px]', lg: 'max-w-[1180px]', xl: 'max-w-[1320px]' }[maxWidth];
  return (
    <View className={cn('w-full self-center px-4 sm:px-6 lg:px-8', widthClass, className)}>
      {children}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-start justify-between gap-4', className)}>
      <View className="flex-1 flex-row items-start gap-3">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            className="mt-0.5 h-9 w-9 items-center justify-center rounded-full border border-line bg-white active:opacity-70"
          >
            <AppText variant="h3" className="text-[18px]">←</AppText>
          </Pressable>
        ) : null}
        <View className="flex-1">
          {eyebrow ? <AppText variant="eyebrow" className="mb-1.5">{eyebrow}</AppText> : null}
          <AppText variant="h1">{title}</AppText>
          {subtitle ? <AppText variant="bodySm" className="mt-1.5 max-w-[640px]">{subtitle}</AppText> : null}
        </View>
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
    </View>
  );
}

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 1024;
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn('gap-4', className)}>{children}</View>;
}

export function Row({
  children,
  className,
  wrap = false,
}: {
  children: ReactNode;
  className?: string;
  wrap?: boolean;
}) {
  return (
    <View className={cn('flex-row items-center gap-3', wrap && 'flex-wrap', className)}>
      {children}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row rounded-pill border border-line bg-paper-soft p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={cn(
              'flex-1 items-center justify-center rounded-pill px-3 py-2',
              active ? 'bg-white shadow-sm' : 'bg-transparent',
            )}
          >
            <AppText
              variant="label"
              className={cn('text-[12px]', active ? 'text-ink' : 'text-muted')}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
