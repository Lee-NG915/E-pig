export const defaultTypography = {
  fontSans: '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif',
  fontDisplay: 'Georgia, "Times New Roman", serif',
} as const;

export type Typography = typeof defaultTypography;
