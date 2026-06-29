import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(configDir, "../..");

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const scriptSrc =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://checkout.razorpay.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://checkout.razorpay.com";

const frameSrc =
  "frame-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/auth", "@repo/trpc", "@repo/services", "@repo/database"],
  turbopack: {
    root: monorepoRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api-auth/:path*",
        destination: `${apiInternalUrl}/auth/:path*`,
      },
      {
        source: "/agent/stream",
        destination: `${apiInternalUrl}/agent/stream`,
      },
      {
        source: "/mcp",
        destination: `${apiInternalUrl}/mcp`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; ${frameSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
