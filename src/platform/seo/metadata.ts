import type { Metadata } from "next";

import {
  defaultDescription,
  descriptionMaxLength,
  siteName,
  titleMaxLength,
  truncateMeta,
} from "./config";

export type PageMetadataInput = {
  title: string;
  description?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
};

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const title = truncateMeta(input.title, titleMaxLength);
  const description = truncateMeta(
    input.description ?? defaultDescription,
    descriptionMaxLength,
  );

  return {
    title,
    description,
    alternates: input.canonicalUrl
      ? { canonical: input.canonicalUrl }
      : undefined,
    robots: input.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      siteName,
      type: "website",
      url: input.canonicalUrl,
    },
  };
}
