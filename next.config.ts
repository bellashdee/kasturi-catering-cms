import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser requests to Supabase (sign-in, file uploads, data) go through this site's own address, which forwards them to
  // Supabase. This keeps the system working on networks that cannot reach supabase.co directly.
  async rewrites() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supabase ? [{ source: "/supabase/:path*", destination: `${supabase.replace(/\/$/, "")}/:path*` }] : [];
  },
};

export default nextConfig;
