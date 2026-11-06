import { createAppConsumerAfterSalesApi } from "../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; requestId: string }> },
) {
  const { market, requestId } = await context.params;
  return createAppConsumerAfterSalesApi().getAfterSalesRequest(
    request,
    market,
    requestId,
  );
}
