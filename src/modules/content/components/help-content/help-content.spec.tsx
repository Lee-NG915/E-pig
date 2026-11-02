// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelpContent, helpTopics, isHelpTopic, type HelpTopic } from "./help-content";
afterEach(cleanup);
describe("HelpContent", () => {
  it("accepts only supported policy destinations", () => { expect(isHelpTopic("privacy")).toBe(true); expect(isHelpTopic("constructor")).toBe(false); expect(isHelpTopic("missing")).toBe(false); });
  it("renders all topics with valid market links and clear test boundaries", () => { for (const topic of Object.keys(helpTopics) as HelpTopic[]) { render(<HelpContent topic={topic} marketId="us" />); expect(screen.getByRole("heading", { name: helpTopics[topic].title })).toBeTruthy(); expect(screen.getByRole("link", { name: "Your orders" }).getAttribute("href")).toBe("/us/orders"); cleanup(); } });
});
