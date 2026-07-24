// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";

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
  });
});
