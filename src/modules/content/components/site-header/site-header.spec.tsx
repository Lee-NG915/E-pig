// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CartMarketProvider,
  type CartMarket,
} from "@/modules/cart/components/cart-market-context/cart-market-context";

import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/au/collections/sofas",
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    <span role="img" aria-label={alt || "img"} />
  ),
}));

const market: CartMarket = { id: "au", currency: "AUD" };

const cart = vi.hoisted(() => ({
  lines: [] as { quantity: number }[],
  open: false,
}));
vi.mock("@/modules/cart/lib/cart-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/cart/lib/cart-store")>()),
  useCartStore: () => cart,
  setCartOpen: vi.fn(),
}));
beforeEach(() => {
  cart.lines = [];
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
    expect(screen.getByText(/Sandbox shopping/i)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByText(/Australia/)).toBeTruthy();
    expect(screen.getByText(/AUD/)).toBeTruthy();
    for (const label of ["Living", "Bedroom", "Outdoor", "Sofas"]) {
      expect(
        screen.getByRole("link", { name: new RegExp(label) }),
      ).toBeTruthy();
    }
    const blog = screen.getByRole("link", { name: "Blog" });
    expect(blog.getAttribute("href")).toBe("/au/blog");
    expect(blog.getAttribute("aria-expanded")).toBeNull();
  });

  it("保留完整沙箱公告与帮助入口，市场身份作为独立内容", () => {
    renderHeader();
    const notice = screen.getByRole("note", {
      name: "Sandbox shopping notice",
    });
    expect(notice.textContent).toContain(
      "Sandbox shopping · No real payment or delivery",
    );
    expect(
      within(notice)
        .getByRole("link", { name: "Learn more" })
        .getAttribute("href"),
    ).toBe("/au/help/payment");
    const marketLabel = screen.getByTitle("Current shopping market");
    expect(marketLabel.textContent).toContain("Australia · AUD");
    expect(notice.contains(marketLabel)).toBe(false);
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
    expect(
      await screen.findByRole("region", { name: /Living menu/i }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Living menu/i })).toBeNull();
  });

  it("Cart badge 反映数量；工具图标有无障碍名称", async () => {
    renderHeader();
    expect(
      screen.getByRole("button", { name: "Open bag with 0 items" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Search products" })
        .getAttribute("href"),
    ).toBe("/au/search");
    expect(
      screen.getByRole("link", { name: "Orders" }).getAttribute("href"),
    ).toBe("/au/orders");
    expect(screen.queryByRole("button", { name: /coming soon/ })).toBeNull();
  });

  it("移动菜单可打开并逐级进入", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Living/i,
      }),
    );
    expect(screen.getByRole("link", { name: /Shop all Living/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Bedroom/i,
      }),
    ).toBeTruthy();
    const blog = within(screen.getByRole("dialog")).getByRole("link", {
      name: "Blog",
    });
    expect(blog.getAttribute("href")).toBe("/au/blog");
  });
});
