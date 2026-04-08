"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import LocalDateTime from "@/components/local-date-time";

const TIMESTAMP_KEYS = new Set(["cr6c3_lastseeninsync", "modifiedon"]);

const COLUMNS: { key: string; label: string }[] = [
  { key: "cr6c3_agentname", label: "Agent Name" },
  { key: "cr6c3_username", label: "User Name" },
  { key: "cr6c3_disableflagcopilot", label: "Disable Flag" },
  { key: "cr6c3_copilotflagchangereason", label: "Flag Change Reason" },
  { key: "cr6c3_lastseeninsync", label: "Last Seen In Sync" },
  { key: "modifiedon", label: "Modified On" },
];

type Block = {
  id: number;
  user_id: string;
  user_display_name: string | null;
  user_principal_name: string | null;
  bot_id: string;
  bot_name: string | null;
  block_scope: "agent" | "all";
  entra_sync_status: string;
  entra_sync_error: string | null;
  blocked_by: string;
  blocked_at: string;
  block_reason: string | null;
};

type Agent = { bot_id: string; bot_name: string | null };

const SYNC_BADGE: Record<string, { label: string; className: string }> = {
  synced: { label: "Synced", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  not_applicable: { label: "N/A", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

const SCOPE_BADGE: Record<string, { label: string; className: string }> = {
  agent: { label: "This Agent", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  all: { label: "All Agents", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
};

export default function DataverseTableClient() {
  // Dataverse rows
  const [rows, setRows] = React.useState<Record<string, any>[]>([]);
  const [dvLoading, setDvLoading] = React.useState(true);
  const [dvError, setDvError] = React.useState<string | null>(null);
  const [dvErrorType, setDvErrorType] = React.useState<string | null>(null);

  // Access control
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [blocksLoading, setBlocksLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [blockError, setBlockError] = React.useState<string | null>(null);
  const [blockErrorType, setBlockErrorType] = React.useState<string | null>(null);

  // Block form state
  const [selectedAgent, setSelectedAgent] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState("");
  const [blockReason, setBlockReason] = React.useState("");

  // Confirmation modal
  const [modal, setModal] = React.useState<{
    title: string;
    description: string;
    reason: string;
    onConfirm: (reason: string) => void;
  } | null>(null);

  const fetchDv = React.useCallback(async () => {
    try {
      const res = await fetch("/api/agents/dataverse");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDvError(data.error || `Failed to load (${res.status})`);
        setDvErrorType(data.dv_error_type || "unknown");
        return;
      }
      const data = await res.json();
      setRows(data.rows || []);
      setDvError(null);
      setDvErrorType(null);
    } catch {
      setDvError("Failed to fetch Dataverse data");
      setDvErrorType("unreachable");
    } finally {
      setDvLoading(false);
    }
  }, []);

  const fetchBlocks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/agents/access-blocks");
      if (!res.ok) { setBlockError("Failed to load access blocks"); return; }
      const data = await res.json();
      setBlocks(data.blocks || []);
      setAgents(data.agents || []);
      setBlockError(null);
    } catch {
      setBlockError("Failed to load access blocks");
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDv();
    fetchBlocks();
  }, [fetchDv, fetchBlocks]);

  // Derive unique agent names from DV rows
  const dvAgents = React.useMemo(() => {
    const seen = new Set<string>();
    return rows
      .filter((r) => r.cr6c3_agentname)
      .reduce<string[]>((acc, r) => {
        const name = r.cr6c3_agentname as string;
        if (!seen.has(name)) { seen.add(name); acc.push(name); }
        return acc;
      }, [])
      .sort();
  }, [rows]);

  // Derive users for the selected agent
  const dvUsersForAgent = React.useMemo(() => {
    if (!selectedAgent) return [];
    const seen = new Set<string>();
    return rows
      .filter((r) => r.cr6c3_agentname === selectedAgent && r.cr6c3_username)
      .reduce<string[]>((acc, r) => {
        const name = r.cr6c3_username as string;
        if (!seen.has(name)) { seen.add(name); acc.push(name); }
        return acc;
      }, [])
      .sort();
  }, [rows, selectedAgent]);

  function handleBlock() {
    if (!selectedUser || !selectedAgent) return;
    const agent = agents.find((a) => a.bot_id === selectedAgent);
    setModal({
      title: "Confirm Block",
      description: `Block "${selectedUser}" from "${agent?.bot_name || selectedAgent}"?`,
      reason: blockReason,
      onConfirm: (reason) => executeBlock(reason),
    });
  }

  async function executeBlock(reason: string) {
    setSubmitting(true);
    setBlockError(null);
    const agent = agents.find((a) => a.bot_id === selectedAgent);
    try {
      const res = await fetch("/api/agents/access-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block",
          user_id: selectedUser,
          bot_id: selectedAgent,
          bot_name: agent?.bot_name || selectedAgent,
          user_display_name: selectedUser,
          block_scope: "agent",
          block_reason: reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlockError(data.error || "Block failed");
        setBlockErrorType(data.dv_error_type || "unknown");
      } else {
        const dvRow = rows.find(
          (r) => r.cr6c3_agentname === selectedAgent && r.cr6c3_username === selectedUser,
        );
        if (dvRow) {
          await fetch("/api/agents/dataverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              row_id: dvRow.cr6c3_table11id,
              data: { cr6c3_disableflagcopilot: true, cr6c3_copilotflagchangereason: reason.trim() || null },
            }),
          });
        }
        setBlockError(null);
        setBlockErrorType(null);
        setSelectedUser("");
        setSelectedAgent("");
        setBlockReason("");
        await Promise.all([fetchDv(), fetchBlocks()]);
      }
    } catch {
      setBlockError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleUnblock(block: Block) {
    const scopeLabel = block.block_scope === "all" ? "all agents" : (block.bot_name || block.bot_id);
    setModal({
      title: "Confirm Unblock",
      description: `Unblock "${block.user_display_name || block.user_id}" from ${scopeLabel}?`,
      reason: "",
      onConfirm: (reason) => executeUnblock(block, reason),
    });
  }

  async function executeUnblock(block: Block, reason: string) {
    setSubmitting(true);
    setBlockError(null);
    try {
      const res = await fetch("/api/agents/access-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unblock",
          user_id: block.user_id,
          bot_id: block.bot_id,
          unblock_reason: reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlockError(data.error || "Unblock failed");
        setBlockErrorType(data.dv_error_type || "unknown");
      } else {
        const dvRow = rows.find(
          (r) =>
            r.cr6c3_agentname === (block.bot_name || block.bot_id) &&
            r.cr6c3_username === (block.user_principal_name || block.user_display_name || block.user_id),
        );
        if (dvRow) {
          await fetch("/api/agents/dataverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              row_id: dvRow.cr6c3_table11id,
              data: { cr6c3_disableflagcopilot: false, cr6c3_copilotflagchangereason: reason.trim() || null },
            }),
          });
        }
        await Promise.all([fetchDv(), fetchBlocks()]);
      }
    } catch {
      setBlockError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass = "rounded-md border border-input bg-background px-3 py-1.5 text-sm";
  const inputClass = "rounded-md border border-input bg-background px-3 py-1.5 text-sm";
  const formReady = selectedUser && selectedAgent && blockReason.trim() && !submitting;

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent-User Information</h1>
          <p className="text-sm text-muted-foreground">
            Live data from Dataverse - agent access assignments
          </p>
        </div>
        <Link href="/dashboard/agents">
          <Button variant="outline" size="sm">
            {"<-"} Back to Agents
          </Button>
        </Link>
      </div>

      {/* ── Agent Access Records ── */}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              Agent Access Records
              {!dvLoading && !dvError && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({rows.length} row{rows.length !== 1 ? "s" : ""})
                </span>
              )}
            </CardTitle>
            <CardDescription>All agent-user assignments from Dataverse</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {dvLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : dvError ? (
            <DvErrorBanner errorType={dvErrorType} rawError={dvError} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows found.</p>
          ) : (
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {COLUMNS.map((col) => (
                      <TableHead key={col.key} className="whitespace-nowrap">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {COLUMNS.map((col) => {
                        const val = row[col.key];
                        const isDisableFlag = col.key === "cr6c3_disableflagcopilot";
                        const isTimestamp = TIMESTAMP_KEYS.has(col.key);
                        const isTrue = isDisableFlag && val === true;
                        const display =
                          val == null ? "—" : isTrue ? (
                            <span className="font-medium text-red-500">true</span>
                          ) : isTimestamp ? (
                            <LocalDateTime value={String(val)} fallback="—" />
                          ) : (
                            String(val)
                          );
                        return (
                          <TableCell key={col.key} className="max-w-xs truncate" title={val == null ? "" : String(val)}>
                            {display}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Block form ── */}
      <Card>
        <CardHeader>
          <CardTitle>Block User from Agent</CardTitle>
          <CardDescription>Block an individual user from accessing a specific agent</CardDescription>
        </CardHeader>
        <CardContent>
          {blockError && (
            <div className="mb-4">
              <DvErrorBanner errorType={blockErrorType} rawError={blockError} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => { setSelectedAgent(e.target.value); setSelectedUser(""); }}
                className={selectClass}
                disabled={submitting || dvLoading}
              >
                <option value="">Select agent...</option>
                {dvAgents.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                User{selectedAgent && dvUsersForAgent.length === 0 && (
                  <span className="ml-1 text-amber-600">(no users found for this agent)</span>
                )}
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className={selectClass}
                disabled={submitting || dvLoading || !selectedAgent}
              >
                <option value="">Select user...</option>
                {dvUsersForAgent.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Security concern, Policy violation..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className={inputClass + " w-64"}
                disabled={submitting}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={!formReady}
              onClick={handleBlock}
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {submitting ? "Blocking..." : "Block from Agent"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Active blocks ── */}
      <Card>
        <CardHeader>
          <CardTitle>Active Blocks</CardTitle>
          <CardDescription>Users currently blocked from one or more agents</CardDescription>
        </CardHeader>
        <CardContent>
          {blocksLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active blocks.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Entra Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Blocked By</TableHead>
                    <TableHead>Blocked At</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((b) => {
                    const syncBadge = SYNC_BADGE[b.entra_sync_status] || SYNC_BADGE.not_applicable;
                    const scopeBadge = SCOPE_BADGE[b.block_scope] || SCOPE_BADGE.agent;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <span className="font-medium">
                            {b.user_principal_name || b.user_display_name || b.user_id}
                          </span>
                        </TableCell>
                        <TableCell>{b.bot_name || b.bot_id}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${scopeBadge.className}`}>
                            {scopeBadge.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${syncBadge.className}`}
                            title={b.entra_sync_error || undefined}
                          >
                            {syncBadge.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground" title={b.block_reason || ""}>
                          {b.block_reason || <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{b.blocked_by}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(b.blocked_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleUnblock(b)}
                          >
                            Unblock
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Confirmation modal ── */}
      {modal && (
        <ConfirmModal
          title={modal.title}
          description={modal.description}
          initialReason={modal.reason}
          onConfirm={(reason) => { setModal(null); modal.onConfirm(reason); }}
          onCancel={() => setModal(null)}
        />
      )}
    </main>
  );
}

function DvErrorBanner({ errorType, rawError }: { errorType: string | null; rawError: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const { message, hint } = React.useMemo(() => {
    switch (errorType) {
      case "not_configured":
        return {
          message: "Dataverse integration is not configured on this server.",
          hint: "Check that DATAVERSE_URL and ENTRA_TENANT_ID / ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET are set in the worker environment.",
        };
      case "auth_failed":
        return {
          message: "Authentication failed — could not obtain a Dataverse token.",
          hint: "The app service principal may have an expired client secret or incorrect credentials. Check the app registration in Azure Portal.",
        };
      case "permission_denied":
        return {
          message: "Permission denied — the app registration lacks access to this Dataverse environment.",
          hint: "Assign a Security Role (e.g. Basic User + table permissions) to the app in the Power Platform admin center under Environment → Users.",
        };
      case "unreachable":
        return {
          message: "Dataverse environment is unreachable.",
          hint: "The environment may be down, paused, or blocked by a firewall. Verify the DATAVERSE_URL and check the Power Platform admin center for environment status.",
        };
      default:
        return {
          message: "An unexpected Dataverse error occurred.",
          hint: "Check the worker logs for the full stack trace.",
        };
    }
  }, [errorType]);

  function handleCopy() {
    navigator.clipboard.writeText(rawError).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-800 dark:bg-red-900/20">
      <p className="font-medium text-red-800 dark:text-red-300">{message}</p>
      <p className="mt-1 text-red-700 dark:text-red-400">{hint}</p>
      {errorType === "unknown" && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="mt-2 rounded border border-red-200 bg-red-100 p-2 dark:border-red-700 dark:bg-red-900/40">
              <div className="flex items-start justify-between gap-2">
                <pre className="whitespace-pre-wrap break-all text-xs text-red-800 dark:text-red-300">{rawError}</pre>
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-800/40"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  initialReason,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  initialReason: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = React.useState(initialReason);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4 flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Reason <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Security concern, Policy violation..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reason.trim()) onConfirm(reason);
              if (e.key === "Escape") onCancel();
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}
