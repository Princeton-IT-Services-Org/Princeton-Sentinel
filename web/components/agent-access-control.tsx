"use client";

import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AgentAccessControl() {
  return (
    <Link href="/dashboard/agents/agent-access-control">
      <Card className="cursor-pointer transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>Agent Access Control</CardTitle>
          <CardDescription>
            Block and unblock individual users from specific agents, and view agent-user access assignments
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
