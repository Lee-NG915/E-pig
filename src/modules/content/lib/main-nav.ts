/**
 * 主导航树（契约：docs/milestones/phase-2/M2.1/contracts-chrome.md）。
 * 纯数据；无 I/O。href 为市场无关路径，渲染时用 withMarketPrefix。
 */

export type NavPromo = {
  title: string;
  href: string;
  image: string;
  imageAlt: string;
};

export type NavChild = {
  label: string;
  href: string;
};

export type NavGroup = {
  title: string;
  children: NavChild[];
};

export type NavPrimaryItem = {
  id: string;
  label: string;
  /** 父级 PLP */
  href: string;
  groups: NavGroup[];
  promos: NavPromo[];
};

export type UtilityLink = {
  label: string;
  href: string;
};

/** 顶栏促销文案（全市场共用英文 demo）。 */
export const promoBanner = {
  text: "Sandbox shopping · No real payment or delivery",
  href: "/help/payment",
  cta: "Learn more",
} as const;

export const utilityLinks: UtilityLink[] = [
  { label: "Help", href: "/help/payment" },
  { label: "Contact", href: "/help/contact" },
];

/** 主导航叶子链（无 Mega）。href 为市场无关路径。 */
export const primaryLinks: UtilityLink[] = [{ label: "Blog", href: "/blog" }];

export const mainNav: NavPrimaryItem[] = [
  {
    id: "living",
    label: "Living",
    href: "/collections/living-room",
    groups: [
      {
        title: "Lounge",
        children: [
          { label: "Sofas", href: "/collections/sofas" },
          { label: "Sofa beds", href: "/collections/sofa-beds" },
          { label: "Armchairs", href: "/collections/armchairs" },
        ],
      },
      {
        title: "Tables",
        children: [
          { label: "Coffee & side tables", href: "/collections/tables" },
          { label: "Shop living room", href: "/collections/living-room" },
        ],
      },
    ],
    promos: [
      {
        title: "Modular sofas",
        href: "/collections/sofas",
        image:
          "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
        imageAlt: "Green modular sofa in a bright living room",
      },
      {
        title: "Living essentials",
        href: "/collections/living-room",
        image:
          "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=800&q=80",
        imageAlt: "Living room with soft seating and natural light",
      },
    ],
  },
  {
    id: "bedroom",
    label: "Bedroom",
    href: "/collections/bedroom",
    groups: [
      {
        title: "Sleep",
        children: [
          { label: "Mattresses", href: "/collections/mattresses" },
          { label: "Bedroom", href: "/collections/bedroom" },
        ],
      },
    ],
    promos: [
      {
        title: "Rest easier",
        href: "/collections/mattresses",
        image:
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        imageAlt: "Made bed in a calm bedroom",
      },
    ],
  },
  {
    id: "outdoor",
    label: "Outdoor",
    href: "/collections/outdoor",
    groups: [
      {
        title: "Outside",
        children: [{ label: "Outdoor furniture", href: "/collections/outdoor" }],
      },
    ],
    promos: [
      {
        title: "Open-air lounging",
        href: "/collections/outdoor",
        image:
          "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
        imageAlt: "Outdoor lounge furniture on a patio",
      },
    ],
  },
  {
    id: "sofas",
    label: "Sofas",
    href: "/collections/sofas",
    groups: [
      {
        title: "By type",
        children: [
          { label: "All sofas", href: "/collections/sofas" },
          { label: "Sofa beds", href: "/collections/sofa-beds" },
        ],
      },
    ],
    promos: [
      {
        title: "Shop all sofas",
        href: "/collections/sofas",
        image:
          "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80",
        imageAlt: "Contemporary sofa in a styled room",
      },
    ],
  },
];
