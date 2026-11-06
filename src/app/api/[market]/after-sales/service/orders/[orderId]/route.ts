import { createAppServiceAfterSalesApi } from "../../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; orderId: string }> },
) {
  const { market, orderId } = await context.params;
  return createAppServiceAfterSalesApi().getServiceOrder(request, market, orderId);
}
