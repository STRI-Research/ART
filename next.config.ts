import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ws must be external too: when Next bundles it, its optional masking helper
  // is lost and every WebSocket query throws "TypeError: b.mask is not a
  // function" in the Vercel runtime. That breaks db.transaction(), which always
  // uses a real WebSocket session (poolQueryViaFetch only covers single queries).
  serverExternalPackages: ['@neondatabase/serverless', 'ws'],
  transpilePackages: ['@stri/auth'],
}

export default nextConfig
