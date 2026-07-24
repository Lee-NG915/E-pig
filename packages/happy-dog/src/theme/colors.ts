/**
 * Primitive colour scales — hex values mirror the design contract:
 * packages/happy-dog/design-system/happy-dog.design-system.json → foundations.colours.primitives
 */
export const primitives = {
  moss: {
    50: "#F1F2EC", 100: "#E4E6D9", 200: "#C8CCB3", 300: "#ADB38D", 400: "#919967",
    500: "#707C4F", 600: "#5C6641", 700: "#495133", 800: "#353B26", 900: "#222618",
  },
  persimmon: {
    50: "#F9EEEA", 100: "#F3DDD5", 200: "#E7BBA9", 300: "#DA997F", 400: "#CE7754",
    500: "#C65530", 600: "#A24628", 700: "#7E371F", 800: "#592815", 900: "#35190D",
  },
  haze: {
    50: "#F0F3F5", 100: "#E1E6EC", 200: "#C3CDD9", 300: "#A5B4C5", 400: "#879BB2",
    500: "#6C819D", 600: "#586A81", 700: "#455465", 800: "#313D49", 900: "#1E252C",
  },
  cream: {
    50: "#FEFEFC", 100: "#FCFBF7", 200: "#FAF7EF", 300: "#F5F0E3", 400: "#EFE8D6", 500: "#E8DFC7",
  },
  mono: {
    50: "#F7F7F7", 100: "#EFEFEF", 200: "#DCDCDC", 300: "#BDBDBD", 400: "#989898",
    500: "#757575", 600: "#5C5C5C", 700: "#444444", 800: "#2E2E2E", 900: "#1F1F1F",
  },
  success: { 50: "#EDF5EF", 500: "#3F7A4E", 700: "#2B5436" },
  warning: { 50: "#FBF3E6", 500: "#C4842A", 700: "#8A5C1D" },
  danger: { 50: "#F9ECEA", 500: "#B5453A", 700: "#7E3029" },
  info: { 50: "#EEF3F7", 500: "#4F6F8F", 700: "#374E65" },
} as const;

export const semanticColorKeys = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring",
  "sale", "success", "warning", "info",
] as const;

export type SemanticColorKey = (typeof semanticColorKeys)[number];
export type SemanticColors = Record<SemanticColorKey, string>;

/**
 * Semantic colours in oklch (runtime). Each value is the oklch conversion of the
 * contract hex noted in the trailing comment (`token #hex`); keep both in sync
 * with happy-dog.design-system.json → foundations.colours.semantic.
 */
export const defaultColors: SemanticColors = {
  background: "oklch(0.976 0.011 89.7)", // cream.200 #FAF7EF
  foreground: "oklch(0.239 0 0)", // mono.900 #1F1F1F
  card: "oklch(0.996 0.003 106.4)", // cream.50 #FEFEFC
  "card-foreground": "oklch(0.239 0 0)", // mono.900 #1F1F1F
  popover: "oklch(0.996 0.003 106.4)", // cream.50 #FEFEFC
  "popover-foreground": "oklch(0.239 0 0)", // mono.900 #1F1F1F
  primary: "oklch(0.419 0.048 120.6)", // moss.700 #495133
  "primary-foreground": "oklch(0.996 0.003 106.4)", // cream.50 #FEFEFC
  secondary: "oklch(0.959 0.008 114.2)", // moss.50 #F1F2EC
  "secondary-foreground": "oklch(0.34 0.036 121.3)", // moss.800 #353B26
  muted: "oklch(0.955 0.018 89.4)", // cream.300 #F5F0E3
  "muted-foreground": "oklch(0.562 0 0)", // mono.500 #757575
  accent: "oklch(0.957 0.013 41.2)", // persimmon.50 #F9EEEA
  "accent-foreground": "oklch(0.428 0.105 38.8)", // persimmon.700 #7E371F
  destructive: "oklch(0.541 0.148 28.5)", // danger.500 #B5453A
  "destructive-foreground": "oklch(0.996 0.003 106.4)", // cream.50 #FEFEFC
  border: "oklch(0.894 0 0)", // mono.200 #DCDCDC
  input: "oklch(0.894 0 0)", // mono.200 #DCDCDC
  ring: "oklch(0.565 0.067 120.7)", // moss.500 #707C4F
  sale: "oklch(0.588 0.154 38.2)", // persimmon.500 #C65530
  success: "oklch(0.527 0.093 150.4)", // success.500 #3F7A4E
  warning: "oklch(0.664 0.128 70.6)", // warning.500 #C4842A
  info: "oklch(0.53 0.063 249.1)", // info.500 #4F6F8F
};
