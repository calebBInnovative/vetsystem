/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only apply static export for production builds (Firebase Hosting).
  // In dev mode, skip it so dynamic [id] routes work without generateStaticParams restrictions.
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;