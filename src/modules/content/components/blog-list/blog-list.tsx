import type { BlogPost } from "@/modules/content/lib/blog-posts";

import { BlogCard } from "../blog-card/blog-card";
import styles from "./blog-list.module.css";

export function BlogList({ posts }: { posts: readonly BlogPost[] }) {
  return (
    <section className={`${styles.blogPage} blog-page bg-[var(--blog-surface)] py-20 sm:py-40`} aria-labelledby="blog-list-title">
      <h1 id="blog-list-title" className="sr-only">Blog</h1>
      <div className="mx-auto flex max-w-[1050px] flex-col items-center gap-20 px-6 sm:px-10">
        {posts.length ? (
          <div className="grid w-full max-w-[330px] grid-cols-1 justify-center gap-y-[30px] lg:max-w-[970px] lg:grid-cols-2 lg:gap-x-[30px] lg:gap-y-20">
            {posts.map((post) => <BlogCard key={post.id} post={post} />)}
          </div>
        ) : (
          <p className="py-20 text-sm text-[var(--blog-muted)]">No posts yet.</p>
        )}
      </div>
    </section>
  );
}
