export const siteName = "E-pig";

export const defaultDescription =
  "Lightweight multi-market furniture commerce storefront.";

export const titleMaxLength = 60;
export const descriptionMaxLength = 160;

export function truncateMeta(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
