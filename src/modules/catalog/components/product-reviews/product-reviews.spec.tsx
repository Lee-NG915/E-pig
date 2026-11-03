// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type { ProductDemoReview } from "@/core/contracts/commerce/catalog";
import { ProductReviews } from "./product-reviews";
const reviews: ProductDemoReview[] = [3, 4, 5, 2].map((rating, index) => ({ id: String(index), kind: "demo", authorLabel: `Example ${index}`, rating: rating as ProductDemoReview["rating"], title: `Sample title ${index}`, body: `Detail ${index}`, publishedAt: `2026-10-2${index}` }));
afterEach(cleanup);
it("marks samples, filters ratings, resets empty results and expands review details", async () => {
  render(<ProductReviews reviews={reviews} />); const user = userEvent.setup();
  expect(screen.getByText(/not customer reviews/i)).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Show all 4 demo reviews" }));
  expect(screen.getAllByRole("article")).toHaveLength(4);
  await user.selectOptions(screen.getByLabelText("Rating"), "5");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  const details = screen.getByRole("article").querySelector("details")!;
  await user.click(within(screen.getByRole("article")).getByText("Read sample review"));
  expect(details.open).toBe(true);
  expect(details.textContent).toContain("Detail 2");
  await user.selectOptions(screen.getByLabelText("Rating"), "1");
  expect(screen.queryByRole("article")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reset rating filter" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
});
it("sorts visible reviews and does not invent an average for an empty source", async () => {
  const view = render(<ProductReviews reviews={reviews} />);
  await userEvent.setup().selectOptions(screen.getByLabelText("Sort demo reviews"), "highest");
  expect(screen.getAllByRole("article")[0].textContent).toContain("Sample title 2");
  view.rerender(<ProductReviews reviews={[]} />);
  expect(screen.getByText(/No demo reviews/)).toBeTruthy();
  expect(screen.queryByText(/Sample average/)).toBeNull();
});
