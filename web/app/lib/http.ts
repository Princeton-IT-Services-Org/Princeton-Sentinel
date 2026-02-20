export class HttpTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`request_timeout_${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new HttpTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
