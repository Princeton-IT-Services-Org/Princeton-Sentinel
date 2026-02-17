import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { getAuthOptions } from "@/app/lib/auth";
import { sanitizeCallbackUrl } from "@/app/lib/callback-url";
import { AccountSignInButtons } from "@/app/signin/account/account-sign-in-buttons";
import AuthShell from "@/components/auth-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export default async function AccountSignInPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = sanitizeCallbackUrl(resolvedSearchParams?.callbackUrl);
  const error = typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error : undefined;

  const session = await getServerSession(getAuthOptions());
  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <AuthShell
      support="Authentication"
      title="Sign in to Princeton Sentinel"
      subtitle="Use Microsoft Entra ID to access the Princeton Sentinel dashboard."
    >
      <Card>
        <CardHeader>
          <CardTitle>Continue with Entra ID</CardTitle>
          <CardDescription>Use your approved organization account to access dashboard data.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSignInButtons callbackUrl={callbackUrl} initialError={error} />
        </CardContent>
      </Card>
    </AuthShell>
  );
}
