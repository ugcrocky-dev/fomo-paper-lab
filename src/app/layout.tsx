import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "FOMO Paper Lab",
  description: "100 paper strategies. $1000 each. Promote after 7 days.",
};

const nav = [
  { href: "/", label: "Overview" },
  { href: "/bots", label: "Bots" },
  { href: "/traders", label: "Traders" },
  { href: "/lab", label: "Lab" },
  { href: "/trades", label: "Trades" },
  { href: "/rules", label: "Rules" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <div className="min-h-screen">
          <header className="border-b border-[var(--line)] bg-[rgba(8,10,14,0.92)] backdrop-blur sticky top-0 z-20">
            <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                  Paper trading desk
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">FOMO Paper Lab</h1>
              </div>
              <nav className="flex flex-wrap gap-2">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="font-mono text-xs uppercase tracking-wider px-3 py-2 border border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
