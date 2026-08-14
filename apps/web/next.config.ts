import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    // Proxying through the Next.js server means the browser only ever
    // talks to its own origin — the API's Set-Cookie response headers
    // (embr_at/embr_rt/embr_csrf) land as ordinary first-party cookies,
    // with no CORS or cross-site cookie configuration needed on either
    // side.
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default withNextIntl(nextConfig);
