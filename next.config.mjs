/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { dirs: ["app", "components", "lib", "scripts", "worker", "tests", "seed"] },
  experimental: {
    serverComponentsExternalPackages: ["pg", "pg-boss"],
  },
};

export default nextConfig;
