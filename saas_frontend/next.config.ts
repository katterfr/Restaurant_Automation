import type { NextConfig } from "next";

// HTTPS redirect is handled by Cloudflare at the edge — do NOT add it here.
// Adding it here causes an infinite redirect loop because Workers always receives
// requests over HTTP internally, even though the browser connected over HTTPS.
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
      ],
    },
  ],
};

export default nextConfig;
