// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlpBreadcrumb } from "./plp-breadcrumb";

afterEach(cleanup);

describe("PlpBreadcrumb", () => {
  it("渲染 Home 链接与当前集合标题", () => {
    render(<PlpBreadcrumb marketId="au" collectionTitle="Sofas" />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/au");
    expect(screen.getByText("Sofas").getAttribute("aria-current")).toBe("page");
  });
});
