import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

/** Figma contract: variants Text / Media / Circle / Swatch. */
const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    variant: {
      text: "h-4 w-full rounded-xs",
      media: "aspect-[4/3] w-full rounded-lg",
      circle: "size-10 rounded-full",
      swatch: "size-8 rounded-full",
    },
  },
  defaultVariants: { variant: "text" },
});

function Skeleton({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn(skeletonVariants({ variant, className }))} {...props} />;
}

export { Skeleton, skeletonVariants };
