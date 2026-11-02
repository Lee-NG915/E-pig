import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@e-pig/happy-dog/components/button";

/** 首页设计理念编辑区（无商品逻辑）：场景图 + 文案 + 指向 #about 的 CTA。 */
export function HomeEditorial() {
  return (
    <section className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div className="relative min-h-[480px] overflow-hidden rounded-xl lg:min-h-[620px]">
        <Image
          src="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1500&q=88"
          alt="A calm bedroom with natural timber furniture"
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex min-h-[480px] flex-col justify-center rounded-xl bg-accent p-8 sm:p-12 lg:min-h-[620px] lg:p-20">
        <p className="text-xs uppercase tracking-[0.24em] text-accent-foreground">
          A quieter kind of comfort
        </p>
        <h2 className="mt-5 max-w-xl font-display text-5xl leading-[1.02] tracking-[-0.04em] sm:text-6xl">
          Designed to be lived in, not looked after.
        </h2>
        <p className="mt-6 max-w-lg leading-7 text-accent-foreground">
          Explore shapes, textures and room ideas in our furniture catalog. Product images are
          for inspiration; purchases on this store are sandbox tests.
        </p>
        <Button
          variant="outline"
          size="lg"
          className="mt-9 w-fit rounded-full border-foreground/25 bg-transparent"
          asChild
        >
          <Link href="#about">
            Our design approach
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
