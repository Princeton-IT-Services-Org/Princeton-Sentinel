import "./globals.css";

export const metadata = {
  title: "Princeton Sentinel",
  description: "Data posture dashboard for Microsoft 365",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const themeInitScript = `
    (function() {
      try {
        var stored = localStorage.getItem("ps-theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var mode = stored || (prefersDark ? "dark" : "light");
        var root = document.documentElement;
        if (mode === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
      } catch (e) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
