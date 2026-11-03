"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { track } from "@/shared/lib/track";
import { Button } from "@e-pig/happy-dog/components/button";

export function HomeHeroCta({ href }: { href: string }) {
  return (
    <Button asChild size="lg" className="px-7">
      <Link
        href={href}
        prefetch={false}
        onClick={() => track("home_hero_cta_click", { href })}
      >
        Shop sofas
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
