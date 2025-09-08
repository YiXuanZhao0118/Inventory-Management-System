// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // allow your LAN IP + ports you use
  allowedDevOrigins: [
    'https://172.30.10.16:3001',
    'https://172.30.10.16:3000',
    'https://172.30.10.16:3051',
    'https://172.30.10.16:3050',
    'https://localhost:3051',
    'https://localhost:3050',
  ],
  // (optional) script tags crossOrigin attribute
  // crossOrigin: 'anonymous',
};