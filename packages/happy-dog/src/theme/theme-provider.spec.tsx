// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "./theme-provider";

describe("ThemeProvider", () => {
  it("updates injected variables when the theme changes", () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>,
    );
    const defaultPrimary = container.firstElementChild?.getAttribute("style");

    rerender(
      <ThemeProvider themeId="dark">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(container.firstElementChild?.getAttribute("data-theme")).toBe("dark");
    expect(container.firstElementChild?.getAttribute("style")).not.toBe(defaultPrimary);
  });

  it("falls back to default when themeId is unknown", () => {
    const { container } = render(
      // Storybook toolbar / addon-themes may pass unexpected globals
      <ThemeProvider themeId={"unknown" as "default"}>
        <span>content</span>
      </ThemeProvider>,
    );

    expect(container.firstElementChild?.getAttribute("data-theme")).toBe("default");
    expect(container.firstElementChild?.getAttribute("style")).toContain("--background");
  });
});
