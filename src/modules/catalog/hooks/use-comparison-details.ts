"use client";

import { useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getStorefrontQueryClient, storefrontRequest } from "@/modules/cart/lib/cart-store";
import type { ComparisonData } from "../lib/compare-data";
import { buildComparisonApiHref, type CompareItem } from "../lib/compare-query";

export const comparisonDetailsQueryKey = (marketId: string, items: CompareItem[]) =>
  ["comparison-details", marketId, buildComparisonApiHref(marketId, items)] as const;

/** Selected facts are request-time data; only the separate selection store persists IDs. */
export function useComparisonDetails(marketId: string, items: CompareItem[], enabled = true): UseQueryResult<ComparisonData, Error> {
  const client = getStorefrontQueryClient();
  useEffect(() => {
    // QueryClient ref-counts mounts, so standalone and provider-backed consumers both work.
    client.mount();
    return () => client.unmount();
  }, [client]);
  const queryKey = comparisonDetailsQueryKey(marketId, items);
  return useQuery<ComparisonData, Error>({
    queryKey,
    queryFn: ({ signal }) => storefrontRequest<ComparisonData>(queryKey[2], undefined, signal),
    enabled: enabled && items.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  }, client);
}
