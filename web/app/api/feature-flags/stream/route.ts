import { requireUser } from "@/app/lib/auth";
import { getFeatureFlagsPayload } from "@/app/lib/feature-flags";
import { subscribeToFeatureFlagUpdates } from "@/app/lib/feature-flags-stream";
import type { FeatureFlagsPayload } from "@/app/lib/feature-flags-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 25_000;
const RETRY_INTERVAL_MS = 5_000;

function formatSseEvent(event: "snapshot" | "updated", payload: FeatureFlagsPayload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function formatSseComment(comment: string) {
  return `: ${comment}\n\n`;
}

export const GET = async function GET(req: Request) {
  await requireUser();

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let snapshotSent = false;
      const queuedPayloads: FeatureFlagsPayload[] = [];
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let unsubscribe: (() => void) | null = null;

      const send = (chunk: string) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      };

      cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // Ignore close races during abort/teardown.
        }
      };

      req.signal.addEventListener("abort", cleanup, { once: true });

      unsubscribe = await subscribeToFeatureFlagUpdates((payload) => {
        if (!snapshotSent) {
          queuedPayloads.push(payload);
          return;
        }
        send(formatSseEvent("updated", payload));
      });

      send(`retry: ${RETRY_INTERVAL_MS}\n\n`);
      send(formatSseComment("connected"));

      const snapshot = await getFeatureFlagsPayload();
      send(formatSseEvent("snapshot", snapshot));
      snapshotSent = true;

      for (const payload of queuedPayloads) {
        send(formatSseEvent("updated", payload));
      }
      queuedPayloads.length = 0;

      heartbeatTimer = setInterval(() => {
        send(formatSseComment("heartbeat"));
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
};
