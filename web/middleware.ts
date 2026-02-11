import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PREFIXES = [
  "/admin",
  "/analytics",
  "/jobs",
  "/runs",
  "/api/worker",
  "/api/jobs",
  "/api/schedules",
  "/api/runs",
  "/api/analytics",
];
const USER_PREFIXES = ["/dashboard", "/sites", "/api/graph"];

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
}

function isPublicAsset(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function forbiddenRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/forbidden";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || isPublicAsset(pathname)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/internal/worker-heartbeat")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/signin") || pathname.startsWith("/signout") || pathname.startsWith("/forbidden") || pathname.startsWith("/403")) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(signInUrl);
  }

  const groups = (token.groups as string[]) || [];
  const adminGroup = process.env.ADMIN_GROUP_ID;
  const userGroup = process.env.USER_GROUP_ID;
  const isAdmin = adminGroup ? groups.includes(adminGroup) : false;
  const isUser = isAdmin || (userGroup ? groups.includes(userGroup) : false);

  if (ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAdmin) {
      if (isApiRequest(pathname)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return forbiddenRedirect(req);
    }
  }

  if (USER_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isUser) {
      if (isApiRequest(pathname)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return forbiddenRedirect(req);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
