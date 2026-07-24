import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

/**
 * Figma contract: variants Surface | Outline, plus an Interactive treatment
 * (hover/focus elevation). Cards default to NO shadow — elevation on interaction only.
 * Radius follows the card default (12px = rounded-lg).
 */
const cardVariants = cva("rounded-lg bg-card text-card-foreground", {
  variants: {
    variant: {
      surface: "",
      outline: "border",
    },
    interactive: {
      true: "cursor-pointer transition-[box-shadow,border-color] hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
    },
  },
  defaultVariants: { variant: "surface" },
});

function Card({ className, variant, interactive, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, interactive, className }))} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-lg leading-none font-semibold", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
