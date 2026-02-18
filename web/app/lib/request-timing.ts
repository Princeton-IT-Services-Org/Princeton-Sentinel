import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import {
  PS_REQ_ID_HEADER,
  PS_REQ_METHOD_HEADER,
  PS_REQ_PATH_HEADER,
  PS_REQ_START_MS_HEADER,
} from "@/app/lib/request-timing-headers";

type TimingSource = "api" | "page";

type RequestTimingContext = {
  requestId: string;
  method: string;
  path: string;
  startMs: number;
  dbMs: number;
  handlerMs: number;
  status: number;
  source: TimingSource;
};

type RequestTimingMeta = {
  requestId: string;
  method: string;
  path: string;
  startMs: number;
  source: TimingSource;
  shouldLog: boolean;
};

const timingStorage = new AsyncLocalStorage<RequestTimingContext>();
const LOG_PREFIX = "[PERF] [WEBAPP]";

function nowMs() {
  return Date.now();
}

function parseStartMs(value: string | null) {
  if (!value) return nowMs();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return nowMs();
  return parsed;
}

function parsePath(path: string | null | undefined, fallback: string) {
  if (!path) return fallback;
  const queryIndex = path.indexOf("?");
  if (queryIndex >= 0) {
    return path.slice(0, queryIndex) || fallback;
  }
  return path || fallback;
}

function ms(value: number) {
  return Math.max(0, Math.round(value));
}

function statusFromError(err: unknown) {
  if (err && typeof err === "object" && "digest" in err) {
    const digest = String((err as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) {
      const parts = digest.split(";");
      const maybeStatus = Number(parts[parts.length - 2]);
      if (Number.isFinite(maybeStatus) && maybeStatus >= 300 && maybeStatus < 400) {
        return maybeStatus;
      }
      return 307;
    }
    if (digest.includes("404")) {
      return 404;
    }
  }
  return 500;
}

function createContext(meta: RequestTimingMeta): RequestTimingContext {
  return {
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    startMs: meta.startMs,
    dbMs: 0,
    handlerMs: 0,
    status: 200,
    source: meta.source,
  };
}

function logDone(context: RequestTimingContext) {
  const totalMs = ms(nowMs() - context.startMs);
  const dbMs = ms(context.dbMs);
  const handlerMs = ms(context.handlerMs);
  const appMs = ms(handlerMs - dbMs);
  const renderMs = ms(totalMs - handlerMs);

  console.log(
    `${LOG_PREFIX} done req_id=${context.requestId} source=${context.source} method=${context.method} path=${context.path} status=${context.status} total_ms=${totalMs} db_ms=${dbMs} app_ms=${appMs} render_ms=${renderMs}`
  );
}

function readMetaFromHeaders(rawHeaders: { get(name: string): string | null }, routeLabel: string, source: TimingSource) {
  const forwardedRequestId = rawHeaders.get(PS_REQ_ID_HEADER);
  const hasForwardedContext = Boolean(forwardedRequestId && rawHeaders.get(PS_REQ_START_MS_HEADER));
  return {
    requestId: forwardedRequestId || randomUUID(),
    method: (rawHeaders.get(PS_REQ_METHOD_HEADER) || "GET").toUpperCase(),
    path: parsePath(rawHeaders.get(PS_REQ_PATH_HEADER), routeLabel),
    startMs: parseStartMs(rawHeaders.get(PS_REQ_START_MS_HEADER)),
    source,
    shouldLog: source === "api" || hasForwardedContext,
  };
}

async function readMetaForPage(routeLabel: string) {
  try {
    const headerStore = await headers();
    return readMetaFromHeaders(headerStore, routeLabel, "page");
  } catch {
    return {
      requestId: randomUUID(),
      method: "GET",
      path: routeLabel,
      startMs: nowMs(),
      source: "page" as const,
      shouldLog: false,
    };
  }
}

async function readMetaForApi(routeLabel: string, req: unknown) {
  if (req && typeof req === "object" && "headers" in req && "method" in req) {
    const request = req as { headers?: Headers; method?: string; url?: string };
    const meta = request.headers ? readMetaFromHeaders(request.headers, routeLabel, "api") : null;
    const method = (meta?.method || request.method || "GET").toUpperCase();
    const path = meta?.path || parsePath(request.url ? new URL(request.url).pathname : null, routeLabel);
    return {
      requestId: meta?.requestId || randomUUID(),
      method,
      path,
      startMs: meta?.startMs || nowMs(),
      source: "api" as const,
      shouldLog: true,
    };
  }

  try {
    const headerStore = await headers();
    return readMetaFromHeaders(headerStore, routeLabel, "api");
  } catch {
    // no-op: use fallback metadata
  }

  return {
    requestId: randomUUID(),
    method: "GET",
    path: routeLabel,
    startMs: nowMs(),
    source: "api" as const,
    shouldLog: true,
  };
}

export function recordDbDuration(durationMs: number) {
  const context = timingStorage.getStore();
  if (!context) return;
  context.dbMs += Math.max(0, durationMs);
}

export function withApiRequestTiming<T extends (...args: any[]) => any>(routeLabel: string, handler: T): T {
  const wrapped = (async (...args: Parameters<T>) => {
    const meta = await readMetaForApi(routeLabel, args[0]);
    if (!meta.shouldLog) {
      return handler(...args);
    }
    const context = createContext(meta);
    const handlerStart = nowMs();

    return timingStorage.run(context, async () => {
      try {
        const result = await handler(...args);
        context.handlerMs = nowMs() - handlerStart;
        context.status = result instanceof Response ? result.status : 200;
        logDone(context);
        return result;
      } catch (err) {
        context.handlerMs = nowMs() - handlerStart;
        context.status = statusFromError(err);
        logDone(context);
        throw err;
      }
    });
  }) as T;

  return wrapped;
}

export function withPageRequestTiming<TProps>(routeLabel: string, pageHandler: (props: TProps) => any | Promise<any>) {
  return async function timedPageHandler(props: TProps) {
    const meta = await readMetaForPage(routeLabel);
    if (!meta.shouldLog) {
      return pageHandler(props);
    }
    const context = createContext(meta);
    const handlerStart = nowMs();

    return timingStorage.run(context, async () => {
      try {
        const result = await pageHandler(props);
        context.handlerMs = nowMs() - handlerStart;
        context.status = 200;
        logDone(context);
        return result;
      } catch (err) {
        context.handlerMs = nowMs() - handlerStart;
        context.status = statusFromError(err);
        logDone(context);
        throw err;
      }
    });
  };
}
