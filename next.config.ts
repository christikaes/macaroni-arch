import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['dependency-cruiser', 'madge'],
  transpilePackages: ['@revolist/revogrid', '@revolist/revogrid-react'],
};

export default nextConfig;
