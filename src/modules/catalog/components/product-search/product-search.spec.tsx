// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductSearch } from "./product-search";
vi.mock("../product-card/product-card", () => ({ ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article> }));
afterEach(cleanup);
describe("ProductSearch", () => {
  it("offers a refreshable GET form and friendly blank state", () => { render(<ProductSearch marketId="sg" query="" products={[]} />); expect(screen.getByRole("search").getAttribute("action")).toBe("/sg/search"); expect(screen.getByRole("search").getAttribute("method")).toBe("get"); expect(screen.getByLabelText("Product name or category")).toBeTruthy(); expect(screen.getByText(/Enter a product name/)).toBeTruthy(); });
  it("retains the query and explains no results", () => { render(<ProductSearch marketId="au" query="unknown" products={[]} />); expect(screen.getByRole("status").textContent).toContain("No products found"); expect(screen.getByRole("searchbox").getAttribute("value")).toBe("unknown"); });
  it("reports search failures accessibly", () => { render(<ProductSearch marketId="au" query="chair" products={[]} failed />); expect(screen.getByRole("alert").textContent).toContain("Please try again"); });
});
