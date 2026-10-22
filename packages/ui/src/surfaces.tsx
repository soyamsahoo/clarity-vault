import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from './cn';
import { AppText } from './text';

export interface CardProps extends ViewProps {
  className?: string;
  padded?: boolean;
  tone?: 'default' | 'muted' | 'dark' | 'vault' | 'brass';
}

const TONES: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'bg-white border-line',
  muted: 'bg-paper-soft border-line',
  dark: 'bg-ink border-ink',
  vault: 'bg-vault-50 border-vault-100',
  brass: 'bg-brass-50 border-brass-200',
};

export function Card({ className, padded = true, tone = 'default', ...props }: CardProps) {
  return (
    <View
      className={cn('rounded-card border', TONES[tone], padded && 'p-5', className)}
      {...props}
    />
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-end justify-between gap-3', className)}>
      <View className="flex-1">
        {eyebrow ? <AppText variant="eyebrow" className="mb-1.5">{eyebrow}</AppText> : null}
        <AppText variant="h2">{title}</AppText>
        {subtitle ? <AppText variant="bodySm" className="mt-1">{subtitle}</AppText> : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brass';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-paper-deep border-line',
  success: 'bg-vault-50 border-vault-200',
  warning: 'bg-warning-50 border-warning-200',
  danger: 'bg-danger-50 border-danger-200',
  info: 'bg-sky-50 border-sky-200',
  brass: 'bg-brass-50 border-brass-200',
};

const BADGE_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-inkSoft',
  success: 'text-vault-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  info: 'text-sky-700',
  brass: 'text-brass-700',
};

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  className,
}: {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-pill border px-2.5 py-1',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? (
        <View
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone === 'success' && 'bg-vault-500',
            tone === 'warning' && 'bg-warning-500',
            tone === 'danger' && 'bg-danger-500',
            tone === 'info' && 'bg-sky-500',
            tone === 'brass' && 'bg-brass-500',
            tone === 'neutral' && 'bg-muted',
          )}
        />
      ) : null}
      <AppText variant="label" className={cn('text-[11px]', BADGE_TEXT[tone])}>
        {label}
      </AppText>
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px w-full bg-line', className)} />;
}

export function ProgressBar({
  value,
  tone = 'vault',
  className,
  height = 'sm',
}: {
  value: number;
  tone?: 'vault' | 'brass' | 'danger' | 'sky';
  className?: string;
  height?: 'sm' | 'md';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const barTone = {
    vault: 'bg-vault-500',
    brass: 'bg-brass-500',
    danger: 'bg-danger-500',
    sky: 'bg-sky-500',
  }[tone];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      className={cn('w-full overflow-hidden rounded-pill bg-paper-deep', height === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    >
      <View className={cn('h-full rounded-pill', barTone)} style={{ width: `${clamped}%` }} />
    </View>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  className?: string;
}) {
  const valueTone = {
    default: 'text-ink',
    positive: 'text-vault-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
  }[tone];
  return (
    <View className={cn('flex-1', className)}>
      <View className="mb-1 flex-row items-center gap-1.5">
        {icon}
        <AppText variant="eyebrow">{label}</AppText>
      </View>
      <AppText variant="h2" className={valueTone}>{value}</AppText>
      {hint ? <AppText variant="caption" className="mt-1">{hint}</AppText> : null}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-start justify-between gap-4 py-2', className)}>
      <View className="flex-1">
        <AppText variant={emphasis ? 'label' : 'bodySm'} className={emphasis ? 'text-ink' : undefined}>
          {label}
        </AppText>
        {hint ? <AppText variant="caption" className="mt-0.5">{hint}</AppText> : null}
      </View>
      <AppText variant={emphasis ? 'h3' : 'label'} className={cn('text-right', emphasis ? 'text-ink' : 'text-inkSoft')}>
        {value}
      </AppText>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('items-center justify-center rounded-card border border-dashed border-line bg-paper-soft px-6 py-9', className)}>
      {icon ? <View className="mb-3">{icon}</View> : null}
      <AppText variant="h3" className="text-center">{title}</AppText>
      <AppText variant="bodySm" className="mt-1.5 max-w-[360px] text-center">{description}</AppText>
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <View className={cn('rounded-xl bg-paper-deep opacity-70', className)} />;
}
