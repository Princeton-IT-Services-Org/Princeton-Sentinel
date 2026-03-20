"use client";

import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

export function UniqueUsersCard({
  count,
  userIds,
}: {
  count: string;
  userIds: string[];
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="ps-metric-card cursor-pointer transition-shadow hover:shadow-md">
          <div className="ps-metric-label">Unique Users</div>
          <div className="ps-metric-value">{count}</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-80 max-h-72 overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            Unique Users ({userIds.length})
          </h4>
        </div>
        <div className="max-h-56 overflow-y-auto pr-1">
          {userIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users found.</p>
          ) : (
            <ul className="space-y-1">
              {userIds.map((id) => (
                <li
                  key={id}
                  className="rounded bg-muted/50 px-2 py-1 font-mono text-xs break-all"
                >
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function TotalConversationsCard({
  count,
  sessions,
}: {
  count: string;
  sessions: { id: string; agent: string }[];
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="ps-metric-card cursor-pointer transition-shadow hover:shadow-md">
          <div className="ps-metric-label">Total Conversations</div>
          <div className="ps-metric-value">{count}</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-[28rem] max-h-72 overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            Latest Conversations ({sessions.length})
          </h4>
        </div>
        <div className="max-h-56 overflow-y-auto pr-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No conversations found.</p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
                >
                  <span className="font-mono break-all">{s.id}</span>
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium">{s.agent}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function EscalatedOutcomeCard({
  escalatedCount,
  escalatedSessions,
  children,
}: {
  escalatedCount: number;
  escalatedSessions: { id: string; agent: string; datetime: string; reason: string }[];
  children: React.ReactNode;
}) {
  if (escalatedCount === 0) {
    return <>{children}</>;
  }
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer">{children}</div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-[44rem] max-h-80 overflow-hidden">
        <div className="mb-2">
          <h4 className="text-sm font-semibold">
            Escalated Conversations ({escalatedSessions.length})
          </h4>
        </div>
        <div className="max-h-64 overflow-y-auto pr-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-1 pr-2 font-medium">Conversation ID</th>
                <th className="pb-1 pr-2 font-medium">Agent</th>
                <th className="pb-1 pr-2 font-medium">Date/Time</th>
                <th className="pb-1 font-medium">Error Reason</th>
              </tr>
            </thead>
            <tbody>
              {escalatedSessions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-1 pr-2 font-mono break-all">{s.id}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{s.agent}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{s.datetime}</td>
                  <td className="py-1 whitespace-nowrap text-red-500">{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
