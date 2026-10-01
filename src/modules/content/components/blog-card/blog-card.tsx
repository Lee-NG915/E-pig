import Image from "next/image";

import type { BlogPost } from "@/modules/content/lib/blog-posts";

const calendarIcon = "/blog/calendar.svg";
const commentsIcon = "/blog/comments.svg";
const nextIcon = "/blog/arrow-next.svg";

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="flex w-full flex-col items-start overflow-hidden bg-[var(--blog-surface)] shadow-[0_2px_4px_rgba(0,0,0,0.1)] lg:w-[465px] lg:justify-self-center">
      <div className="relative h-[300px] w-full overflow-hidden">
        <picture>
          <source media="(max-width: 1023px)" srcSet={post.imageMobile} />
          <Image src={post.image} alt={post.imageAlt} fill sizes="(min-width: 1024px) 465px, 330px" className="object-cover" />
        </picture>
        {post.isNew ? (
          <span className="absolute left-5 top-5 rounded-[3px] bg-[var(--blog-new)] px-2.5 text-center text-[14px] font-bold leading-6 tracking-[0.2px] text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]">NEW</span>
        ) : null}
      </div>
      <div className="flex w-full flex-col items-start gap-2.5 overflow-hidden px-[25px] pb-[35px] pt-[25px]">
        <div className="flex items-center gap-[15px] overflow-hidden whitespace-nowrap text-[12px] leading-4 tracking-[0.2px]">
          {post.tags.map((tag, index) => (
            <span key={`${post.id}-${tag}`} className={index === 0 ? "text-[var(--blog-tag-accent)]" : "text-[var(--blog-muted)]"}>{tag}</span>
          ))}
        </div>
        <h2 className="w-[247px] whitespace-pre-wrap text-[20px] font-normal leading-[30px] tracking-[0.2px] text-[var(--blog-title)]">{post.title}</h2>
        <p className="w-[280px] whitespace-pre-wrap text-[14px] font-normal leading-5 tracking-[0.2px] text-[var(--blog-muted)]">{post.description}</p>
        <div className="flex w-full items-center justify-between overflow-hidden py-[15px] text-[12px] leading-4 tracking-[0.2px] text-[var(--blog-muted)]">
          <span className="flex items-center gap-[5px] whitespace-nowrap"><Image src={calendarIcon} alt="" width={16} height={16} />{post.publishedAt}</span>
          <span className="flex items-center gap-[5px] whitespace-nowrap"><Image src={commentsIcon} alt="" width={16} height={15} />{post.comments} comments</span>
        </div>
        <span aria-disabled="true" aria-label={`${post.title} details coming soon`} className="flex items-center gap-2.5 text-[14px] font-bold leading-6 tracking-[0.2px] text-[var(--blog-muted)]">Learn More<Image src={nextIcon} alt="" width={9} height={16} /></span>
      </div>
    </article>
  );
}
