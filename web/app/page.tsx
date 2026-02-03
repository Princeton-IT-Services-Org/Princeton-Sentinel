import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start gap-4 p-8">
      <h1 className="text-3xl font-semibold">Princeton Sentinel</h1>
      <p className="text-muted-foreground">Data posture dashboard for Microsoft 365.</p>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </main>
  );
}
