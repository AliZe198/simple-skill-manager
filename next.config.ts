import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  eslint: {
    // Lint is run separately; don't fail production builds on style.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
