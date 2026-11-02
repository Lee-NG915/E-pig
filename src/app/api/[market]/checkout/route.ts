import { storefrontApi } from "../../storefront";

export async function GET(request: Request, context: { params: Promise<{ market: string }> }) {
  const { market } = await context.params;
  return storefrontApi(request, market, "checkout");
}

export const POST = GET;
