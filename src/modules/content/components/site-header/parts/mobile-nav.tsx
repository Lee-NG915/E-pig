"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";

import { withMarketPrefix } from "@/platform/config/market-path";
import { mainNav, type NavPrimaryItem } from "@/modules/content/lib/main-nav";
import { track } from "@/shared/lib/track";
import { Button } from "@e-pig/happy-dog/components/button";

type MobileNavProps = {
  open: boolean;
  marketId: string;
  drill: NavPrimaryItem | null;
  onClose: () => void;
  onDrill: (item: NavPrimaryItem | null) => void;
};

export function MobileNav({ open, marketId, drill, onClose, onDrill }: MobileNavProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-[min(100%,22rem)] flex-col bg-background shadow-xl">
        <div className="flex h-14 items-center justify-between border-b px-4">
          {drill ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 px-2"
              onClick={() => onDrill(null)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
          ) : (
            <p className="font-display text-lg tracking-tight">Menu</p>
          )}
          <Button type="button" variant="ghost" size="icon" aria-label="Close menu" onClick={onClose}>
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!drill ? (
            <ul className="space-y-1">
              {mainNav.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-base font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      track("nav_mobile_open", { id: item.id });
                      onDrill(item);
                    }}
                  >
                    {item.label}
                    <span aria-hidden="true" className="text-muted-foreground">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-6">
              <Link
                href={withMarketPrefix(marketId, drill.href)}
                prefetch={false}
                className="block text-sm font-medium underline underline-offset-4"
                onClick={onClose}
              >
                Shop all {drill.label}
              </Link>
              {drill.groups.map((group) => (
                <div key={group.title}>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {group.title}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {group.children.map((child) => {
                      const href = withMarketPrefix(marketId, child.href);
                      return (
                        <li key={child.label + href}>
                          <Link
                            href={href}
                            prefetch={false}
                            className="block rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={onClose}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
