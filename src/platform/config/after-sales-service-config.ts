import { z } from "zod";

import { marketIds } from "./markets";

/** Parse the comma-separated service market allowlist without trusting order/duplicates. */
export const afterSalesServiceMarketsSchema = z
  .string()
  .transform((value) => value.split(",").map((entry) => entry.trim()))
  .pipe(z.array(z.enum(marketIds)).min(1))
  .transform((values) => [...new Set(values)]);

/**
 * Request-time service config gate. Kept separate from `serverEnvSchema` so a
 * bad service deployment never takes down consumer storefront routes.
 */
export const afterSalesServiceConfigSchema = z.object({
  token: z
    .string()
    .min(32)
    .refine((value) => !/\s/.test(value), "Service token must not contain whitespace"),
  markets: afterSalesServiceMarketsSchema,
});
