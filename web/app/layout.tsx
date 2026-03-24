import { cookies } from "next/headers";

import "./globals.css";
import { normalizeTheme, THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME, THEME_STORAGE_KEY } from "@/app/lib/theme";

export const metadata = {
  title: "Princeton Sentinel",
  description: "Data posture dashboard for Microsoft 365",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieTheme = normalizeTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const themeInitScript = `
    (function() {
      try {
        var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
        if (stored !== "light" && stored !== "dark") stored = null;
        var cookieTheme = ${JSON.stringify(cookieTheme)};
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var mode = stored || cookieTheme || (prefersDark ? "dark" : "light");
        var root = document.documentElement;
        root.classList.toggle("dark", mode === "dark");
        root.style.colorScheme = mode;
        localStorage.setItem("${THEME_STORAGE_KEY}", mode);
        document.cookie = "${THEME_COOKIE_NAME}=" + mode + "; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax";
      } catch (e) {}
    })();
  `;

  return (
    <html
      lang="en"
      className={cookieTheme === "dark" ? "dark" : undefined}
      style={{ colorScheme: cookieTheme ?? undefined }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
