export const semanticColorKeys = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "border", "input", "ring",
] as const;

export type SemanticColorKey = (typeof semanticColorKeys)[number];
export type SemanticColors = Record<SemanticColorKey, string>;

export const defaultColors: SemanticColors = {
  background: "oklch(0.985 0.006 83)", foreground: "oklch(0.205 0.022 66)",
  card: "oklch(1 0 0)", "card-foreground": "oklch(0.205 0.022 66)",
  popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.205 0.022 66)",
  primary: "oklch(0.27 0.033 152)", "primary-foreground": "oklch(0.985 0.006 83)",
  secondary: "oklch(0.93 0.025 82)", "secondary-foreground": "oklch(0.27 0.033 152)",
  muted: "oklch(0.952 0.012 79)", "muted-foreground": "oklch(0.49 0.02 62)",
  accent: "oklch(0.88 0.073 73)", "accent-foreground": "oklch(0.235 0.028 57)",
  border: "oklch(0.885 0.016 78)", input: "oklch(0.885 0.016 78)", ring: "oklch(0.52 0.058 151)",
};
