// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeHero } from "./home-hero";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Hero image"} />,
}));

afterEach(cleanup);

describe("HomeHero", () => {
  it("渲染主标题与两个指向 #collection 的 CTA", () => {
    render(<HomeHero />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Furniture for slower days." }),
    ).toBeTruthy();

    const cta = screen.getByRole("link", { name: "Shop the collection" });
    expect(cta.getAttribute("href")).toBe("#collection");

    const roundCta = screen.getByRole("link", { name: "View the collection" });
    expect(roundCta.getAttribute("href")).toBe("#collection");
  });
});
