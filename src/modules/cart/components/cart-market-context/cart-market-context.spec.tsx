// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CartMarketProvider, useCartMarket, type CartMarket } from "./cart-market-context";

const market: CartMarket = { id: "au", currency: "AUD" };

function MarketProbe() {
  const current = useCartMarket();
  return (
    <p data-testid="market-probe">
      {current.id}:{current.currency}
    </p>
  );
}

afterEach(cleanup);

describe("CartMarketContext", () => {
  it("provider 内向子树提供完整 market 身份", () => {
    render(
      <CartMarketProvider market={market}>
        <MarketProbe />
      </CartMarketProvider>,
    );

    expect(screen.getByTestId("market-probe").textContent).toBe("au:AUD");
  });

  it("provider 外使用 useCartMarket 会抛出明确错误", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<MarketProbe />)).toThrow(
      "useCartMarket must be used inside CartMarketProvider",
    );

    consoleError.mockRestore();
  });

  it("并存 provider 的子树各自读到自己的 market", () => {
    const sg: CartMarket = { id: "sg", currency: "SGD" };
    render(
      <>
        <section aria-label="AU subtree">
          <CartMarketProvider market={market}>
            <MarketProbe />
          </CartMarketProvider>
        </section>
        <section aria-label="SG subtree">
          <CartMarketProvider market={sg}>
            <MarketProbe />
          </CartMarketProvider>
        </section>
      </>,
    );

    const auRegion = screen.getByRole("region", { name: "AU subtree" });
    const sgRegion = screen.getByRole("region", { name: "SG subtree" });
    expect(auRegion.querySelector("[data-testid='market-probe']")?.textContent).toBe(
      "au:AUD",
    );
    expect(sgRegion.querySelector("[data-testid='market-probe']")?.textContent).toBe(
      "sg:SGD",
    );
  });
});
