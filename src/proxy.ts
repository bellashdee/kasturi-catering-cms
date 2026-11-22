import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath, mergeAllowedModules, moduleForPath } from "@/lib/modules";
import { mergeAllowedSections, sectionForPath } from "@/lib/sections";
import { MONTH_FILTER_PAGES, thisMonthInMalaysia } from "@/lib/monthPages";
import { isRestaurantOnly, restaurantRedirect } from "@/lib/restaurantView";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];
// open to anyone, signed in or not (sales agents send customer details here without an account)
// /api/convert_to_markdown is the Python MarkItDown function: it checks the signed-in user itself (Supabase token) and only fetches files from this project's storage
// /api/push/notify is called by the database (a trigger) with a secret; /sw.js and /manifest.webmanifest make the system installable and its notifications work
// /api/resolve-login turns a username into the email of the account for the sign-in page (before anybody is signed in)
// /supabase is the forwarder to Supabase for the browser (Supabase checks the session itself)
const OPEN_PATHS = ["/privacy", "/customer-form", "/quotation-form", "/payment-proof-form", "/event-clock", "/api/convert_to_markdown", "/api/resolve-login", "/api/push/notify", "/sw.js", "/manifest.webmanifest", "/supabase"];


export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // the signed-in person is read from the verified token (checked on this server against the project's public key), not by asking the
  // Supabase auth server on every click: that saves a round trip on every page. Sign-in, refresh and sign-out still go to Supabase.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (OPEN_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))) return response;

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Members restricted to certain modules cannot open the pages of the others, whatever URL they type.
  if (user) {
    const moduleKey = moduleForPath(request.nextUrl.pathname);
    // A link prefetch (the browser getting ready for the links on screen: dozens per page) only fetches the page's loading frame, never
    // its records, so it skips this database check; opening the page is still checked. This keeps the database free for the page being opened.
    // (only together with the RSC header: then Next answers with the loading frame only, whatever else the request says)
    const isPrefetch = request.headers.get("rsc") === "1" && (request.headers.has("next-router-prefetch") || request.headers.has("next-router-segment-prefetch"));
    const restaurantTo = restaurantRedirect(request.nextUrl.pathname);
    if (!isPrefetch && (moduleKey || sectionForPath(request.nextUrl.pathname) || restaurantTo)) {
      const { data: grants } = await supabase.from("user_company_access").select("*").eq("user_id", user.id);
      const allowed = mergeAllowedModules((grants ?? []).map((g) => g.allowed_modules));
      const sections = mergeAllowedSections((grants ?? []).map((g) => (g as { allowed_sections?: string[] | null }).allowed_sections ?? null));
      if (!canAccessPath(allowed, request.nextUrl.pathname, sections)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "?denied=1";
        return NextResponse.redirect(url);
      }
      // O2 Life is the restaurant (no events, no customer invoices): while it is the only company viewed, an address made for catering goes to a restaurant page
      if (restaurantTo) {
        const { data: companies } = await supabase.from("companies").select("id, name");
        const all = companies ?? [];
        const accessible = (grants ?? []).some((g) => g.company_id === null)
          ? all.map((c) => c.id)
          : (grants ?? []).map((g) => g.company_id).filter((id): id is string => !!id && all.some((c) => c.id === id));
        const company = request.nextUrl.searchParams.get("company");
        if (isRestaurantOnly(all, accessible, company)) {
          const url = request.nextUrl.clone();
          url.pathname = restaurantTo;
          url.search = company ? `?company=${company}` : "";
          return NextResponse.redirect(url);
        }
      }
    }
    // a month list opened without a month shows this month; a date range the person chose (From / To) is kept as it is
    const params = request.nextUrl.searchParams;
    const hasRange = Array.from(params.keys()).some((k) => k !== "month" && /(from|to)$/i.test(k) && params.get(k));
    if (MONTH_FILTER_PAGES.has(request.nextUrl.pathname) && !params.has("month") && !hasRange) {
      const url = request.nextUrl.clone();
      url.searchParams.set("month", thisMonthInMalaysia());
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // /supabase/* is left out on purpose: Vercel forwards it straight to Supabase (no function in between, so large uploads are not limited to 4.5 MB)
    "/((?!_next/static|_next/image|favicon.ico|supabase/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
