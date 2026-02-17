import Link from "next/link";

import { buildSignInAccountUrl, sanitizeCallbackUrl } from "@/app/lib/callback-url";
import { SignOutButton } from "@/app/signout/sign-out-button";
import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export default async function SignOutPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = sanitizeCallbackUrl(resolvedSearchParams?.callbackUrl);
  const signInUrl = buildSignInAccountUrl(callbackUrl);

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
            <SignOutButton callbackUrl={signInUrl} />
            <Button asChild variant="outline">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
