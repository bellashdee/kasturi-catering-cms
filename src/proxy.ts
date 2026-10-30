import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath, mergeAllowedModules, moduleForPath } from "@/lib/modules";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];
// open to anyone, signed in or not (sales agents send customer details here without an account)
// /api/convert_to_markdown is the Python MarkItDown function: it checks the signed-in user itself (Supabase token) and only fetches files from this project's storage
// /api/resolve-login turns a username into the email of the account for the sign-in page (before anybody is signed in)
// /supabase is the forwarder to Supabase for the browser (Supabase checks the session itself)
const OPEN_PATHS = ["/customer-form", "/quotation-form", "/payment-proof-form", "/event-clock", "/api/convert_to_markdown", "/api/resolve-login", "/supabase"];

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
    if (moduleKey) {
      const { data: grants } = await supabase.from("user_company_access").select("allowed_modules").eq("user_id", user.id);
      const allowed = mergeAllowedModules((grants ?? []).map((g) => g.allowed_modules));
      if (!canAccessPath(allowed, request.nextUrl.pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "?denied=1";
        return NextResponse.redirect(url);
      }
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
