import { withSentryConfig } from '@sentry/nextjs/config';

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

// Sentry wraps the config to upload source maps at build time. Without an auth
// token it skips the upload and the build still succeeds — monitoring is
// optional infrastructure, it must never be able to break a deploy.
export default withSentryConfig(nextConfig, {
  // Defaults so a local build does not need these exported; CI can override.
  org:     process.env.SENTRY_ORG     ?? 'calebbinnovative',
  project: process.env.SENTRY_PROJECT ?? 'javascript-nextjs',
  silent:  !process.env.CI,
  // Source maps are uploaded, then deleted from the export so the minified
  // bundle is not shipped alongside readable sources on a public host.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});