import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

/**
 * Figma contract: styles Default / Secondary / Outline / Sale / Success / Info.
 * Filled status badges reuse the light primary-foreground (cream.50) on 500-level fills.
 */
const badgeVariants = cva("inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] whitespace-nowrap transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      sale: "border-transparent bg-sale text-primary-foreground",
      success: "border-transparent bg-success text-primary-foreground",
      info: "border-transparent bg-info text-primary-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
