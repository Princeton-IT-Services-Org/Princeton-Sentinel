import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { getSession, getGroupsFromSession, isAdmin, isUser } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

const LOGO_HEIGHT = 42;
const LOGO_WIDTH = 157;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const groups = getGroupsFromSession(session);
  const canUser = session ? isUser(groups) : false;
  const canAdmin = session ? isAdmin(groups) : false;

  if (!session?.user) {
    redirect("/signin?callbackUrl=/dashboard");
  }

  if (!canUser) {
    redirect("/forbidden");
  }

  const userLabel = session.user.name ?? session.user.email ?? "Signed in";

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 p-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-3 text-sm font-semibold">
              <Image src="/pis-logo.png" alt="Princeton ITS logo" width={LOGO_WIDTH} height={LOGO_HEIGHT} priority />
              <span>Princeton Sentinel</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/sites">
                Sites
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/activity">
                Activity
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/sharing">
                Sharing
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/risk">
                Risk
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/users">
                Users
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/dashboard/groups">
                Groups
              </Link>
              {canAdmin ? (
                <Link className="rounded-md px-2 py-1 hover:bg-accent" href="/admin">
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{userLabel}</span>
            <Link className="rounded-md border px-3 py-1 text-sm hover:bg-accent" href="/api/auth/signout">
              Sign out
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
