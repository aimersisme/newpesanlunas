import { NextResponse, type NextRequest } from "next/server";

/**
 * v0.2.1 performance note:
 * We intentionally do NOT call supabase.auth.getUser() in middleware.
 * That network round-trip ran on every navigation and made the mobile UI feel slow.
 * Protected pages still resolve the current business through authenticated Supabase RPC,
 * and PostgreSQL RLS remains the actual authorization boundary.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (path !== "/setup" && !path.startsWith("/api/health")) {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/setup";
      setupUrl.search = "";
      return NextResponse.redirect(setupUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
