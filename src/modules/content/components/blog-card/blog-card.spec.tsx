// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { blogPosts } from "@/modules/content/lib/blog-posts";

import { BlogCard } from "./blog-card";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- next/image is mocked in this unit test
    <img src={src} alt={alt} />
  ),
}));
afterEach(cleanup);

describe("BlogCard", () => {
  it("renders the design content and accessible media metadata", () => {
    render(<BlogCard post={blogPosts[0]} />);
    expect(screen.getByRole("heading", { name: blogPosts[0].title })).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("Trending")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("22 April 2021")).toBeTruthy();
    expect(screen.getByText("10 comments")).toBeTruthy();
    expect(screen.getByRole("img", { name: blogPosts[0].imageAlt })).toBeTruthy();
    expect(screen.getByLabelText(`${blogPosts[0].title} details coming soon`).getAttribute("aria-disabled")).toBe("true");
  });

  it("can render a card without a NEW badge", () => {
    render(<BlogCard post={{ ...blogPosts[0], isNew: false }} />);
    expect(screen.queryByText("NEW")).toBeNull();
    expect(screen.getByText("Learn More")).toBeTruthy();
  });
});
