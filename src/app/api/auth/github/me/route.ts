import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

import { env } from "@/platform/config/env";
import { CONSUMER_SESSION_COOKIE, readConsumerSession } from "@/platform/security/consumer-session";

export async function GET() {
  // 登录态属于请求时数据：禁止被构建期 prerender（曾导致构建产物冻结为
  // {"signed_in":false} 并由 Netlify Durable 缓存一年）。
  await connection();
  if (!env.CONSUMER_SESSION_SECRET) {
    return NextResponse.json({ signed_in: false });
  }
  const store = await cookies();
  const session = readConsumerSession(
    store.get(CONSUMER_SESSION_COOKIE)?.value,
    env.CONSUMER_SESSION_SECRET,
  );
  if (!session) return NextResponse.json({ signed_in: false });
  return NextResponse.json({ signed_in: true, github_id: session.githubId, login: session.login });
}
