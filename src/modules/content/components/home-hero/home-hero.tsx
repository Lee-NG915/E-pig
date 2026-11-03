import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { withMarketPrefix } from "@/platform/config/market-path";
import { Button } from "@e-pig/happy-dog/components/button";

import { HomeHeroCta } from "./home-hero-cta";

type HomeHeroProps = {
  marketId: string;
};

/** Readable campaign content with a separate, responsive room image. */
export function HomeHero({ marketId }: HomeHeroProps) {
  const shopHref = withMarketPrefix(marketId, "/collections/sofas");

  return (
    <section className="border-b bg-background" aria-labelledby="home-hero-heading">
      <div className="mx-auto grid max-w-[1440px] lg:min-h-[600px] lg:grid-cols-[5fr_7fr]">
        <div className="flex min-w-0 flex-col justify-center px-5 py-10 sm:px-8 sm:py-14 lg:py-20 lg:pr-12">
          <p className="text-sm font-medium text-primary">Room to make yourself at home</p>
          <h1 id="home-hero-heading" className="mt-4 max-w-lg text-balance font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            Furniture for slower days.
          </h1>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-foreground/80 sm:text-lg">
            Explore modular sofas, bedroom pieces and outdoor furniture. Find a shape and a finish that feel at home in your space.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3 lg:mt-9">
            <HomeHeroCta href={shopHref} />
            <Button asChild size="lg" variant="ghost" className="px-5">
              <Link href={withMarketPrefix(marketId, "/collections/living-room")} prefetch={false}>
                Explore living
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary sm:aspect-[16/10] lg:aspect-auto">
          <Image
            src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=2000&q=88"
            alt="Green sofa in a living room with a light wall and timber floor"
            fill
            priority
            sizes="(min-width: 1440px) 840px, (min-width: 1024px) 58vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
