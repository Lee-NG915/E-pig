import type { CSSProperties } from "react";

/**
 * next/image 的 Storybook 替身：渲染原生 <img>。
 * `fill` 时按 next/image 的行为绝对定位铺满最近的 relative 容器；
 * sizes / priority 等 Next 专有优化参数在 story 里无意义，直接忽略。
 */
type MockImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  width?: number | `${number}`;
  height?: number | `${number}`;
};

export default function MockNextImage({
  src,
  alt,
  fill,
  className,
  style,
  width,
  height,
}: MockImageProps) {
  const resolvedStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Storybook 替身刻意用原生 img
    <img
      src={src}
      alt={alt}
      className={className}
      style={resolvedStyle}
      width={width}
      height={height}
    />
  );
}
