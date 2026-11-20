import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/cartonlab/:path*", destination: "/packstudio/:path*" },
        { source: "/cartonlab-icon.png", destination: "/packstudio-icon.png" },
        { source: "/cartonlab-symbol.png", destination: "/packstudio-symbol.png" },
      ],
    };
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
