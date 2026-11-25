import { NextResponse } from "next/server";

import { CONSUMER_SESSION_COOKIE } from "@/platform/security/consumer-session";

export async function POST() {
  const response = NextResponse.json({ signed_out: true });
  response.cookies.delete(CONSUMER_SESSION_COOKIE);
  return response;
}
