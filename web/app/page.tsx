import Link from "next/link";
import { getSession, getGroupsFromSession, isAdmin, isUser } from "@/app/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  const groups = getGroupsFromSession(session);
  const canUser = session ? isUser(groups) : false;
  const canAdmin = session ? isAdmin(groups) : false;

  return (
    <div className="grid gap-6">
      <section className="card p-8">
        <h1 className="font-display text-4xl text-ink">Welcome to Princeton Sentinel</h1>
        <p className="mt-3 text-slate">
          Monitor Microsoft 365 posture with cached inventory, live Graph verification, and a scheduler that stays off the web tier.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!session && (
            <Link href="/api/auth/signin" className="badge badge-ok">
              Sign in with Entra
            </Link>
          )}
          {canUser && (
            <>
              <Link className="badge bg-amber-100 text-amber-900" href="/analytics">
                View Analytics
              </Link>
              <Link className="badge bg-emerald-100 text-emerald-900" href="/jobs">
                Manage Jobs
              </Link>
            </>
          )}
          {canAdmin && (
            <Link className="badge bg-sky-100 text-sky-900" href="/admin">
              Admin Console
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-6">
          <h3 className="font-display text-xl">Cached Inventory</h3>
          <p className="mt-2 text-sm text-slate">
            Materialized views summarize users, groups, sites, drives, and items. Soft-deletes remain visible for forensic clarity.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Live Verification</h3>
          <p className="mt-2 text-sm text-slate">
            Drill down with server-side Graph calls to confirm sharing posture without exposing tokens to the browser.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Worker-Enforced Schedules</h3>
          <p className="mt-2 text-sm text-slate">
            The worker polls Postgres for due schedules and uses advisory locks to prevent overlap.
          </p>
        </div>
      </section>
    </div>
  );
}
