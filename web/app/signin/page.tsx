import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { getAuthOptions } from "@/app/lib/auth";
import { SignInButton } from "@/app/signin/sign-in-button";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-muted-foreground">Sign in with Microsoft Entra ID to access the dashboard.</p>
      <SignInButton callbackUrl={callbackUrl} initialError={error} />
    </main>
  );
}
