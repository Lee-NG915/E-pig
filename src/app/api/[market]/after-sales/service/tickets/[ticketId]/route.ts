import { createAppServiceAfterSalesApi } from "../../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; ticketId: string }> },
) {
  const { market, ticketId } = await context.params;
  return createAppServiceAfterSalesApi().getServiceTicket(request, market, ticketId);
}
