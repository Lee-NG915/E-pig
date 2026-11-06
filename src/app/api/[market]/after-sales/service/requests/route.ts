import { createAppServiceAfterSalesApi } from "../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string }> },
) {
  const { market } = await context.params;
  return createAppServiceAfterSalesApi().listServiceRequests(request, market);
}
