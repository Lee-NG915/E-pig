import { createAppConsumerAfterSalesApi } from "../../../../../after-sales";

export async function GET(
  request: Request,
  context: { params: Promise<{ market: string; attachmentId: string }> },
) {
  const { market, attachmentId } = await context.params;
  return createAppConsumerAfterSalesApi().getAttachmentContent(
    request,
    market,
    attachmentId,
  );
}
