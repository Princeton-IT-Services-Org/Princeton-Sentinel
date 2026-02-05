import Link from "next/link";
import Image from "next/image";

import UserMenu from "@/components/user-menu";

const LOGO_HEIGHT = 36;
const LOGO_WIDTH = 135;

type AppShellProps = {
  userLabel: string;
  canAdmin: boolean;
  children: React.ReactNode;
};

export default function AppShell({ userLabel, canAdmin, children }: AppShellProps) {
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
            </nav>
          </div>
          <UserMenu userLabel={userLabel} canAdmin={canAdmin} />
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
