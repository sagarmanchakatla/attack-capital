/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["local-origin.dev", "*.local-origin.dev"],
  experimental: {
    serverComponentsExternalPackages: ["ws"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Add WebSocket support
      config.externals.push({
        ws: "ws",
      });
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/websocket/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
