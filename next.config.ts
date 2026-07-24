import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Docker 权威部署产物（04 §2）：.next/standalone 自包含 Node server
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
    ],
  },
};

export default nextConfig;
