"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import { LenguaRiverMark } from "@/app/LenguaRiverMark";
import "./home-dashboard.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={`home-dashboard ${inter.className}`}>
      <div className="db-shell">
        <aside className="db-aside" aria-label="App navigation">
          <Link
            href="/"
            className="db-aside-brand"
            style={{ textDecoration: "none", color: "inherit" }}
            aria-label="LenguaRiver home"
          >
            <LenguaRiverMark />
          </Link>
          <nav className="db-side-nav" aria-label="Main">
            <Link className="db-snav" href="/" data-active={pathname === "/" ? "true" : "false"}>
              Home
            </Link>
            <Link className="db-snav" href="/lesson" data-active={pathname === "/lesson" ? "true" : "false"}>
              Learn
            </Link>
            <Link className="db-snav" href="/review" data-active={pathname === "/review" ? "true" : "false"}>
              Review
            </Link>
            <Link className="db-snav" href="/progress" data-active={pathname === "/progress" ? "true" : "false"}>
              My words
            </Link>
            <Link className="db-snav" href="/explore" data-active={pathname === "/explore" ? "true" : "false"}>
              Explore
            </Link>
            <Link
              className="db-snav"
              href="/settings"
              data-active={pathname === "/settings" ? "true" : "false"}
            >
              Settings
            </Link>
          </nav>
          <div className="db-snapshot db-snapshot--placeholder">
            <p className="db-snapshot-t">This week (placeholder)</p>
            <p className="db-snapshot-ring" aria-label="Streak and rhythm coming later">
              <span className="db-snapshot-arc" />
            </p>
            <p className="db-snapshot-sub">Habits &amp; time goals are not built yet</p>
          </div>
          <p className="db-side-credit">
            Learner: <strong>Explorer</strong> (not linked to a profile yet)
          </p>
        </aside>

        <div className="db-main">{children}</div>
      </div>
    </div>
  );
}
