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
      // Company Expenses, Petty Cash and Budgets moved out of Operation Management and Admin & Finance into Company Spending
      { source: "/driver-logistics/petty-cash", destination: "/spending/petty-cash", permanent: false },
      { source: "/finance/petty-cash", destination: "/spending/petty-cash/claims", permanent: false },
      { source: "/finance/expenses/:path*", destination: "/spending/expenses/:path*", permanent: false },
      { source: "/finance/expenses", destination: "/spending/expenses", permanent: false },
      { source: "/admin/budgets/:path*", destination: "/spending/budgets/:path*", permanent: false },
      { source: "/admin/budgets", destination: "/spending/budgets", permanent: false },
      // the Categories tab of Admin & Finance was removed
      { source: "/admin/categories", destination: "/admin", permanent: false },
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
