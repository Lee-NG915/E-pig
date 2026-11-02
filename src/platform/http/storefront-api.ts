import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CartPort } from "@/core/contracts/commerce/cart";
import { checkoutInputSchema, type CheckoutPort } from "@/core/contracts/commerce/checkout";
import type { OrderPort } from "@/core/contracts/commerce/order";
import { AppError, isAppError, toPublicError } from "@/core/errors/errors";
import { CART_COOKIE_MAX_AGE, cartCookieName, readCartCookie, signCartCookie } from "@/platform/security/cart-cookie";

const requestKey = z.string().uuid();
const id = z.string().min(1).max(160);
const cartInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), productId: id, variantId: id, quantity: z.number().int().min(1).max(10), idempotencyKey: requestKey }),
  z.object({ action: z.literal("update"), lineId: id, quantity: z.number().int().min(0).max(10), idempotencyKey: requestKey }),
]);
export type StorefrontApiDependencies = {
  market: string; origin: string; cookieSecret: string; secure: boolean; checkoutEnabled: boolean;
  getCommerce(): { cart: CartPort; checkout: CheckoutPort; orders: OrderPort };
};
export type StorefrontResource = "cart" | "checkout" | "orders";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const errorStatuses = { validation: 400, unauthorized: 401, not_found: 404, conflict: 409, rate_limited: 429, upstream: 503, unknown: 500 };
export function apiError(error: unknown) {
  if (error instanceof z.ZodError) return privateJson({ error: { kind: "validation", message: error.issues[0]?.message ?? "Check the information and try again." } }, 400);
  return privateJson({ error: toPublicError(error) }, isAppError(error) ? errorStatuses[error.kind] : 500);
}
async function jsonInput(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("validation", "Send a JSON request");
  if (Number(request.headers.get("content-length")) > 16_384) throw new AppError("validation", "Request is too large");
  const text = await request.text();
  if (text.length > 16_384) throw new AppError("validation", "Request is too large");
  try { return JSON.parse(text); } catch { throw new AppError("validation", "Invalid JSON request"); }
}

/** Transport boundary: identity comes exclusively from the signed cookie, never posted IDs. */
export function createStorefrontApi(deps: StorefrontApiDependencies) {
  const trustedOrigin = deps.origin ? new URL(deps.origin).origin : "";
  return async (request: Request, market: string, resource: StorefrontResource, resourceId?: string): Promise<Response> => {
    try {
      if (market !== deps.market) return privateJson({ error: { kind: "not_found", message: "This market is not served here." } }, 404);
      if (request.method !== "GET" && request.method !== "POST") return privateJson({ error: { kind: "validation", message: "Method not allowed" } }, 405);
      if (request.method === "POST" && (request.headers.get("origin") !== trustedOrigin || request.headers.get("sec-fetch-site") === "cross-site")) {
        return privateJson({ error: { kind: "unauthorized", message: "Open this store and try again." } }, 403);
      }
      const token = new NextRequest(request.url, { headers: request.headers }).cookies.get(cartCookieName(market))?.value;
      const cartId = readCartCookie(token, market, deps.cookieSecret);
      const checkoutEnabled = deps.checkoutEnabled && market === "au";
      if (resource === "cart" && request.method === "GET" && !cartId) {
        return privateJson({ cart: null, checkoutEnabled, ...(token ? { sessionExpired: true } : {}) });
      }
      if (!deps.cookieSecret || deps.cookieSecret.length < 32) throw new AppError("upstream", "Cart credentials are not configured");
      if (resource === "cart") {
        const port = deps.getCommerce().cart;
        if (request.method === "GET") return privateJson({ cart: await port.getCart(cartId!), checkoutEnabled });
        const body = cartInput.parse(await jsonInput(request));
        if (!cartId && body.action !== "add") throw new AppError("unauthorized", "Start a new bag by adding an item.");
        const ownedId = cartId ?? (await port.createCart({ idempotencyKey: `create:${body.idempotencyKey}` })).id;
        const options = { idempotencyKey: body.idempotencyKey };
        const cart = body.action === "add"
          ? await port.addItem(ownedId, { productId: body.productId, variantId: body.variantId, quantity: body.quantity }, options)
          : await port.updateItem(ownedId, body.lineId, body.quantity, options);
        const response = privateJson({ cart, checkoutEnabled });
        if (!cartId) response.cookies.set(cartCookieName(market), signCartCookie(ownedId, market, deps.cookieSecret), { httpOnly: true, secure: deps.secure, sameSite: "lax", path: "/", maxAge: CART_COOKIE_MAX_AGE });
        return response;
      }
      if (!cartId) throw new AppError("unauthorized", "Your bag session has expired. Add an item to start again.", { publicMessage: "This browser no longer has an active bag. Add an item to start again; previous orders require their original browser credential." });
      if (resource === "orders") {
        if (request.method !== "GET") return privateJson({ error: { kind: "validation", message: "Method not allowed" } }, 405);
        const port = deps.getCommerce().orders;
        return privateJson(resourceId ? { order: await port.get(cartId, id.parse(resourceId)) } : { orders: await port.list(cartId) });
      }
      if (!checkoutEnabled) throw new AppError("upstream", "Sandbox checkout is not configured", { publicMessage: market === "au" ? "Sandbox payment is not available yet. Your bag is saved." : "Sandbox payment is available in the Australian store only." });
      const port = deps.getCommerce().checkout;
      if (resourceId) {
        id.parse(resourceId);
        if (request.method === "GET") return privateJson({ checkout: await port.reconcile(cartId, resourceId) });
        z.object({ action: z.literal("cancel") }).parse(await jsonInput(request));
        return privateJson({ checkout: await port.cancel(cartId, resourceId) });
      }
      if (request.method !== "POST") return privateJson({ error: { kind: "not_found", message: "Choose a checkout to view." } }, 404);
      const body = checkoutInputSchema.extend({ idempotencyKey: requestKey }).parse(await jsonInput(request));
      const { idempotencyKey, ...input } = body;
      return privateJson({ checkout: await port.start(cartId, input, { idempotencyKey }) });
    } catch (error) { return apiError(error); }
  };
}
