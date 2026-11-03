// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DeliveryEstimate } from "./delivery-estimate";

afterEach(cleanup);
it("checks explicit demo postcodes and replaces a previous estimate on an unknown postcode", async () => {
  render(<DeliveryEstimate marketId="au" />); const user = userEvent.setup();
  const field = screen.getByLabelText("Demo delivery postcode");
  await user.type(field, "2000"); await user.click(screen.getByRole("button", { name: "Check estimate" }));
  expect(screen.getByRole("status").textContent).toContain("2–4 business days");
  expect(screen.getByText(/not a delivery promise/i)).toBeTruthy();
  await user.clear(field); await user.type(field, "9999");
  expect(screen.queryByText(/2–4 business days/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check estimate" }));
  expect(screen.getByRole("status").textContent).toContain("No demo estimate");
});
it("uses the checkout postcode without adding a second address field", () => {
  const view = render(<DeliveryEstimate marketId="au" postalCode="3000" />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("3–5 business days");
  view.rerender(<DeliveryEstimate marketId="au" postalCode="200" />);
  expect(screen.getByRole("status").textContent).toContain("four-digit");
});
it("has no postcode control for a market without estimates", () => {
  render(<DeliveryEstimate marketId="sg" />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText(/AU only/)).toBeTruthy();
});
