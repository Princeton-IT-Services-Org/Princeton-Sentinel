import "./globals.css";
import Link from "next/link";
import { getSession, getGroupsFromSession, isAdmin, isUser } from "@/app/lib/auth";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Princeton Sentinel",
  description: "Data posture dashboard for Microsoft 365",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const groups = getGroupsFromSession(session);
  const canUser = session ? isUser(groups) : false;
  const canAdmin = session ? isAdmin(groups) : false;

  return (
    <html lang="en">
      <body className="font-sans">
        <div className="min-h-screen">
          <header className="px-6 py-5">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-pine text-xl font-display text-white shadow-glow">
                  PS
                </div>
                <div>
                  <div className="font-display text-2xl text-ink">Princeton Sentinel</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate/70">Data Posture Dashboard</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                {session ? (
                  <details className="relative">
                    <summary className="badge bg-white/80 text-slate hover:bg-white cursor-pointer">
                      {session.user?.email || "Account"}
                    </summary>
                    <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-glow">
                      <div className="px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate/60">Account</div>
                      {canAdmin && (
                        <Link className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand" href="/admin">
                          Admin Console
                        </Link>
                      )}
                      <Link className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand" href="/api/auth/signout">
                        Sign out
                      </Link>
                    </div>
                  </details>
                ) : (
                  <Link href="/api/auth/signin" className="badge badge-ok">
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </header>

          {canUser && (
            <nav className="px-6">
              <div className="mx-auto flex max-w-6xl flex-wrap gap-3">
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/">
                  Overview
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/sites">
                  Sites
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/activity">
                  Activity
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/sharing">
                  Sharing
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/risk">
                  Risk
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/users">
                  Users
                </Link>
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/groups">
                  Groups
                </Link>
              </div>
            </nav>
          )}

          <main className="px-6 py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
