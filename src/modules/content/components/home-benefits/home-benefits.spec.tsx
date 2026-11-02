// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeBenefits } from "./home-benefits";

afterEach(cleanup);

describe("HomeBenefits", () => {
  it("渲染三条服务承诺", () => {
    render(<HomeBenefits />);

    for (const title of ["Explore the catalog", "Test the checkout", "Find your test order"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
  });
});
