import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * next/link 的 Storybook 替身：渲染原生 <a>，不做路由预取与客户端导航。
 * story 里点击只会跳锚点，不离开 Storybook。
 */
type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string | { pathname?: string };
  children?: ReactNode;
};

export default function MockNextLink({ href, children, ...rest }: MockLinkProps) {
  const resolvedHref = typeof href === "string" ? href : (href.pathname ?? "#");
  return (
    <a href={resolvedHref} {...rest}>
      {children}
    </a>
  );
}
