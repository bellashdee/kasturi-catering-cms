import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Kitchen "Purchase List" section was removed: old links and bookmarks go to the purchase requests instead.
  async redirects() {
    return [{ source: "/kitchen/purchase-lists/:path*", destination: "/kitchen/purchase-requests", permanent: false }];
  },

  // Browser requests to Supabase (sign-in, file uploads, data) go through this site's own address, which forwards them to
  // Supabase. This keeps the system working on networks that cannot reach supabase.co directly.
  async rewrites() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supabase ? [{ source: "/supabase/:path*", destination: `${supabase.replace(/\/$/, "")}/:path*` }] : [];
  },
};

export default nextConfig;
