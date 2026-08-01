import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClauseGuard — Contract Review Assistant",
  description:
    "AI-powered contract review assistant. Assistant only — not legal advice. A human makes the final decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full font-sans antialiased">
        <header className="border-b border-rule bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">ClauseGuard</h1>
              <p className="text-xs text-muted">Contract Review Assistant — team Doomsday</p>
            </div>
            <a
              href="/api/health"
              className="text-xs text-muted hover:text-ink"
              target="_blank"
              rel="noreferrer"
            >
              /api/health
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 pb-12 pt-4 text-xs text-muted">
          Assistant only — not legal advice. A human reviewer makes the final decision.
        </footer>
      </body>
    </html>
  );
}