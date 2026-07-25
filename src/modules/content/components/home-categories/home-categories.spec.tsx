// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeCategories } from "./home-categories";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "img"} />,
}));

afterEach(cleanup);

describe("HomeCategories", () => {
  it("渲染四个分类链并向市场前缀 PLP", () => {
    render(<HomeCategories marketId="sg" />);
    expect(screen.getByRole("heading", { name: /Find your next piece/i })).toBeTruthy();
    for (const label of ["Living", "Bedroom", "Outdoor", "Sofas"]) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link.getAttribute("href")?.startsWith("/sg/collections/")).toBe(true);
    }
  });
});
