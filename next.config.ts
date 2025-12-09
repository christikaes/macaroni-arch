import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['madge'],
  transpilePackages: ['@revolist/revogrid', '@revolist/revogrid-react'],
};

export default nextConfig;
