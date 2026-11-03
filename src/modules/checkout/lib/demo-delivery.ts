export type DemoDeliveryEstimate =
  | { status: "idle" | "invalid" | "unknown" | "unsupported" }
  | { status: "estimated"; minDays: number; maxDays: number };

/** Explicit fixture scenarios, not a postcode coverage map or carrier quote. */
export function estimateDemoDelivery(marketId: string, postcode: string): DemoDeliveryEstimate {
  if (marketId !== "au") return { status: "unsupported" };
  const value = postcode.trim();
  if (!value) return { status: "idle" };
  if (!/^\d{4}$/.test(value)) return { status: "invalid" };
  const examples: Record<string, [number, number]> = { "2000": [2, 4], "3000": [3, 5], "4000": [4, 6] };
  const window = examples[value];
  return window ? { status: "estimated", minDays: window[0], maxDays: window[1] } : { status: "unknown" };
}
