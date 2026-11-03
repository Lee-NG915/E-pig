"use client";

import { useId, useState } from "react";
import { Button } from "@e-pig/happy-dog/components/button";
import type { ProductDemoReview } from "@/core/contracts/commerce/catalog";
import { selectDemoReviews, type DemoReviewSort } from "@/modules/catalog/lib/demo-reviews";

export function ProductReviews({ reviews = [] }: { reviews?: ProductDemoReview[] }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [sort, setSort] = useState<DemoReviewSort>("newest");
  const [expanded, setExpanded] = useState(false);
  const samples = reviews.filter(review => review.kind === "demo");
  const filtered = selectDemoReviews(samples, rating, sort);
  const visible = expanded ? filtered : filtered.slice(0, 3);
  return <section aria-labelledby={`${id}-title`} className="border-t py-10">
    <h2 id={`${id}-title`} className="font-display text-2xl">Demo reviews</h2>
    <p className="mt-3 max-w-prose text-sm leading-6 text-foreground/80">Illustrative sandbox content, not customer reviews. These examples do not verify a purchase or product performance.</p>
    {!samples.length ? <p className="mt-5 text-sm">No demo reviews are configured for this product.</p> : <>
      <p className="mt-4 font-medium">Sample average: {(samples.reduce((sum, review) => sum + review.rating, 0) / samples.length).toFixed(1)} out of 5 · {samples.length} examples</p>
      <div className="my-6 flex flex-wrap gap-5">
        <label htmlFor={`${id}-rating`} className="space-y-2 text-sm"><span className="block">Rating</span><select id={`${id}-rating`} className="min-h-11 rounded-md border bg-background px-3" value={rating} onChange={event => { setRating(Number(event.target.value)); setExpanded(false); }}>
          <option value={0}>All ratings</option>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} stars</option>)}
        </select></label>
        <label htmlFor={`${id}-sort`} className="space-y-2 text-sm"><span className="block">Sort demo reviews</span><select id={`${id}-sort`} className="min-h-11 rounded-md border bg-background px-3" value={sort} onChange={event => { setSort(event.target.value as DemoReviewSort); setExpanded(false); }}>
          <option value="newest">Newest first</option><option value="highest">Highest rating</option><option value="lowest">Lowest rating</option>
        </select></label>
      </div>
      <p role="status" className="text-sm text-foreground/80">{filtered.length} matching demo {filtered.length === 1 ? "review" : "reviews"}</p>
      <div className="mt-4 divide-y">{visible.map(review => <article key={review.id} className="py-6 first:pt-0">
        <p className="text-sm text-foreground/80">{review.authorLabel} · Sample · <time dateTime={review.publishedAt}>{review.publishedAt}</time></p>
        <h3 className="mt-2 font-medium">{review.title}</h3>
        <p className="mt-1 text-sm">{review.rating} out of 5</p>
        <details className="mt-3 max-w-prose text-sm leading-6"><summary className="w-fit cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Read sample review</summary><p className="mt-2 text-foreground/80">{review.body}</p></details>
      </article>)}</div>
      {!filtered.length ? <div className="mt-5 space-y-3"><p>No demo reviews match this rating.</p><Button variant="outline" onClick={() => { setRating(0); setExpanded(false); }}>Reset rating filter</Button></div> : null}
      {filtered.length > 3 ? <Button variant="outline" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer demo reviews" : `Show all ${filtered.length} demo reviews`}</Button> : null}
    </>}
  </section>;
}
