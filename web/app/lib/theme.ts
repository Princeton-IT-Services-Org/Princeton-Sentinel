export const THEME_COOKIE_NAME = "ps-theme";
export const THEME_STORAGE_KEY = "ps-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeMode = "light" | "dark";

export function normalizeTheme(value: string | null | undefined): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

export function buildThemeCookieValue(mode: ThemeMode): string {
  return `${THEME_COOKIE_NAME}=${mode}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
