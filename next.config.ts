/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',           // ← Esto es clave para Firebase Hosting
  trailingSlash: true,
  images: {
    unoptimized: true,        // Necesario para export static
  },
};

export default nextConfig;