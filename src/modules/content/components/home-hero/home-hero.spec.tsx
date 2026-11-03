// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeHero } from "./home-hero";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Hero image"} />,
}));

afterEach(cleanup);

describe("HomeHero", () => {
  it.each(["au", "sg", "us"])("keeps readable hero content and both destinations in the %s market", (marketId) => {
    render(<HomeHero marketId={marketId} />);

    expect(screen.getByRole("region", { name: "Furniture for slower days." })).toBeTruthy();
    expect(screen.getByRole("img", { name: /sofa.*living room/i })).toBeTruthy();

    expect(
      screen.getByRole("heading", { level: 1, name: "Furniture for slower days." }),
    ).toBeTruthy();

    expect(screen.getByRole("link", { name: /Shop sofas/i }).getAttribute("href")).toBe(
      `/${marketId}/collections/sofas`,
    );
    expect(screen.getByRole("link", { name: /Explore living/i }).getAttribute("href")).toBe(
      `/${marketId}/collections/living-room`,
    );
  });
});
