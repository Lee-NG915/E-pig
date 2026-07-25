// @vitest-environment jsdom

import { act } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";
import { addItem, setCartOpen, setQuantity } from "@/modules/cart/lib/cart-store";

import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/au/collections/sofas",
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "img"} />,
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const product = {
  id: "alto-modular-sofa",
  name: "Alto Modular Sofa",
  colour: "Moss weave",
  image: "https://example.com/alto.jpg",
  price: { amount: 2890, currency: "AUD" },
};

beforeEach(() => {
  window.localStorage.clear();
  setQuantity(market, product.id, 0);
  setCartOpen(market, false);
});

afterEach(cleanup);

function renderHeader() {
  return render(
    <CartMarketProvider market={market}>
      <SiteHeader />
    </CartMarketProvider>,
  );
}

describe("SiteHeader", () => {
  it("渲染双层结构：促销条、一级分类与市场指示", () => {
    renderHeader();
    expect(screen.getByText(/120 day trial/i)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByText(/Australia/)).toBeTruthy();
    expect(screen.getByText(/AUD/)).toBeTruthy();
    for (const label of ["Living", "Bedroom", "Outdoor", "Sofas"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("Sofas 一级链在当前 PLP 上为 aria-current", () => {
    renderHeader();
    const sofas = screen.getByRole("link", { name: /Sofas/i });
    expect(sofas.getAttribute("aria-current")).toBe("page");
  });

  it("hover 打开 Mega：文案 Featured、Shop all，无图片", async () => {
    const user = userEvent.setup();
    renderHeader();
    const living = screen.getByRole("link", { name: /Living/i });
    await user.hover(living);
    const mega = await screen.findByRole("region", { name: /Living menu/i });
    expect(mega).toBeTruthy();
    expect(screen.getByRole("link", { name: /Shop all Living/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Modular sofas/i })).toBeTruthy();
    expect(within(mega).queryByRole("img")).toBeNull();
  });

  it("Esc 关闭 Mega", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.hover(screen.getByRole("link", { name: /Living/i }));
    expect(await screen.findByRole("region", { name: /Living menu/i })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Living menu/i })).toBeNull();
  });

  it("Cart badge 反映数量；工具图标有无障碍名称", async () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Open bag with 0 items" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search (coming soon)" })).toBeTruthy();

    act(() => addItem(market, product));
    expect(screen.getByRole("button", { name: "Open bag with 1 items" })).toBeTruthy();
  });

  it("移动菜单可打开并逐级进入", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Living/i }));
    expect(screen.getByRole("link", { name: /Shop all Living/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Bedroom/i })).toBeTruthy();
  });
});
