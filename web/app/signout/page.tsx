import Link from "next/link";

import { SignOutButton } from "@/app/signout/sign-out-button";
import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function SignOutPage() {
  return (
    <AuthShell
      support="Authentication"
      title="Sign out of Princeton Sentinel"
      subtitle="Confirm sign-out to end your current authenticated session."
    >
      <Card>
        <CardHeader>
          <CardTitle>Ready to sign out?</CardTitle>
          <CardDescription>
            You can return to the dashboard if you still need to review activity, risk, or sharing data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <SignOutButton callbackUrl="/signin" />
            <Button asChild variant="outline">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
