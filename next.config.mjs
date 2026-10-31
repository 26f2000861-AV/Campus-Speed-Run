/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets an isolated production build (e.g. audits) use its own folder without touching the dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  devIndicators: false,
  // Only Supabase Storage (complaint evidence) may be optimised; "**" made the
  // image optimiser an open proxy for any host.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
