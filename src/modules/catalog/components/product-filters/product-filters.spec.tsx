// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProductFilters } from "./product-filters";

afterEach(cleanup);
const base = { marketId: "sg", handle: "sofas", currency: "SGD", availableColours: ["Forest Walk", "Winter Cream"] };

describe("ProductFilters", () => {
  it("submits repeated colours, zero price and availability as GET while retaining sort", async () => {
    render(<ProductFilters {...base} sort="price-desc" />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Filter products"));
    await user.click(screen.getByRole("checkbox", { name: "Forest Walk" }));
    await user.click(screen.getByRole("checkbox", { name: "Winter Cream" }));
    await user.type(screen.getByRole("spinbutton", { name: "Minimum price (SGD)" }), "0");
    await user.type(screen.getByRole("spinbutton", { name: "Maximum price (SGD)" }), "4000");
    await user.click(screen.getByRole("checkbox", { name: "Available options only" }));
    const form = screen.getByRole("form", { name: "Product filters" }) as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/sg/collections/sofas");
    const data = new FormData(form);
    expect(data.getAll("colour")).toEqual(["Forest Walk", "Winter Cream"]);
    expect(data.get("minPrice")).toBe("0");
    expect(data.get("maxPrice")).toBe("4000");
    expect(data.get("sort")).toBe("price-desc");
    expect(data.get("inStock")).toBe("true");
    expect(screen.getByRole("button", { name: "Apply filters" }).getAttribute("type")).toBe("submit");
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/sg/collections/sofas?sort=price-desc");
  });

  it("restores URL values and exposes an invalid colour so it can be removed", async () => {
    render(<ProductFilters {...base} filters={{ colours: ["Purple"], minPrice: 3000, maxPrice: 2000 }} issues={["Minimum price must not exceed maximum price.", "Colour “Purple” is not available in this collection."]} />);
    expect(screen.getByRole("alert").textContent).toContain("Filters were not applied");
    expect(screen.getByRole("alert").textContent).toContain("Minimum price must not exceed maximum price.");
    const unknown = screen.getByRole("checkbox", { name: "Purple (unavailable)" });
    expect(unknown).toHaveProperty("checked", true);
    expect(screen.getByRole("spinbutton", { name: "Minimum price (SGD)" })).toHaveProperty("value", "3000");
    await userEvent.setup().click(unknown);
    expect(new FormData(screen.getByRole("form", { name: "Product filters" }) as HTMLFormElement).getAll("colour")).toEqual([]);
  });
});
