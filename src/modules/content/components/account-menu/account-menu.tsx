"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, UserRound } from "lucide-react";

import { track } from "@/shared/lib/track";

type MeState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; login: string };

/**
 * 头部账号入口：挂载后请求 /api/auth/github/me，
 * 未登录给 GitHub 登录链接，已登录显示用户名与退出按钮。
 * 网络或接口异常一律降级为未登录（账号入口不阻塞浏览）。
 */
export function AccountMenu() {
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/github/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return { status: "signed-out" } as const;
        const data = (await res.json()) as { signed_in?: unknown; login?: unknown };
        if (data.signed_in === true && typeof data.login === "string") {
          return { status: "signed-in", login: data.login } as const;
        }
        return { status: "signed-out" } as const;
      })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = () => {
    track("nav_sign_out_click", {});
    void fetch("/api/auth/github/logout", { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    setState({ status: "signed-out" });
  };

  if (state.status === "loading") {
    // 占位避免头部布局抖动；读取完成前不渲染任何交互元素
    return <span className="inline-block h-10 w-20" aria-hidden="true" data-testid="account-loading" />;
  }

  if (state.status === "signed-out") {
    return (
      // eslint-disable-next-line @next/next/no-html-link-for-pages -- 目标是 API 路由（302 到 GitHub），需要完整文档跳转而非软导航
      <a
        href="/api/auth/github/login"
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => track("nav_sign_in_click", { provider: "github" })}
      >
        <LogIn className="size-4" aria-hidden="true" />
        Sign in
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 text-sm">
      <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium" data-testid="account-login">
        {state.login}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Sign out
      </button>
    </span>
  );
}
