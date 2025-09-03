/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  distDir: "deploy/out",
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
