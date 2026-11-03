// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeCategories } from "./home-categories";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "img"} />,
}));

afterEach(cleanup);

describe("HomeCategories", () => {
  it.each(["au", "sg", "us"])("gives each image card a readable category heading and a %s destination", (marketId) => {
    render(<HomeCategories marketId={marketId} />);
    expect(screen.getByRole("heading", { name: /Find your next piece/i })).toBeTruthy();
    for (const [label, slug] of [["Living", "living-room"], ["Bedroom", "bedroom"], ["Outdoor", "outdoor"], ["Sofas", "sofas"]]) {
      expect(screen.getByRole("heading", { name: label, level: 3 })).toBeTruthy();
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(`/${marketId}/collections/${slug}`);
    }
  });
});
