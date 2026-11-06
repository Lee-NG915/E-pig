import { createAppConsumerAfterSalesApi } from "../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; ticketId: string }> },
) {
  const { market, ticketId } = await context.params;
  return createAppConsumerAfterSalesApi().getConsumerTicket(
    request,
    market,
    ticketId,
  );
}
