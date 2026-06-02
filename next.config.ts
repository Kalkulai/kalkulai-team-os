import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};

export default nextConfig;
