import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@e-pig/happy-dog/components/badge";
import { Button } from "@e-pig/happy-dog/components/button";

/** 首页首屏营销区（无商品逻辑）：价值主张 + 主视觉图 + 指向商品栅格的锚点 CTA。 */
export function HomeHero() {
  return (
    <section className="mx-auto grid max-w-[1440px] gap-4 px-4 pb-4 pt-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
      <div className="flex min-h-[560px] flex-col justify-between rounded-[2rem] bg-primary p-8 text-primary-foreground sm:p-12 lg:min-h-[680px] lg:p-16">
        <div className="flex items-center justify-between gap-4">
          <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
            New season · 2026
          </Badge>
          <span className="text-xs uppercase tracking-[0.22em] text-white/60">E-pig studio</span>
        </div>
        <div className="max-w-xl py-14">
          <p className="mb-5 text-sm uppercase tracking-[0.28em] text-white/65">
            Make room for living
          </p>
          <h1 className="font-display text-6xl leading-[0.94] tracking-[-0.045em] sm:text-7xl lg:text-[6.7rem]">
            Furniture for slower days.
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-white/72 sm:text-lg">
            Soft landings, honest materials and modular pieces designed for the way home actually
            feels.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-9 rounded-full px-7">
            <Link href="#collection">
              Shop the collection
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="max-w-sm text-sm leading-6 text-white/55">
          Frontend demo · mock adapter · no backend services connected
        </p>
      </div>

      <div className="group relative min-h-[560px] overflow-hidden rounded-[2rem] bg-secondary lg:min-h-[680px]">
        <Image
          src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1800&q=88"
          alt="A warm green sofa in a quiet living room"
          fill
          priority
          sizes="(min-width: 1024px) 54vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.015]"
        />
        <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 rounded-2xl bg-background/90 p-5 shadow-sm backdrop-blur-md sm:inset-x-8 sm:bottom-8 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              The Alto modular
            </p>
            <p className="mt-1 font-display text-2xl tracking-tight">Made to move with you</p>
          </div>
          <Link
            href="#collection"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
            aria-label="View the collection"
          >
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
