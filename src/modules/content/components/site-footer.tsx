import Link from "next/link";

const groups = [
  { title: "Shop", links: ["Sofas", "Bedroom", "Dining", "Accessories"] },
  { title: "Help", links: ["Delivery", "Returns", "Care guide", "Contact"] },
  { title: "About", links: ["Our story", "Materials", "Journal", "Showrooms"] },
];

export function SiteFooter() {
  return (
    <footer className="mt-4 bg-primary text-primary-foreground" id="about">
      <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-14 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="font-display text-5xl tracking-[-0.05em] sm:text-6xl">E-pig</p>
            <p className="mt-5 max-w-md leading-7 text-white/60">
              A lightweight ecommerce frontend exploring calmer design, clean architecture and replaceable integrations.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">{group.title}</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {group.links.map((link) => (
                    <li key={link}>
                      <Link href="#" className="text-white/75 transition-colors hover:text-white">{link}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-white/15 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 E-pig frontend demo.</p>
          <p>Next.js 16 · Tailwind CSS 4 · shadcn/ui source components</p>
        </div>
      </div>
    </footer>
  );
}
