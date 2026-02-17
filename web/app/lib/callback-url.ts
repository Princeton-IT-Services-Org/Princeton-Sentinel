const DEFAULT_CALLBACK_URL = "/dashboard";

function normalizeInput(input?: string | string[] | null): string | undefined {
  if (!input) return undefined;
  return Array.isArray(input) ? input[0] : input;
}

export function sanitizeCallbackUrl(
  input?: string | string[] | null,
  fallback: string = DEFAULT_CALLBACK_URL,
): string {
  const value = normalizeInput(input);
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildSignInAccountUrl(callbackUrl: string): string {
  const params = new URLSearchParams({ callbackUrl });
  return `/signin/account?${params.toString()}`;
}
