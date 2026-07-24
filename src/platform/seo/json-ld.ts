export type ProductJsonLdInput = {
  name: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  sku?: string;
};

/** Escape for safe embedding inside <script type="application/ld+json">. */
export function serializeForInlineScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.imageUrl,
    sku: input.sku,
  };
}

export function jsonLdScriptProps(data: unknown): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: serializeForInlineScript(data) },
  };
}
