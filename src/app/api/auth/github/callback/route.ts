import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createConsumerIdentityStore } from "@/adapters/consumer/postgres/identity";
import { env } from "@/platform/config/env";
import { consumeOAuthState } from "@/platform/security/oauth-state";
import { cartCookieName, readCartCookie } from "@/platform/security/cart-cookie";
import { CONSUMER_SESSION_COOKIE, signConsumerSession } from "@/platform/security/consumer-session";
import { getCommercePool } from "@/platform/registry";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !consumeOAuthState(state)) {
    return NextResponse.json({ error: "invalid or expired OAuth state" }, { status: 401 });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.CONSUMER_SESSION_SECRET) {
    return NextResponse.json({ error: "GitHub sign-in is not configured" }, { status: 503 });
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_OAUTH_REDIRECT_URL,
    }),
  });
  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "GitHub token exchange failed" }, { status: 502 });
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    return NextResponse.json({ error: "GitHub token exchange failed" }, { status: 502 });
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!userResponse.ok) {
    return NextResponse.json({ error: "failed to read GitHub profile" }, { status: 502 });
  }
  const profile = (await userResponse.json()) as { id?: number; login?: string };
  if (typeof profile.id !== "number" || !profile.login) {
    return NextResponse.json({ error: "failed to read GitHub profile" }, { status: 502 });
  }
  const githubId = String(profile.id);
  const login = profile.login;

  // Bind the currently presented signed cart to this GitHub subject so orders
  // placed before sign-in become visible across devices. No cart, no binding.
  if (env.DATABASE_URL && env.CART_COOKIE_SECRET) {
    const store = await cookies();
    const cartId = readCartCookie(
      store.get(cartCookieName(env.MARKET))?.value,
      env.MARKET,
      env.CART_COOKIE_SECRET,
    );
    if (cartId) {
      await createConsumerIdentityStore(getCommercePool()).bind(githubId, login, cartId);
    }
  }

  const response = NextResponse.redirect(new URL("/", request.url), 302);
  response.cookies.set(CONSUMER_SESSION_COOKIE, signConsumerSession({ githubId, login }, env.CONSUMER_SESSION_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 3600,
    path: "/",
  });
  return response;
}
