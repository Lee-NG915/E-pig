// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { addCompareItem, resetCompareStoreForTests, useCompareSelection } from "../../lib/compare-store";
import { dismissComparisonFeedback, useComparisonFeedback } from "../comparison-dock/comparison-feedback";
import { AddToComparison } from "./add-to-comparison";

function Selection() {
  const { items } = useCompareSelection("au");
  const feedback = useComparisonFeedback("au");
  return <><output role="log" aria-label="Selected products">{items.map(item => `${item.productId}:${item.variantId}`).join(",")}</output><p role="status">{feedback?.message}</p></>;
}
beforeEach(() => { localStorage.clear(); resetCompareStoreForTests(); dismissComparisonFeedback("au"); });
afterEach(cleanup);

it("adds without navigation, keeps focus and gives distinct duplicate feedback", async () => {
  window.history.replaceState({}, "", "/au/collections/sofas?sort=price-desc");
  render(<><AddToComparison marketId="au" item={{ productId: "sofa", variantId: "green" }} productName="Green Sofa" /><Selection /></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add Green Sofa to comparison" }));
  expect(screen.getByRole("status").textContent).toContain("added to comparison");
  const selected = screen.getByRole("button", { name: "Green Sofa is in comparison" });
  expect(document.activeElement).toBe(selected);
  expect(selected.getAttribute("aria-pressed")).toBe("true");
  expect(window.location.pathname + window.location.search).toBe("/au/collections/sofas?sort=price-desc");
  await user.click(selected);
  expect(screen.getByRole("status").textContent).toContain("already in your comparison");
  expect(screen.getByLabelText("Selected products").textContent).toBe("sofa:green");
});

it("updates the same product in a full list and explains why a fourth cannot be added", async () => {
  for (const productId of ["sofa", "chair", "bed"]) addCompareItem("au", { productId, variantId: "default" });
  render(<><AddToComparison marketId="au" item={{ productId: "sofa", variantId: "green" }} productName="Sofa" /><AddToComparison marketId="au" item={{ productId: "table", variantId: "oak" }} productName="Table" /><Selection /></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Update Sofa in comparison" }));
  expect(screen.getByLabelText("Selected products").textContent).toBe("sofa:green,chair:default,bed:default");
  expect(screen.getByRole("status").textContent).toContain("option updated");
  await user.click(screen.getByRole("button", { name: "Add Table to comparison" }));
  expect(screen.getByRole("status").textContent).toContain("Remove a product from your list");
  expect(screen.getByRole("button", { name: "Add Table to comparison" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByLabelText("Selected products").textContent).toBe("sofa:green,chair:default,bed:default");
});
