// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./account-menu";

const meResponse = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountMenu", () => {
  it("加载完成后未登录显示 GitHub 登录入口", async () => {
    vi.mocked(fetch).mockReturnValue(meResponse({ signed_in: false }));
    render(<AccountMenu />);

    const link = await screen.findByRole("link", { name: /sign in/i });
    expect(link.getAttribute("href")).toBe("/api/auth/github/login");
  });

  it("已登录显示用户名与退出按钮", async () => {
    vi.mocked(fetch).mockReturnValue(
      meResponse({ signed_in: true, github_id: "55341019", login: "Lee-NG915" }),
    );
    render(<AccountMenu />);

    expect((await screen.findByTestId("account-login")).textContent).toBe("Lee-NG915");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
  });

  it("接口异常降级为未登录（不阻塞头部）", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    render(<AccountMenu />);

    expect(await screen.findByRole("link", { name: /sign in/i })).toBeTruthy();
  });

  it("点击退出调用登出接口并回到未登录态", async () => {
    vi.mocked(fetch)
      .mockReturnValueOnce(meResponse({ signed_in: true, login: "Lee-NG915" }))
      .mockReturnValueOnce(meResponse({ signed_out: true }));
    render(<AccountMenu />);

    await screen.findByTestId("account-login");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
    });
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/auth/github/logout");
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ method: "POST" });
  });
});
