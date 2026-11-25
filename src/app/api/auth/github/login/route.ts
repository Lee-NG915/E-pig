import { NextResponse } from "next/server";

import { env } from "@/platform/config/env";
import { issueOAuthState } from "@/platform/security/oauth-state";

function oauthConfig() {
  const clientId = env.GITHUB_CLIENT_ID;
  const redirectUrl = env.GITHUB_OAUTH_REDIRECT_URL;
  if (!clientId || !env.GITHUB_CLIENT_SECRET || !redirectUrl || !env.CONSUMER_SESSION_SECRET) {
    return null;
  }
  return { clientId, redirectUrl };
}

export async function GET() {
  const config = oauthConfig();
  if (!config) {
    return NextResponse.json({ error: "GitHub sign-in is not configured" }, { status: 503 });
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUrl,
    scope: "read:user",
    state: issueOAuthState(),
  });
  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}
