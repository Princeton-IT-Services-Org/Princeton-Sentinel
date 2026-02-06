import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForbiddenPage() {
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
              <Link href="/api/auth/signout">Sign out</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
