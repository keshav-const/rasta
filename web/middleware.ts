import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Two gates on /admin:
//  1. Port gate — the public server (npm run dev, :4321) runs WITHOUT
//     ADMIN_ENABLED, so every /admin request 404s. The console only exists on
//     the admin server (:4322).
//  2. Auth gate — on the admin server, every /admin route except the login page
//     requires a valid signed session cookie, else redirect to /admin/login.
export async function middleware(req: NextRequest) {
  if (process.env.ADMIN_ENABLED !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (req.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
