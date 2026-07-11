"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LenguaRiverMark } from "@/app/LenguaRiverMark";

const DASHBOARD_PATHS = new Set(["/", "/lesson", "/review", "/progress", "/my-words", "/explore", "/settings"]);

export function ClientMainChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard =
    DASHBOARD_PATHS.has(pathname) || pathname.startsWith("/lesson/");

  return (
    <>
      {!isDashboard ? (
        <header className="site-header">
          <div className="container">
            <nav className="nav">
              <Link href="/" className="brand brand--logo" aria-label="LenguaRiver home">
                <LenguaRiverMark decorative variant="wordmark" />
              </Link>
              <div className="nav-links">
                <Link href="/">Home</Link>
                <Link href="/lesson">Lesson</Link>
                <Link href="/review">Review</Link>
                <Link href="/my-words">My Words</Link>
                <Link href="/progress">Progress</Link>
              </div>
            </nav>
          </div>
        </header>
      ) : null}
      <main className={isDashboard ? "container container--dashboard" : "container"}>{children}</main>
    </>
  );
}
