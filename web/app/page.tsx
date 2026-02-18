import { withPageRequestTiming } from "@/app/lib/request-timing";
import Link from "next/link";

import AuthShell from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function HomePage() {
  return (
    <AuthShell
      support="Secure Access"
      title="Princeton Sentinel"
      subtitle="Professional data posture intelligence for Microsoft 365."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unified posture visibility</CardTitle>
            <CardDescription>Track directory, sharing, activity, and risk signals in one dashboard.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Designed for response</CardTitle>
            <CardDescription>Move from high-level trends to item-level evidence in a few clicks.</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="text-sm text-muted-foreground">Continue to your monitoring workspace.</p>
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default withPageRequestTiming("/", HomePage);
