// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NavPrimaryItem } from "@/modules/content/lib/main-nav";

import { MobileNav } from "./mobile-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/sg/collections/sofas" }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function NavigationExample() {
  const [open, setOpen] = useState(false);
  const [drill, setDrill] = useState<NavPrimaryItem | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open menu</button>
      <MobileNav
        open={open}
        marketId="sg"
        drill={drill}
        onDrill={setDrill}
        onClose={() => { setOpen(false); setDrill(null); }}
      />
      <button type="button">Outside action</button>
    </>
  );
}

describe("MobileNav", () => {
  it("keeps keyboard focus inside the menu and restores its opener on Escape", async () => {
    const user = userEvent.setup();
    render(<NavigationExample />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("groups browsing and help links, keeping destinations and the active page in the current market", async () => {
    const user = userEvent.setup();
    render(<NavigationExample />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("heading", { name: "Shop furniture" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "More to explore" })).toBeTruthy();
    expect(within(dialog).getByText("Shopping in Singapore")).toBeTruthy();
    expect(within(dialog).getByText("Sandbox shopping · No real payment or delivery")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Help" }).getAttribute("href")).toBe("/sg/help/payment");
    await user.click(within(dialog).getByRole("button", { name: "Sofas" }));
    const shopAll = within(dialog).getByRole("link", { name: "Shop all Sofas" });
    expect(shopAll.getAttribute("href")).toBe("/sg/collections/sofas");
    expect(shopAll.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Sofas" }));
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Sofas" }));
  });

  it("closes after a destination is chosen and remains closed until reopened", async () => {
    const user = userEvent.setup();
    render(<NavigationExample />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    const blog = within(dialog).getByRole("link", { name: "Blog" });
    expect(blog.getAttribute("href")).toBe("/sg/blog");
    // The destination contract is asserted above; this test keeps navigation in jsdom.
    blog.addEventListener("click", (event) => event.preventDefault());
    await user.click(blog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  });

  it("closes the mobile overlay when the viewport changes to desktop navigation", async () => {
    let notifyResize: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_type: string, listener: typeof notifyResize) => { notifyResize = listener; },
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    render(<NavigationExample />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    act(() => notifyResize?.({ matches: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
