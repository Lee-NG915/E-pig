import { Leaf, PackageCheck, ShieldCheck } from "lucide-react";

const benefits = [
  {
    icon: PackageCheck,
    title: "Explore the catalog",
    copy: "Browse furniture by room and compare the displayed options.",
  },
  {
    icon: ShieldCheck,
    title: "Test the checkout",
    copy: "Use sandbox payment details. Test orders have no real charge or delivery.",
  },
  {
    icon: Leaf,
    title: "Find your test order",
    copy: "Return to Orders in the same browser to check your sandbox purchase.",
  },
];

/** 首页权益条（无商品逻辑）：三条沙箱使用说明。 */
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
