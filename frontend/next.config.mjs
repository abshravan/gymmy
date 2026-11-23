/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig = {
  // The browser talks to /api/v1 on the same origin; Next forwards it to the API.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
