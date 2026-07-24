// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeEditorial } from "./home-editorial";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "Editorial image"} />,
}));

afterEach(cleanup);

describe("HomeEditorial", () => {
  it("渲染设计理念标题与指向 #about 的 CTA", () => {
    render(<HomeEditorial />);

    expect(
      screen.getByRole("heading", { name: "Designed to be lived in, not looked after." }),
    ).toBeTruthy();

    const cta = screen.getByRole("link", { name: "Our design approach" });
    expect(cta.getAttribute("href")).toBe("#about");
  });
});
