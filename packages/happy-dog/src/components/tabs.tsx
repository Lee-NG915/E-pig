"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Figma contract: variants Underline | Segmented.
 * The chosen variant is exposed to triggers via `data-variant` + a named group,
 * so `TabsTrigger` styles react to the parent list variant.
 */
const tabsListVariants = cva("group/tabs inline-flex items-center", {
  variants: {
    variant: {
      underline: "gap-4 border-b border-border",
      segmented: "gap-1 rounded-lg bg-muted p-1",
    },
  },
  defaultVariants: { variant: "underline" },
});

function TabsList({ className, variant, ...props }: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant ?? "underline"} className={cn(tabsListVariants({ variant, className }))} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/35",
        "group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:data-[state=active]:border-primary group-data-[variant=underline]/tabs:data-[state=active]:text-foreground",
        "group-data-[variant=segmented]/tabs:rounded-md group-data-[variant=segmented]/tabs:data-[state=active]:bg-background group-data-[variant=segmented]/tabs:data-[state=active]:text-foreground group-data-[variant=segmented]/tabs:data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("mt-4 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
