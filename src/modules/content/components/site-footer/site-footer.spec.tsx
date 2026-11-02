// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteFooter } from "./site-footer";

vi.mock("next/navigation", () => ({ usePathname: () => "/sg/products/chair" }));
afterEach(cleanup);

describe("SiteFooter", () => {
  it("渲染品牌、链接分组、版权信息，并承载 about 锚点", () => {
    const { container } = render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeTruthy();
    for (const title of ["Shop", "Help", "About"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText(/© 2026 E-pig/)).toBeTruthy();
    expect(container.querySelector("#about")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/sg/help/privacy");
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });
});
