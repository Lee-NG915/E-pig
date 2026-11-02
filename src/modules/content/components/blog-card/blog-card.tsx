import Image from "next/image";
import type { BlogPost } from "@/modules/content/lib/blog-posts";
export function BlogCard({ post }: { post: BlogPost }) {
  return <article className="min-w-0 overflow-hidden rounded-xl bg-secondary/50">
    <div className="relative aspect-[3/2] overflow-hidden"><picture><source media="(max-width: 1023px)" srcSet={post.imageMobile} /><Image src={post.image} alt={post.imageAlt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></picture></div>
    <div className="p-6 sm:p-8"><p className="text-sm text-muted-foreground">{post.tags.join(" · ")}</p><h2 className="mt-3 whitespace-pre-wrap text-2xl leading-snug">{post.title}</h2><p className="mt-4 max-w-prose whitespace-pre-wrap leading-7 text-muted-foreground">{post.description}</p><p className="mt-5 text-sm text-muted-foreground">{post.publishedAt}</p></div>
  </article>;
}
