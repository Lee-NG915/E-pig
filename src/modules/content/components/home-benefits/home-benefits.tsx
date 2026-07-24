import { Leaf, PackageCheck, ShieldCheck } from "lucide-react";

const benefits = [
  {
    icon: PackageCheck,
    title: "Easy delivery",
    copy: "Clear delivery estimates and room-of-choice options.",
  },
  {
    icon: ShieldCheck,
    title: "120-night trial",
    copy: "Live with it first. Returns should never feel mysterious.",
  },
  {
    icon: Leaf,
    title: "Considered materials",
    copy: "Durable finishes and fewer, better components by design.",
  },
];

/** 首页权益条（无商品逻辑）：三条静态服务承诺。 */
export function HomeBenefits() {
  return (
    <section className="bg-secondary/65">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-20 md:grid-cols-3 lg:px-8 lg:py-24">
        {benefits.map(({ icon: Icon, title, copy }) => (
          <article key={title} className="max-w-sm">
            <div className="grid size-11 place-items-center rounded-full border bg-background">
              <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
            </div>
            <h3 className="mt-5 font-display text-2xl">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
