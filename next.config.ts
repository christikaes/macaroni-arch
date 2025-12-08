import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['dependency-cruiser', 'madge'],
};

export default nextConfig;
