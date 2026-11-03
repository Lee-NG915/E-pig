// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutForm } from "./checkout-form";
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement("img", { src, alt }),
}));
beforeEach(() => getStorefrontQueryClient().clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("groups contact and delivery details and keeps state before postcode", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: cartFixture, checkoutEnabled: true,
  }))));
  render(<CheckoutForm market={marketFixture} />);
  const contact = await screen.findByRole("group", { name: "Contact" });
  const delivery = screen.getByRole("group", { name: "Delivery" });
  expect(within(contact).getByLabelText("Full name")).toBeTruthy();
  expect(within(contact).getByLabelText("Email")).toBeTruthy();
  expect(within(delivery).getByLabelText("Address line 1")).toBeTruthy();
  expect(within(delivery).getByText("Country: Australia")).toBeTruthy();
  const state = within(delivery).getByLabelText("State / territory");
  const postcode = within(delivery).getByLabelText("Postcode");
  expect(state.compareDocumentPosition(postcode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("shows the selected line image, specification and authoritative totals with a bag editing link", async () => {
  const line = { ...cartFixture.lines[0], image: "https://cdn.shopify.com/selected-variant.jpg" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: { ...cartFixture, lines: [line] }, checkoutEnabled: true,
  }))));
  render(<CheckoutForm market={marketFixture} />);
  const summary = await screen.findByRole("complementary", { name: "Checkout summary" });
  expect(within(summary).getByRole("img", { name: "Alto Sofa — Compact / sandbox" }).getAttribute("src")).toBe(line.image);
  expect(within(summary).getByText("Compact / sandbox")).toBeTruthy();
  expect(within(summary).getByText("Quantity: 2")).toBeTruthy();
  expect(within(summary).getAllByText("$20")).toHaveLength(2);
  expect(within(summary).getByRole("link", { name: "Edit bag" }).getAttribute("href")).toBe("/au/cart");
  expect(within(summary).getByText("Shipping (sandbox)")).toBeTruthy();
  expect(within(summary).getByText("Tax (sandbox)")).toBeTruthy();
  expect(within(summary).getAllByText("$0")).toHaveLength(2);
});

it("retains a readable summary when a line has no image", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: cartFixture, checkoutEnabled: true,
  }))));
  render(<CheckoutForm market={marketFixture} />);
  const summary = await screen.findByRole("complementary", { name: "Checkout summary" });
  expect(within(summary).getByText("Image unavailable")).toBeTruthy();
  expect(within(summary).getByText("Alto Sofa")).toBeTruthy();
  expect(within(summary).getAllByText("$20")).toHaveLength(2);
});

it("validates AU postcode before sending checkout and keeps entered data after a failed request", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        requests.push(JSON.parse(init.body as string));
        return new Response(
          JSON.stringify({ error: { message: "Payment service unavailable" } }),
          { status: 503 },
        );
      }
      return new Response(
        JSON.stringify({ cart: cartFixture, checkoutEnabled: true }),
      );
    }),
  );
  render(<CheckoutForm market={marketFixture} />);
  const user = userEvent.setup();
  await screen.findByLabelText("Full name");
  await user.type(screen.getByLabelText("Full name"), "Test Buyer");
  await user.type(screen.getByLabelText("Email"), "buyer@example.com");
  await user.type(screen.getByLabelText("Address line 1"), "1 Test Street");
  await user.type(screen.getByLabelText("City / suburb"), "Sydney");
  await user.type(screen.getByLabelText("Postcode"), "20");
  await user.click(
    screen.getByRole("button", { name: "Continue to test card payment" }),
  );
  expect(
    await screen.findByText("Enter a four-digit Australian postcode"),
  ).toBeTruthy();
  expect(requests).toHaveLength(0);
  expect(screen.getByLabelText("Postcode")).toBe(document.activeElement);
  await user.type(screen.getByLabelText("Postcode"), "00");
  await user.click(
    screen.getByRole("button", { name: "Continue to test card payment" }),
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    revision: 2,
    expectedTotal: { amount: 20, currency: "AUD" },
    contact: { name: "Test Buyer", email: "buyer@example.com" },
    address: { country: "AU", postalCode: "2000" },
  });
  expect(await screen.findByText(/Payment service unavailable/)).toBeTruthy();
  expect(screen.getByRole("group", { name: "Contact" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("group", { name: "Delivery" })).toHaveProperty("disabled", true);
  await user.click(
    screen.getByRole("button", { name: "Continue to test card payment" }),
  );
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toEqual(requests[0]);
  expect(screen.getByLabelText("Full name")).toHaveProperty(
    "value",
    "Test Buyer",
  );
});
it("keeps a saved checkout locked instead of offering a new form", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: { ...cartFixture, lockedCheckoutId: "saved checkout/1" }, checkoutEnabled: true,
  }))));
  render(<CheckoutForm market={marketFixture} />);
  const review = await screen.findByRole("link", { name: "Review saved checkout and payment status" });
  expect(review.getAttribute("href")).toBe("/au/checkout/return?checkoutId=saved%20checkout%2F1");
  expect(screen.queryByRole("button", { name: "Continue to test card payment" })).toBeNull();
});
it("does not offer checkout in SG", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ cart: null, checkoutEnabled: false })),
      ),
  );
  render(<CheckoutForm market={{ id: "sg", currency: "SGD" }} />);
  expect(await screen.findByText(/available for AU only/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Continue to test card payment" }),
  ).toBeNull();
});
