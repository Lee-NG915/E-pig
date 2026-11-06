import { createAppConsumerAfterSalesApi } from "../../../after-sales";

export async function POST(
  request: Request,
  context: { params: Promise<{ market: string }> },
) {
  const { market } = await context.params;
  return createAppConsumerAfterSalesApi().uploadAttachment(request, market);
}
