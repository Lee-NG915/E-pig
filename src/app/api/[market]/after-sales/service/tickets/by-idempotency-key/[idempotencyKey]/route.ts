import { createAppServiceAfterSalesApi } from "../../../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; idempotencyKey: string }> },
) {
  const { market, idempotencyKey } = await context.params;
  return createAppServiceAfterSalesApi().getServiceTicketByIdempotencyKey(
    request,
    market,
    idempotencyKey,
  );
}
