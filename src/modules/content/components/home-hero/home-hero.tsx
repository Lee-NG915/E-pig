import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { withMarketPrefix } from "@/platform/config/market-path";
import { Button } from "@e-pig/happy-dog/components/button";

import { HomeHeroCta } from "./home-hero-cta";

type HomeHeroProps = {
  marketId: string;
};

/** 首页首屏：品牌信号 + 一句主张 + CTA → Sofas PLP + 全宽主视觉。 */
export function HomeHero({ marketId }: HomeHeroProps) {
  const shopHref = withMarketPrefix(marketId, "/collections/sofas");

  return (
    <section className="relative min-h-[min(88vh,720px)] w-full overflow-hidden bg-secondary">
      <Image
        src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=2000&q=88"
        alt="Soft modular sofa in a calm living room with natural light"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/25 to-foreground/10" />
      <div className="relative mx-auto flex min-h-[min(88vh,720px)] max-w-[1440px] flex-col justify-end px-4 pb-14 pt-28 sm:px-6 sm:pb-20 lg:px-8">
        <p className="text-xs uppercase tracking-[0.28em] text-white/75">E-pig</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[0.95] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
          Furniture for slower days.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-white/80 sm:text-lg">
          Modular sofas, calm bedrooms and outdoor pieces made for real living — not showrooms.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <HomeHeroCta href={shopHref} />
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="rounded-full border-0 bg-white/15 px-7 text-white backdrop-blur hover:bg-white/25"
          >
            <Link href={withMarketPrefix(marketId, "/collections/living-room")} prefetch={false}>
              Explore living
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
