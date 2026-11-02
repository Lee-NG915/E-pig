// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient } from "@/modules/cart/lib/cart-store";
import {
  cartFixture,
  marketFixture,
} from "@/modules/cart/components/cart-panel/cart-panel.mock";
import { CheckoutForm } from "./checkout-form";
beforeEach(() => getStorefrontQueryClient().clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
