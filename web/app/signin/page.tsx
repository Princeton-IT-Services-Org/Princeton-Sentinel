import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { getAuthOptions } from "@/app/lib/auth";
import { SignInButton } from "@/app/signin/sign-in-button";
import AuthShell from "@/components/auth-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams?: { callbackUrl?: string | string[]; error?: string | string[] };
};

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: Props) {
  const session = await getServerSession(getAuthOptions());
  if (session?.user) redirect("/dashboard");

  const callbackUrl =
    typeof searchParams?.callbackUrl === "string" ? searchParams.callbackUrl : "/dashboard";
  const error = typeof searchParams?.error === "string" ? searchParams.error : undefined;

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
          <SignInButton callbackUrl={callbackUrl} initialError={error} />
        </CardContent>
      </Card>
    </AuthShell>
  );
}
