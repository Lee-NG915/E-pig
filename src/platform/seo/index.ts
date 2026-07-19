export {
  defaultDescription,
  siteName,
  titleMaxLength,
  descriptionMaxLength,
  truncateMeta,
} from "./config";
export { buildPageMetadata, type PageMetadataInput } from "./metadata";
export {
  buildProductJsonLd,
  jsonLdScriptProps,
  serializeForInlineScript,
  type ProductJsonLdInput,
} from "./json-ld";
export {
  buildCanonicalUrl,
  buildHreflangAlternates,
  type HreflangAlternate,
} from "./hreflang";
