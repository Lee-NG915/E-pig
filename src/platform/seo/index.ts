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
  buildCollectionJsonLd,
  buildWebSiteJsonLd,
  jsonLdScriptProps,
  serializeForInlineScript,
  type ProductJsonLdInput,
  type CollectionJsonLdInput,
  type WebSiteJsonLdInput,
} from "./json-ld";
export {
  buildCanonicalUrl,
  buildHreflangAlternates,
  type HreflangAlternate,
} from "./hreflang";
