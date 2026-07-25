import Link from "next/link";

import { withMarketPrefix } from "@/platform/config/market-path";

type PlpBreadcrumbProps = {
  marketId: string;
  collectionTitle: string;
};

/** PLP 面包屑：Home → Collection（当前页不可点）。 */
export function PlpBreadcrumb({ marketId, collectionTitle }: PlpBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <li>
          <Link
            href={withMarketPrefix(marketId, "/")}
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            prefetch={false}
          >
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-muted-foreground/50">
          /
        </li>
        <li>
          <span className="font-medium text-foreground" aria-current="page">
            {collectionTitle}
          </span>
        </li>
      </ol>
    </nav>
  );
}
