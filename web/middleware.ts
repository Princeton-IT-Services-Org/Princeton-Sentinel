import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PREFIXES = ["/admin", "/api/worker"];
const USER_PREFIXES = [
  "/analytics",
  "/jobs",
  "/runs",
  "/api/jobs",
  "/api/schedules",
  "/api/runs",
  "/api/analytics",
  "/api/graph",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL("/api/auth/signin", req.url);
    return NextResponse.redirect(signInUrl);
  }

  const groups = (token.groups as string[]) || [];
  const adminGroup = process.env.ADMIN_GROUP_ID;
  const userGroup = process.env.USER_GROUP_ID;
  const isAdmin = adminGroup ? groups.includes(adminGroup) : false;
  const isUser = isAdmin || (userGroup ? groups.includes(userGroup) : false);

  if (ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAdmin) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (USER_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isUser) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
