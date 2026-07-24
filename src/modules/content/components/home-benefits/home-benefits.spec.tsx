// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeBenefits } from "./home-benefits";

afterEach(cleanup);

describe("HomeBenefits", () => {
  it("渲染三条服务承诺", () => {
    render(<HomeBenefits />);

    for (const title of ["Easy delivery", "120-night trial", "Considered materials"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
  });
});
