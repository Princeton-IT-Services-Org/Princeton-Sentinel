import { requireAdmin } from "@/app/lib/auth";
import { toCsvRow } from "@/app/lib/csv";
import { withApiRequestTiming } from "@/app/lib/request-timing";
import { getAgentAccessLogsBatchAfter, type AgentAccessLogRow, type AgentAccessLogCursor } from "@/app/admin/agent-access-logs/agent-access-log-queries";

export const dynamic = "force-dynamic";

const CSV_HEADERS = [
  "id",
  "occurred_at",
  "action",
  "admin_name",
  "admin_upn",
  "agent_id",
  "agent_name",
  "user_id",
  "user_name",
  "user_email",
  "reason",
] as const;

const EXPORT_BATCH_SIZE = 1000;

function toExportCsvRow(row: AgentAccessLogRow): string {
  return toCsvRow([
    row.id,
    row.occurred_at,
    row.action,
    row.admin_name,
    row.admin_upn,
    row.bot_id,
    row.bot_name,
    row.user_id,
    row.user_name,
    row.user_email,
    row.reason,
  ]);
}

const getHandler = async function GET() {
  await requireAdmin();

  const encoder = new TextEncoder();
  const now = new Date();
  const filenameDate = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(toCsvRow([...CSV_HEADERS]) + "\n"));

        let cursor: AgentAccessLogCursor | null = null;
        while (true) {
          const rows = await getAgentAccessLogsBatchAfter(cursor, EXPORT_BATCH_SIZE);
          if (!rows.length) break;

          const chunk = rows.map((row) => toExportCsvRow(row)).join("\n") + "\n";
          controller.enqueue(encoder.encode(chunk));

          const lastRow = rows[rows.length - 1];
          cursor = { occurredAt: lastRow.occurred_at, id: lastRow.id };
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agent-access-logs-${filenameDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};

export const GET = withApiRequestTiming("/api/admin/agent-access-logs/export", getHandler);
