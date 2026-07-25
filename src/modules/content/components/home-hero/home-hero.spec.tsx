// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeHero } from "./home-hero";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Hero image"} />,
}));

afterEach(cleanup);

describe("HomeHero", () => {
  it("渲染主标题与指向市场前缀 PLP 的 CTA", () => {
    render(<HomeHero marketId="au" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Furniture for slower days." }),
    ).toBeTruthy();

    expect(screen.getByRole("link", { name: /Shop sofas/i }).getAttribute("href")).toBe(
      "/au/collections/sofas",
    );
    expect(screen.getByRole("link", { name: /Explore living/i }).getAttribute("href")).toBe(
      "/au/collections/living-room",
    );
  });
});
