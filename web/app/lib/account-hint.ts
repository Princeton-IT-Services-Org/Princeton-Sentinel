export const LAST_ACCOUNT_HINT_COOKIE = "ps_last_account_hint";
export const LAST_ACCOUNT_HINT_MAX_AGE_SECONDS = 300;

export function sanitizeAccountHint(value?: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > 254) return undefined;
  if (/[\x00-\x1F\x7F]/.test(normalized)) return undefined;
  const atCount = (normalized.match(/@/g) || []).length;
  if (atCount !== 1) return undefined;
  return normalized;
}
