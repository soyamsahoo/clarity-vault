import type { ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';
import { cn } from './cn';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySm'
  | 'caption'
  | 'label'
  | 'eyebrow'
  | 'mono';

const VARIANTS: Record<TextVariant, string> = {
  display: 'font-display text-[38px] leading-[44px] text-ink tracking-[-0.02em]',
  h1: 'font-display text-[30px] leading-[36px] text-ink tracking-[-0.01em]',
  h2: 'font-display text-[24px] leading-[30px] text-ink',
  h3: 'font-semibold text-[18px] leading-[26px] text-ink',
  body: 'font-sans text-[15px] leading-[24px] text-ink',
  bodySm: 'font-sans text-[13px] leading-[20px] text-inkSoft',
  caption: 'font-sans text-[11px] leading-[16px] text-muted',
  label: 'font-semibold text-[12px] leading-[18px] text-ink',
  eyebrow: 'font-semibold text-[10px] leading-[14px] uppercase tracking-eyebrow text-muted',
  mono: 'font-mono text-[12px] leading-[18px] text-ink',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  className?: string;
  children?: ReactNode;
}

export function AppText({ variant = 'body', className, children, ...props }: AppTextProps) {
  return (
    <Text className={cn(VARIANTS[variant], className)} {...props}>
      {children}
    </Text>
  );
}
