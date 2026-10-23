import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Kitchen "Purchase List" section was removed: old links and bookmarks go to the purchase requests instead.
  async redirects() {
    return [
      { source: "/kitchen/purchase-lists/:path*", destination: "/kitchen/purchase-requests", permanent: false },
      { source: "/kitchen/calendar", destination: "/catering/calendar", permanent: false },
      { source: "/driver-logistics/expenses/:path*", destination: "/driver-logistics", permanent: false },
      { source: "/ingredient-calculator/:path*", destination: "/kitchen", permanent: false },
      { source: "/ingredient-calculator", destination: "/kitchen", permanent: false },
    ];
  },

  // Browser requests to Supabase (sign-in, file uploads, data) go through this site's own address, which forwards them to
  // Supabase. This keeps the system working on networks that cannot reach supabase.co directly.
  async rewrites() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supabase ? [{ source: "/supabase/:path*", destination: `${supabase.replace(/\/$/, "")}/:path*` }] : [];
  },
};

export default nextConfig;
