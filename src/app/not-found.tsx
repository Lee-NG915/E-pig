import Link from "next/link";

/** 全局 404：集合不存在等 notFound() 落点。 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1440px] flex-col items-start justify-center gap-4 px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">404</p>
      <h1 className="font-display text-4xl tracking-[-0.03em]">Page not found</h1>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for does not exist or is no longer available.
      </p>
      <Link
        href="/"
        className="text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to home
      </Link>
    </main>
  );
}
