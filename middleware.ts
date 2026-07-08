import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths: login page and the auth endpoint itself
  if (pathname === "/login" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  if (!password) {
    return new NextResponse(
      "APP_PASSWORD is not configured on the server.",
      { status: 500 },
    );
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
