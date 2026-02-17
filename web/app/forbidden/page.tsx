import Link from "next/link";

import { sanitizeCallbackUrl } from "@/app/lib/callback-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function ForbiddenPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = sanitizeCallbackUrl(resolvedSearchParams?.callbackUrl);
  const signOutUrl = `/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>Your account is not in an allowed Entra group for this dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
            <Button asChild>
              <Link href={signOutUrl}>Sign out</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
