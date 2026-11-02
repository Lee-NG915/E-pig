export type BlogPost = {
  id: string;
  image: string;
  imageMobile: string;
  imageAlt: string;
  tags: readonly string[];
  title: string;
  description: string;
  publishedAt: string;
  comments: number;
  isNew?: boolean;
};

/**
 * Blog list 的展示数据暂存于本地，等内容来源确定后只替换这层适配，不改变卡片契约。
 * 图片与图标来自设计稿导出的 public/blog 资源。
 */
export const blogPosts: readonly BlogPost[] = [
  {
    id: "koudetat-01",
    image: "/blog/card-01.jpg",
    imageMobile: "/blog/card-01-mobile.jpg",
    imageAlt: "Palm trees and a warm sunset over the sea",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
  {
    id: "koudetat-02",
    image: "/blog/card-02.jpg",
    imageMobile: "/blog/card-02-mobile.jpg",
    imageAlt: "Brightly coloured paint rollers arranged together",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
  {
    id: "koudetat-03",
    image: "/blog/card-03.jpg",
    imageMobile: "/blog/card-03-mobile.jpg",
    imageAlt: "Colourful umbrellas lining a sunny street",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
  {
    id: "koudetat-04",
    image: "/blog/card-04.jpg",
    imageMobile: "/blog/card-04-mobile.jpg",
    imageAlt: "Abstract magenta and blue geometric shapes",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
  {
    id: "koudetat-05",
    image: "/blog/card-05.jpg",
    imageMobile: "/blog/card-05-mobile.jpg",
    imageAlt: "Palm trees against a pink evening sky",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
  {
    id: "koudetat-06",
    image: "/blog/card-06.jpg",
    imageMobile: "/blog/card-06-mobile.jpg",
    imageAlt: "Pink and cyan marbled abstract texture",
    tags: ["Google", "Trending", "New"],
    title: "Koudetat à la Maison #1 (L'intégrale)",
    description: "We focus on ergonomics and meeting\nyou where you work. It's only a\nkeystroke away.",
    publishedAt: "22 April 2021",
    comments: 10,
    isNew: true,
  },
] as const;
