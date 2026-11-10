/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local brand SVGs only (no remotePatterns). Disables Image Optimization API
  // (GHSA-2464-fhr4-w9xw / GHSA-2xp9-vwfh-vxw4 critical RCE paths on Next 14.2.35).
  images: { unoptimized: true },
  eslint: { dirs: ["app", "components", "lib", "scripts", "worker", "tests", "seed"] },
  experimental: {
    serverComponentsExternalPackages: ["pg", "pg-boss"],
  },
  async headers() {
    // Avoid strict CSP on `next dev` (Playwright e2e): dev tooling/HMR needs looser rules.
    if (process.env.NODE_ENV !== "production") {
      return [];
    }
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "worker-src 'self' blob:",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
