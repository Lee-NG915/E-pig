import { expect, it } from "vitest";
import type { ProductDemoReview } from "@/core/contracts/commerce/catalog";
import { selectDemoReviews } from "./demo-reviews";
const reviews: ProductDemoReview[] = [
  { id: "a", kind: "demo", authorLabel: "Example A", rating: 3, title: "A", body: "Sample", publishedAt: "2026-10-24" },
  { id: "b", kind: "demo", authorLabel: "Example B", rating: 5, title: "B", body: "Sample", publishedAt: "2026-10-20" },
];
it("filters and sorts sample reviews without changing source ordering", () => {
  expect(selectDemoReviews(reviews, 5, "newest").map(item => item.id)).toEqual(["b"]);
  expect(selectDemoReviews(reviews, 0, "highest").map(item => item.id)).toEqual(["b", "a"]);
  expect(selectDemoReviews(reviews, 0, "newest").map(item => item.id)).toEqual(["a", "b"]);
  expect(selectDemoReviews(reviews, 1, "lowest")).toEqual([]);
  expect(reviews.map(item => item.id)).toEqual(["a", "b"]);
});
