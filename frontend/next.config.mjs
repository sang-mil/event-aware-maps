// GitHub Pages처럼 하위 경로에 올릴 때는 NEXT_PUBLIC_BASE_PATH=/event-aware-maps 로 빌드해요.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};

export default nextConfig;
