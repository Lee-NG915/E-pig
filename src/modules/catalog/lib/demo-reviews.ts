import type { ProductDemoReview } from "@/core/contracts/commerce/catalog";
export type DemoReviewSort = "newest" | "highest" | "lowest";
export function selectDemoReviews(reviews: ProductDemoReview[], rating: number, sort: DemoReviewSort) {
  return reviews.filter(review => review.kind === "demo" && (!rating || review.rating === rating)).sort((a, b) => {
    const score = sort === "highest" ? b.rating - a.rating : sort === "lowest" ? a.rating - b.rating : 0;
    return score || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);
  });
}
