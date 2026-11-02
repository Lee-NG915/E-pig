import { AppError } from "@/core/errors/errors";
import { apiError, privateJson } from "@/platform/http/storefront-api";
import { getCommerce, getPayment, isCheckoutEnabled } from "@/platform/registry";

export async function POST(request: Request) {
  try {
    if (!isCheckoutEnabled()) throw new AppError("upstream", "Sandbox webhook is not configured");
    const signature = request.headers.get("stripe-signature");
    if (!signature) return privateJson({ error: { kind: "unauthorized", message: "Invalid payment signature" } }, 400);
    if (Number(request.headers.get("content-length")) > 256_000) return privateJson({ error: { kind: "validation", message: "Event too large" } }, 413);
    const body = await request.text();
    if (body.length > 256_000) return privateJson({ error: { kind: "validation", message: "Event too large" } }, 413);
    const event = getPayment().parseWebhook(body, signature);
    if (event) await getCommerce().handlePaymentEvent(event);
    return privateJson({ received: true });
  } catch (error) { return apiError(error); }
}
