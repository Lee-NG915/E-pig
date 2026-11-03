import { AppError } from "@/core/errors/errors";
import { env } from "@/platform/config/env";
import { isMarketId } from "@/platform/config/markets";
import { apiError, privateJson } from "@/platform/http/storefront-api";
import { getCapabilities } from "@/platform/registry";
import { loadComparison } from "@/modules/catalog/lib/compare-data";
import { parseCompareSearchParams } from "@/modules/catalog/lib/compare-query";

/** Selected products only; no cart identity, list preload or shared price cache. */
export async function GET(request: Request, context: { params: Promise<{ market: string }> }) {
  try {
    const { market } = await context.params;
    if (!isMarketId(market) || market !== env.MARKET) throw new AppError("not_found", "This market is not served here.");
    const params = new URL(request.url).searchParams;
    const raw: Record<string, string | string[] | undefined> = Object.create(null);
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      raw[key] = values.length === 1 ? values[0] : values;
    }
    const query = parseCompareSearchParams(raw);
    if (new Set(query.items.map(item => item.productId)).size !== query.items.length) {
      query.issues.push("Choose only one option for each product.");
    }
    if (query.issues.length) throw new AppError("validation", query.issues.join(" "));
    if (!query.items.length) return privateJson({ entries: [], issues: [] });
    const { catalog } = getCapabilities();
    return privateJson(await loadComparison(catalog, query));
  } catch (error) {
    return apiError(error);
  }
}
