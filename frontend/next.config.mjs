/** @type {import('next').NextConfig} */

// Where the FastAPI backend runs. 127.0.0.1 rather than "localhost": on some systems
// localhost resolves to IPv6 (::1) first, while uvicorn listens on IPv4 only.
const apiOrigin = (process.env.API_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig = {
  // The browser calls /api/v1 on the app's own origin and Next forwards it to the API,
  // so there is no cross-origin request and no CORS to configure.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
  // Allow the dev server to be opened as 127.0.0.1 or from another device on the LAN
  // (otherwise Next blocks its own dev assets as cross-origin requests).
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.local", ...(process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [])],
};

export default nextConfig;
