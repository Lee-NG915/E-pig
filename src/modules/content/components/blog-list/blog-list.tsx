import type { BlogPost } from "@/modules/content/lib/blog-posts";

import { BlogCard } from "../blog-card/blog-card";


export function BlogList({ posts }: { posts: readonly BlogPost[] }) {
  return (
    <section className="bg-background py-12 sm:py-20" aria-labelledby="blog-list-title">
      <h1 id="blog-list-title" className="mx-auto mb-10 max-w-6xl px-6 font-display text-4xl">Blog</h1>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-20 px-6 sm:px-10">
        {posts.length ? (
          <div className="grid w-full max-w-full grid-cols-1 justify-center gap-y-[30px] lg:max-w-full lg:grid-cols-2 lg:gap-x-[30px] lg:gap-y-20">
            {posts.map((post) => <BlogCard key={post.id} post={post} />)}
          </div>
        ) : (
          <p className="py-20 text-sm text-muted-foreground">No posts yet.</p>
        )}
      </div>
    </section>
  );
}
