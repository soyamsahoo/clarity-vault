export const colors = {
  ink: '#0B1F1C',
  inkSoft: '#42514C',
  muted: '#6B7A74',
  paper: '#F5F1E7',
  paperSoft: '#FAF7F0',
  surface: '#FFFFFF',
  line: '#E4DED0',
  vault50: '#EAFBF3',
  vault100: '#CFF7E4',
  vault200: '#A0EEC9',
  vault300: '#63DFA8',
  vault400: '#2BC98C',
  vault500: '#11AF77',
  vault600: '#0A8C5F',
  vault700: '#0A6F4E',
  vault800: '#0A5840',
  vault900: '#084836',
  brass300: '#E5BF62',
  brass400: '#D9A63B',
  brass500: '#C48724',
  brass600: '#A66A1C',
  danger300: '#FDA29B',
  danger500: '#F04438',
  danger600: '#D92D20',
  warning100: '#FEF0C7',
  warning500: '#F79009',
  warning600: '#DC6803',
  sky500: '#2E90FA',
  sky700: '#175CD3',
} as const;

export const chartPalette = [
  colors.vault600,
  colors.brass500,
  colors.sky500,
  colors.danger500,
  colors.vault300,
  colors.muted,
] as const;

export type RiskBandValue = 'RESILIENT' | 'MANAGEABLE' | 'ELEVATED' | 'CRITICAL';

export const riskBandColor: Record<RiskBandValue, string> = {
  RESILIENT: colors.vault600,
  MANAGEABLE: colors.sky500,
  ELEVATED: colors.brass500,
  CRITICAL: colors.danger500,
};
