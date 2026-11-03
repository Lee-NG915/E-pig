import type { ProductDemoReview } from "@/core/contracts/commerce/catalog";

/** Authored sandbox scenarios; not imported customer or vendor testimonials. */
export const tamaramaDemoReviews: ProductDemoReview[] = [
  { id: "sample-1", kind: "demo", authorLabel: "Example reviewer A", rating: 5, title: "Choosing a size", body: "Sample feedback: comparing the two sizes made the choice easier. This text exists to demonstrate a detailed review and is not evidence of a purchase or product performance.", publishedAt: "2026-10-20" },
  { id: "sample-2", kind: "demo", authorLabel: "Example reviewer B", rating: 4, title: "Considering a colour", body: "Sample feedback: room images helped with colour selection, although a physical fabric sample would still be useful. This is illustrative content, not a customer experience.", publishedAt: "2026-10-22" },
  { id: "sample-3", kind: "demo", authorLabel: "Example reviewer C", rating: 3, title: "Checking the measurements", body: "Sample feedback: I would like more detail about access through a narrow doorway. The review filter should make this sort of question easy to find. No delivery or purchase took place.", publishedAt: "2026-10-24" },
  { id: "sample-4", kind: "demo", authorLabel: "Example reviewer D", rating: 5, title: "Comparing configurations", body: "Sample feedback: seeing the selected configuration beside its dimensions was useful. This example demonstrates review sorting and expansion, and makes no verified product claim.", publishedAt: "2026-10-26" },
];
