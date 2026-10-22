import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from './cn';
import { AppText } from './text';

export function SimulationBanner({
  compact = false,
  message = 'Sample data and simulated integrations. Not a credit offer.',
  className,
}: {
  compact?: boolean;
  message?: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'rounded-2xl border border-brass-200 bg-brass-50',
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5',
        className,
      )}
    >
      <View className="flex-row items-center gap-2">
        <View className="h-1.5 w-1.5 rounded-full bg-brass-500" />
        <AppText variant="eyebrow" className="text-brass-700">Simulation mode</AppText>
      </View>
      <AppText variant="caption" className="mt-1 text-brass-800">
        {message}
      </AppText>
    </View>
  );
}

export type NoteTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const NOTE_TONES: Record<NoteTone, { wrap: string; title: string; dot: string }> = {
  info: { wrap: 'bg-sky-50 border-sky-200', title: 'text-sky-800', dot: 'bg-sky-500' },
  success: { wrap: 'bg-vault-50 border-vault-200', title: 'text-vault-800', dot: 'bg-vault-500' },
  warning: { wrap: 'bg-warning-50 border-warning-200', title: 'text-warning-800', dot: 'bg-warning-500' },
  danger: { wrap: 'bg-danger-50 border-danger-200', title: 'text-danger-800', dot: 'bg-danger-500' },
  neutral: { wrap: 'bg-paper-soft border-line', title: 'text-ink', dot: 'bg-muted' },
};

export function InfoNote({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: NoteTone;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const palette = NOTE_TONES[tone];
  return (
    <View className={cn('rounded-2xl border p-3.5', palette.wrap, className)}>
      <View className="flex-row items-start gap-2.5">
        {icon ?? <View className={cn('mt-1.5 h-1.5 w-1.5 rounded-full', palette.dot)} />}
        <View className="flex-1">
          {title ? (
            <AppText variant="label" className={palette.title}>{title}</AppText>
          ) : null}
          <View className={title ? 'mt-0.5' : ''}>
            {typeof children === 'string' ? (
              <AppText variant="caption" className="text-inkSoft">{children}</AppText>
            ) : (
              children
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export function InlineStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'text-ink',
    positive: 'text-vault-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
  }[tone];
  return (
    <View className="rounded-2xl border border-line bg-paper-soft px-3 py-2.5">
      <AppText variant="caption">{label}</AppText>
      <AppText variant="label" className={cn('mt-0.5 text-[14px]', toneClass)}>{value}</AppText>
    </View>
  );
}
