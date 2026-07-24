import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained Node server for Docker (smaller runtime image)
  output: "standalone",
};

export default nextConfig;
