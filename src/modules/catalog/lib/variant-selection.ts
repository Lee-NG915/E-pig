import type { ProductVariant } from "@/core/contracts/commerce/catalog";

export function resolveInitialVariant(variants: ProductVariant[], query?: string | string[]) {
  const variant = query === undefined ? variants[0] : typeof query === "string" ? variants.find(item => item.id === query) : undefined;
  return { variant, invalid: query !== undefined && !variant };
}

export function getVariantOptionGroups(variants: ProductVariant[]) {
  const groups = new Map<string, Set<string>>();
  for (const variant of variants) for (const option of variant.options ?? []) {
    if (!groups.has(option.name)) groups.set(option.name, new Set());
    groups.get(option.name)!.add(option.value);
  }
  return [...groups].map(([name, values]) => ({ name, values: [...values] }));
}

/** Change one dimension only; missing combinations stay unavailable. */
export function resolveVariantOption(variants: ProductVariant[], selected: ProductVariant | undefined, name: string, value: string) {
  return variants.find(variant =>
    variant.options?.some(option => option.name === name && option.value === value) &&
    (selected?.options ?? []).every(option => option.name === name || variant.options?.some(other => other.name === option.name && other.value === option.value)),
  );
}
