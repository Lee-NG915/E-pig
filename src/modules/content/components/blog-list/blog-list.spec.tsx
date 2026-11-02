// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { blogPosts } from "@/modules/content/lib/blog-posts";

import { BlogList } from "./blog-list";

afterEach(cleanup);

describe("BlogList", () => {
  it("renders the six supplied blog cards", () => {
    render(<BlogList posts={blogPosts} />);
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Blog" })).toBeTruthy();
  });

  it("renders an explicit empty state when there are no posts", () => {
    render(<BlogList posts={[]} />);
    expect(screen.getByText("No posts yet.")).toBeTruthy();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});
