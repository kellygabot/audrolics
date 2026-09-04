import type { NextConfig } from "next";

const apiBaseUrl =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Backend interchange point:
        // The builder always calls same-origin /api/* paths. Point
        // BACKEND_API_BASE_URL at either the FastAPI/FARM backend or the
        // Express/MERN backend as long as both expose the same /api/v1 contract.
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
