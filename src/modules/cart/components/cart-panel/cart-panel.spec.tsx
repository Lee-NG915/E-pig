// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorefrontQueryClient, recoverCart, refreshCart, setCartOpen, useCartStore } from "../../lib/cart-store";
import { CartPanel } from "./cart-panel";
import { cartFixture, marketFixture } from "./cart-panel.mock";
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
}));
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_name: string, callback: () => unknown) => callback()) } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ cart: null, checkoutEnabled: true, mutationApplied: true }))));
  await recoverCart(marketFixture); await refreshCart(marketFixture);
  getStorefrontQueryClient().clear();
});

it("keeps saved-update recovery visible through a successful GET and retries the original key", async () => {
  const key = "11111111-1111-4111-8111-111111111111";
  localStorage.setItem("e-pig:pending-cart:v1:au", JSON.stringify({ idempotencyKey: key, expectedCartId: cartFixture.id, createdAt: Date.now(), input: { action: "update", lineId: cartFixture.lines[0].id, quantity: 2 } }));
  let finishCheck!: () => void; let holdReceipt = true;
  const posts: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("mutationKey=") && holdReceipt) return new Promise<Response>((_resolve, reject) => { finishCheck = () => { holdReceipt = false; reject(new TypeError("Connection unavailable")); }; });
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ cart: cartFixture, checkoutEnabled: true, mutationApplied: false }));
  });
  vi.stubGlobal("fetch", fetcher);
  function BagOpen() { return <output aria-label="Bag open">{String(useCartStore(marketFixture).open)}</output>; }
  setCartOpen(marketFixture, true);
  render(<><CartPanel market={marketFixture} compact /><BagOpen /></>);
  expect(await screen.findByText("Checking your bag…")).toHaveProperty("role", "status");
  await screen.findByRole("link", { name: "Alto Sofa" });
  expect(screen.getByRole("button", { name: "Increase Alto Sofa quantity" })).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("Demo coupon").closest("fieldset")).toHaveProperty("disabled", true);
  expect(screen.queryByRole("link", { name: "Continue to sandbox checkout" })).toBeNull();
  expect(screen.getByRole("button", { name: "Continue to sandbox checkout" })).toHaveProperty("disabled", true);
  expect(screen.getByText("Confirm your saved bag update before continuing to checkout.")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Continue browsing" }));
  expect(screen.getByRole("status", { name: "Bag open" }).textContent).toBe("false");
  await act(async () => { finishCheck(); });
  expect(await screen.findByRole("button", { name: "Retry saved update" })).toBeTruthy();
  expect(posts).toHaveLength(0);
  await act(async () => { await refreshCart(marketFixture); });
  expect(screen.getByText("Your original update is saved. You do not need to add the items again.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use current bag" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry saved update" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Saved bag update" })).toBeNull());
  expect(posts).toEqual([{ action: "update", lineId: cartFixture.lines[0].id, quantity: 2, idempotencyKey: key, expectedCartId: cartFixture.id }]);
  expect(screen.getByRole("link", { name: "Continue to sandbox checkout" })).toBeTruthy();
});

it("offers explicit current-bag review for an unreadable saved update without re-sending it", async () => {
  localStorage.setItem("e-pig:pending-cart:v1:au", "not-json");
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ cart: cartFixture, checkoutEnabled: true })));
  vi.stubGlobal("fetch", fetcher);
  render(<CartPanel market={marketFixture} />);
  const useCurrent = await screen.findByRole("button", { name: "Use current bag" });
  expect(screen.getByRole("link", { name: "Continue browsing" }).getAttribute("href")).toBe("/au");
  expect(screen.getByText(/keeps it as shown and does not re-send/)).toBeTruthy();
  await userEvent.setup().click(useCurrent);
  await waitFor(() => expect(screen.queryByRole("region", { name: "Saved bag update" })).toBeNull());
  expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
  expect(fetcher.mock.calls.every(call => !((call as unknown[])[1] as RequestInit | undefined)?.body)).toBe(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows server line total and freezes controls during payment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cart: { ...cartFixture, lockedCheckoutId: "checkout-1" },
          checkoutEnabled: true,
        }),
      ),
    ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("link", { name: "Alto Sofa" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Increase Alto Sofa quantity" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen
      .getByRole("link", { name: "View payment status" })
      .getAttribute("href"),
  ).toBe("/au/checkout/return?checkoutId=checkout-1");
  expect(screen.getAllByText("$20")).toHaveLength(2);
  expect(screen.getByLabelText("Demo coupon").closest("fieldset")).toHaveProperty("disabled", true);
});

it("applies and removes a demo code using server totals, preserving a valid code after rejection", async () => {
  const user = userEvent.setup();
  let current = { ...cartFixture };
  const requests: { code: string; action: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); requests.push(body);
      if (body.code === "EXPIRED10") return new Response(JSON.stringify({ error: { message: "This demo coupon has expired" } }), { status: 400 });
      current = body.code ? { ...cartFixture, revision: 3, couponCode: "DEMO10", discount: { amount: 2, currency: "AUD" }, total: { amount: 18, currency: "AUD" } } as typeof current : { ...cartFixture, revision: 4 };
    }
    return new Response(JSON.stringify({ cart: current, checkoutEnabled: true }));
  }));
  render(<CartPanel market={marketFixture} />);
  const code = await screen.findByLabelText("Demo coupon");
  await user.type(code, "DEMO10");
  await user.click(screen.getByRole("button", { name: "Apply demo code" }));
  expect(await screen.findByText("$18")).toBeTruthy();
  expect(screen.getByText("−$2")).toBeTruthy();
  expect(screen.getByText("Discount (DEMO10)")).toBeTruthy();
  await user.type(code, "EXPIRED10");
  await user.click(screen.getByRole("button", { name: "Apply demo code" }));
  expect(await screen.findByText("This demo coupon has expired")).toBeTruthy();
  expect(screen.getByText("$18")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Remove demo code" }));
  await waitFor(() => expect(screen.queryByText("Discount (DEMO10)")).toBeNull());
  expect(requests.map(item => [item.action, item.code])).toEqual([["coupon", "DEMO10"], ["coupon", "EXPIRED10"], ["coupon", ""]]);
});

it("shows the server-selected image and links its exact variant back to the market PDP", async () => {
  const selectedLine = {
    ...cartFixture.lines[0],
    productId: "alto sofa",
    variantId: "moss / wide",
    image: "https://cdn.shopify.com/selected-variant.jpg",
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: { ...cartFixture, lines: [selectedLine] }, checkoutEnabled: true,
  }))));
  render(<CartPanel market={marketFixture} />);

  const productLink = await screen.findByRole("link", { name: "Alto Sofa" });
  expect(productLink.getAttribute("href")).toBe("/au/products/alto%20sofa?variant=moss%20%2F%20wide");
  expect(screen.getByRole("img", { name: "Alto Sofa — Compact / sandbox" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Alto Sofa — Compact / sandbox" }).getAttribute("src")).toBe(selectedLine.image);
  expect(screen.getByText("Compact / sandbox")).toBeTruthy();
  expect(screen.getAllByText("$20")).toHaveLength(2);
});

it("keeps a line usable when its image is absent", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: cartFixture, checkoutEnabled: true,
  }))));
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("link", { name: "Alto Sofa" })).toBeTruthy();
  expect(screen.getByText("Image unavailable")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Alto Sofa" })).toHaveProperty("disabled", false);
});

it("offers market-specific collections in the empty bag and closes the drawer when browsing", async () => {
  const market = { id: "sg", currency: "SGD" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cart: null, checkoutEnabled: false,
  }))));
  function OpenState() {
    const { open } = useCartStore(market);
    return <output aria-label="Bag open state">{String(open)}</output>;
  }
  setCartOpen(market, true);
  render(<><CartPanel market={market} /><OpenState /></>);
  const sofas = await screen.findByRole("link", { name: "Shop sofas" });
  expect(sofas.getAttribute("href")).toBe("/sg/collections/sofas");
  expect(screen.getByRole("link", { name: "Shop bedroom" }).getAttribute("href")).toBe("/sg/collections/bedroom");
  expect(screen.getByRole("status", { name: "Bag open state" })).toHaveProperty("textContent", "true");
  await userEvent.setup().click(sofas);
  expect(screen.getByRole("status", { name: "Bag open state" })).toHaveProperty("textContent", "false");
});
it("reports unavailable backend and offers retry instead of a false empty bag", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Shopping service unavailable" },
        }),
        { status: 503 },
      ),
    ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Shopping service unavailable"),
  );
  expect(screen.getByRole("button", { name: "Refresh bag" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  expect(screen.queryByText("Nothing in your bag yet")).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh bag" })).toBeTruthy();
});
it("leaves a re-add notice and preserves legacy data", async () => {
  localStorage.setItem("e-pig:demo-cart:v1:au", "old-cart");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ cart: null, checkoutEnabled: false })),
      ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByText(/previous demo bag/)).toBeTruthy();
  expect(localStorage.getItem("e-pig:demo-cart:v1:au")).toBe("old-cart");
});

it("shows unavailable option guidance while keeping remove enabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            cart: {
              ...cartFixture,
              lines: [
                {
                  ...cartFixture.lines[0],
                  problem: "This option is no longer available",
                  availability: "out-of-stock",
                },
              ],
            },
            checkoutEnabled: true,
          }),
        ),
      ),
  );
  render(<CartPanel market={marketFixture} />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("This option is no longer available"),
  );
  expect(
    screen.getByRole("button", { name: "Remove Alto Sofa" }),
  ).toHaveProperty("disabled", false);
  expect(
    screen.getByRole("button", { name: "Increase Alto Sofa quantity" }),
  ).toHaveProperty("disabled", true);
  expect(
    screen.queryByRole("link", { name: "Continue to sandbox checkout" }),
  ).toBeNull();
});
