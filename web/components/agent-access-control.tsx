"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
type User = { user_id: string; last_agent: string | null };
type DvRow = {
  cr6c3_table11id: string;
  cr6c3_agentname: string | null;
  cr6c3_username: string | null;
  cr6c3_disableflagcopilot: boolean | null;
  cr6c3_copilotflagchangereason: string | null;
};
type Registration = {
  bot_id: string;
  bot_name: string | null;
  app_registration_id: string;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
};

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

export default function AgentAccessControl() {
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [, setUsers] = React.useState<User[]>([]);
  const [registrations, setRegistrations] = React.useState<Registration[]>([]);
  const [dvRows, setDvRows] = React.useState<DvRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  // Form state
  const [selectedUser, setSelectedUser] = React.useState("");
  const [selectedAgent, setSelectedAgent] = React.useState("");
  const [blockReason, setBlockReason] = React.useState("");

  // Block-all-agents form state
  const [selectedAllUser, setSelectedAllUser] = React.useState("");
  const [blockAllReason, setBlockAllReason] = React.useState("");

  // Confirmation modal state
  const [modal, setModal] = React.useState<{
    title: string;
    description: string;
    reason: string;
    onConfirm: (reason: string) => void;
  } | null>(null);

  // Register agent form state
  const [showRegisterForm, setShowRegisterForm] = React.useState(false);
  const [regBotId, setRegBotId] = React.useState("");
  const [regBotName, setRegBotName] = React.useState("");
  const [regAppId, setRegAppId] = React.useState("");

  const fetchData = React.useCallback(async () => {
    try {
      const [blocksRes, dvRes] = await Promise.all([
        fetch("/api/agents/access-blocks"),
        fetch("/api/agents/dataverse"),
      ]);

      if (!blocksRes.ok) {
        setError("Failed to load access blocks");
        return;
      }
      const blocksData = await blocksRes.json();
      setBlocks(blocksData.blocks || []);
      setUsers(blocksData.users || []);
      setAgents(blocksData.agents || []);
      setRegistrations(blocksData.registrations || []);

      if (dvRes.ok) {
        const dvData = await dvRes.json();
        setDvRows(dvData.rows || []);
      }
      setError(null);
    } catch {
      setError("Failed to load access blocks");
    } finally {
      setLoading(false);
    }
  }, []);

  // Derive unique agents from DV rows
  const dvAgents = React.useMemo(() => {
    const seen = new Set<string>();
    return dvRows
      .filter((r) => r.cr6c3_agentname)
      .reduce<string[]>((acc, r) => {
        const name = r.cr6c3_agentname!;
        if (!seen.has(name)) { seen.add(name); acc.push(name); }
        return acc;
      }, [])
      .sort();
  }, [dvRows]);

  // Derive all unique users from DV rows (for block-all dropdown)
  const dvAllUsers = React.useMemo(() => {
    const seen = new Set<string>();
    return dvRows
      .filter((r) => r.cr6c3_username)
      .reduce<string[]>((acc, r) => {
        const name = r.cr6c3_username!;
        if (!seen.has(name)) { seen.add(name); acc.push(name); }
        return acc;
      }, [])
      .sort();
  }, [dvRows]);

  // Derive users for the selected agent from DV rows
  const dvUsersForAgent = React.useMemo(() => {
    if (!selectedAgent) return [];
    const seen = new Set<string>();
    return dvRows
      .filter((r) => r.cr6c3_agentname === selectedAgent && r.cr6c3_username)
      .reduce<string[]>((acc, r) => {
        const name = r.cr6c3_username!;
        if (!seen.has(name)) { seen.add(name); acc.push(name); }
        return acc;
      }, [])
      .sort();
  }, [dvRows, selectedAgent]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleBlock(scope: "agent" | "all") {
    if (!selectedUser || !selectedAgent) return;
    const agent = agents.find((a) => a.bot_id === selectedAgent);
    setModal({
      title: "Confirm Block",
      description: `Block "${selectedUser}" from "${agent?.bot_name || selectedAgent}"?`,
      reason: blockReason,
      onConfirm: (reason) => executeBlock(scope, reason),
    });
  }

  async function executeBlock(scope: "agent" | "all", reason: string) {
    setSubmitting(true);
    setError(null);
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
          block_scope: scope,
          block_reason: reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Block failed");
      } else {
        if (scope === "agent") {
          const dvRow = dvRows.find(
            (r) => r.cr6c3_agentname === selectedAgent && r.cr6c3_username === selectedUser,
          );
          if (dvRow) {
            await fetch("/api/agents/dataverse", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                row_id: dvRow.cr6c3_table11id,
                data: {
                  cr6c3_disableflagcopilot: true,
                  cr6c3_copilotflagchangereason: reason.trim() || null,
                },
              }),
            });
          }
        }
        setSelectedUser("");
        setSelectedAgent("");
        setBlockReason("");
        await fetchData();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBlockAllAgents() {
    if (!selectedAllUser || !blockAllReason.trim()) return;
    setModal({
      title: "Confirm Block from All Agents",
      description: `Block "${selectedAllUser}" from all agents they are assigned to in Dataverse?`,
      reason: blockAllReason,
      onConfirm: (reason) => executeBlockAllAgents(reason),
    });
  }

  async function executeBlockAllAgents(reason: string) {
    setSubmitting(true);
    setError(null);

    // All DV rows for this user
    const userRows = dvRows.filter((r) => r.cr6c3_username === selectedAllUser);

    try {
      // Patch every DV row for this user — set DisableFlagCopilot = 'Yes'
      await Promise.all(
        userRows
          .filter((r) => r.cr6c3_disableflagcopilot !== true)
          .map((r) =>
            fetch("/api/agents/dataverse", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                row_id: r.cr6c3_table11id,
                data: {
                    cr6c3_disableflagcopilot: true,
                    cr6c3_copilotflagchangereason: reason.trim() || null,
                  },
              }),
            })
          )
      );

      // Write a block record per unique agent (ignore 409 if already blocked)
      const uniqueAgentNames = [
        ...new Set(userRows.map((r) => r.cr6c3_agentname).filter(Boolean) as string[]),
      ];
      await Promise.all(
        uniqueAgentNames.map((agentName) => {
          const agent = agents.find(
            (a) => a.bot_name === agentName || a.bot_id === agentName
          );
          return fetch("/api/agents/access-blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "block",
              user_id: selectedAllUser,
              bot_id: agent?.bot_id || agentName,
              bot_name: agentName,
              user_display_name: selectedAllUser,
              block_scope: "agent",
              block_reason: reason.trim() || null,
            }),
          });
        })
      );

      setSelectedAllUser("");
      setBlockAllReason("");
      await fetchData();
    } catch {
      setError("Block all agents failed");
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
    setError(null);

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
        setError(data.error || "Unblock failed");
      } else {
        const dvRow = dvRows.find(
          (r) => r.cr6c3_agentname === (block.bot_name || block.bot_id) &&
                 r.cr6c3_username === (block.user_principal_name || block.user_display_name || block.user_id)
        );
        if (dvRow) {
          await fetch("/api/agents/dataverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              row_id: dvRow.cr6c3_table11id,
              data: {
                  cr6c3_disableflagcopilot: false,
                  cr6c3_copilotflagchangereason: reason.trim() || null,
                },
            }),
          });
        }
        await fetchData();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisableAgent(reg: Registration) {
    const reason = prompt(
      `Disable "${reg.bot_name || reg.bot_id}" for ALL users?\n\nEnter a reason (optional):`,
    );
    if (reason === null) return; // cancelled
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/access-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable-agent",
          bot_id: reg.bot_id,
          reason: reason || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Disable failed");
      } else {
        await fetchData();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnableAgent(reg: Registration) {
    if (!confirm(`Re-enable "${reg.bot_name || reg.bot_id}" for all users?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/access-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable-agent",
          bot_id: reg.bot_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Enable failed");
      } else {
        await fetchData();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterAgent() {
    if (!regBotId.trim() || !regAppId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/access-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register-agent",
          bot_id: regBotId.trim(),
          bot_name: regBotName.trim() || regBotId.trim(),
          app_registration_id: regAppId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        setRegBotId("");
        setRegBotName("");
        setRegAppId("");
        setShowRegisterForm(false);
        await fetchData();
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass = "rounded-md border border-input bg-background px-3 py-1.5 text-sm";
  const inputClass = "rounded-md border border-input bg-background px-3 py-1.5 text-sm w-48";
  const formReady = selectedUser && selectedAgent && blockReason.trim() && !submitting;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Agent Access Control</CardTitle>
            <CardDescription>
              Manage agent availability and user access — disable agents for all users or block individual users from specific agents
            </CardDescription>
          </div>
          <span className="text-muted-foreground text-lg" aria-hidden>
            {expanded ? "−" : "+"}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {/* ── Agent Status (global disable/enable) ── */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Agent Status</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegisterForm((v) => !v)}
              >
                {showRegisterForm ? "Cancel" : "+ Register Agent"}
              </Button>
            </div>

            {/* ── Register Agent form ── */}
            {showRegisterForm && (
              <div className="mb-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Agent ID</label>
                    <input
                      type="text"
                      placeholder="e.g. hr-agent-001"
                      value={regBotId}
                      onChange={(e) => setRegBotId(e.target.value)}
                      className={inputClass}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. HR Bot"
                      value={regBotName}
                      onChange={(e) => setRegBotName(e.target.value)}
                      className={inputClass}
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Entra App ID</label>
                    <input
                      type="text"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={regAppId}
                      onChange={(e) => setRegAppId(e.target.value)}
                      className={inputClass}
                      disabled={submitting}
                    />
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!regBotId.trim() || !regAppId.trim() || submitting}
                    onClick={handleRegisterAgent}
                  >
                    {submitting ? "Registering..." : "Register"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Find the App ID in Azure Portal → App registrations → your agent's app → Application (client) ID
                </p>
              </div>
            )}

            {/* ── Agent list ── */}
            {(() => {
              const regMap = new Map(registrations.map((r) => [r.bot_id, r]));
              const sessionAgents = agents.filter((a) => !regMap.has(a.bot_id));
              const allItems = [
                ...registrations.map((r) => ({ bot_id: r.bot_id, bot_name: r.bot_name, reg: r })),
                ...sessionAgents.map((a) => ({ bot_id: a.bot_id, bot_name: a.bot_name, reg: null as Registration | null })),
              ];

              if (allItems.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No agents found. Register an agent above to enable the kill switch.
                  </p>
                );
              }

              return (
                <div className="space-y-2">
                  {allItems.map(({ bot_id, bot_name, reg }) => {
                    const isDisabled = !!reg?.disabled_at;
                    const isRegistered = !!reg;
                    return (
                      <div
                        key={bot_id}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                          isDisabled
                            ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                            : "border-border bg-background"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isDisabled
                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            }`}
                          >
                            {isDisabled ? "DISABLED" : "ACTIVE"}
                          </span>
                          <span className="text-sm font-medium">{bot_name || bot_id}</span>
                          {!isRegistered && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              Not Registered
                            </span>
                          )}
                          {isDisabled && reg && (
                            <span className="text-xs text-muted-foreground">
                              {reg.disabled_reason ? `(${reg.disabled_reason})` : ""} by {reg.disabled_by} on{" "}
                              {new Date(reg.disabled_at!).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {isRegistered ? (
                          isDisabled ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submitting}
                              onClick={() => handleEnableAgent(reg!)}
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                            >
                              {submitting ? "Enabling..." : "Re-enable"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submitting}
                              onClick={() => handleDisableAgent(reg!)}
                              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              {submitting ? "Disabling..." : "Disable Agent"}
                            </Button>
                          )
                        ) : (
                          <span
                            className="text-xs text-muted-foreground cursor-help"
                            title="Register this agent above to enable the kill switch"
                          >
                            Setup required
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Block form ── */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => { setSelectedAgent(e.target.value); setSelectedUser(""); }}
                className={selectClass}
                disabled={submitting || loading}
              >
                <option value="">Select agent...</option>
                {dvAgents.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                User {selectedAgent && dvUsersForAgent.length === 0 && (
                  <span className="text-amber-600">(no users found for this agent)</span>
                )}
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className={selectClass}
                disabled={submitting || loading || !selectedAgent}
              >
                <option value="">Select user...</option>
                {dvUsersForAgent.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Reason <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. Security concern, Policy violation..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className={inputClass + " w-64"}
                disabled={submitting}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!formReady}
                onClick={() => handleBlock("agent")}
                title="Block this user from the selected agent — updates DisableFlagCopilot in Dataverse"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {submitting ? "Blocking..." : "Block from Agent"}
              </Button>
            </div>
          </div>

          {/* ── Block from All Agents ── */}
          <div className="mb-4 flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">User</label>
              <select
                value={selectedAllUser}
                onChange={(e) => setSelectedAllUser(e.target.value)}
                className={selectClass}
                disabled={submitting || loading}
              >
                <option value="">Select user...</option>
                {dvAllUsers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Reason <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. Security concern, Policy violation..."
                value={blockAllReason}
                onChange={(e) => setBlockAllReason(e.target.value)}
                className={inputClass + " w-64"}
                disabled={submitting}
              />
            </div>

            <Button
              variant="default"
              size="sm"
              disabled={!selectedAllUser || !blockAllReason.trim() || submitting}
              onClick={handleBlockAllAgents}
              title="Disable this user across all agents they are assigned to in Dataverse"
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              {submitting ? "Blocking..." : "Block from All Agents"}
            </Button>
          </div>

          {/* ── Active blocks table ── */}
          {loading ? (
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
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${scopeBadge.className}`}
                          >
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
                        <TableCell className="text-muted-foreground max-w-[160px] truncate" title={b.block_reason || ""}>
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

          {/* ── Dataverse table link ── */}
          <div className="mt-4 mb-1">
            <Link href="/dashboard/agents/dataverse">
              <Button variant="outline" size="sm">
                Display Agent-User Information
              </Button>
            </Link>
          </div>

        </CardContent>
      )}

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
    </Card>
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
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) onConfirm(reason); if (e.key === "Escape") onCancel(); }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
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
