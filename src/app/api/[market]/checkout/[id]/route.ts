import { storefrontApi } from "../../../storefront";

export async function GET(request: Request, context: { params: Promise<{ market: string; id: string }> }) {
  const { market, id } = await context.params;
  return storefrontApi(request, market, "checkout", id);
}

export const POST = GET;
