import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // force rebuild to pick up NEXT_PUBLIC env vars
};

export default nextConfig;
