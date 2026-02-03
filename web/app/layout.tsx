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
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-pine text-white grid place-items-center font-display text-xl shadow-glow">
                  PS
                </div>
                <div>
                  <div className="font-display text-2xl text-ink">Princeton Sentinel</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate/70">Data Posture Dashboard</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {session ? (
                  <>
                    <span className="text-slate/70">{session.user?.email}</span>
                    <Link href="/api/auth/signout" className="badge badge-warn">Sign out</Link>
                  </>
                ) : (
                  <Link href="/api/auth/signin" className="badge badge-ok">Sign in</Link>
                )}
              </div>
            </div>
          </header>

          <nav className="px-6">
            <div className="mx-auto flex max-w-6xl flex-wrap gap-3">
              <Link className="badge bg-white/70 text-slate hover:bg-white" href="/">
                Overview
              </Link>
              {canUser && (
                <>
                  <Link className="badge bg-white/70 text-slate hover:bg-white" href="/analytics">
                    Analytics
                  </Link>
                  <Link className="badge bg-white/70 text-slate hover:bg-white" href="/jobs">
                    Jobs
                  </Link>
                  <Link className="badge bg-white/70 text-slate hover:bg-white" href="/runs">
                    Runs
                  </Link>
                </>
              )}
              {canAdmin && (
                <Link className="badge bg-white/70 text-slate hover:bg-white" href="/admin">
                  Admin
                </Link>
              )}
            </div>
          </nav>

          <main className="px-6 py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
