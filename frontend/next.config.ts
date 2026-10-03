import type { NextConfig } from "next";

const apiBaseUrl =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8000");

const nextConfig: NextConfig = {
  async rewrites() {
    // Vercel Services routes /api/* straight to Express. A standalone frontend
    // deployment can instead set BACKEND_API_BASE_URL for an external backend.
    if (!apiBaseUrl) return [];
    return [
      {
        // Backend boundary:
        // The builder always calls same-origin /api/* paths. Point
        // BACKEND_API_BASE_URL at the Express/Mongoose backend.
        source: "/api/:path*",
        destination: `${apiBaseUrl.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
