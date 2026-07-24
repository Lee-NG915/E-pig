import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

/**
 * Figma contract: states Default / Focus / Error / Disabled, sizes Sm 32 / Md 40.
 * Error state is driven by `aria-invalid` (shadcn convention).
 */
const inputVariants = cva(
  "flex w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/25",
  {
    variants: {
      size: {
        sm: "h-8 text-[0.8125rem]",
        md: "h-10",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function Input({ className, size, type, ...props }: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return <input type={type} data-slot="input" className={cn(inputVariants({ size, className }))} {...props} />;
}

export { Input, inputVariants };
