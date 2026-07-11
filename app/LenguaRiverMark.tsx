"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { BRAND } from "@/lib/brand-assets";

const WORDMARK_ALT =
  "LenguaRiver logo featuring a mountain and a river of multilingual greetings with the brand name.";

const ICON_ALT =
  "LenguaRiver icon: mountain and river of multilingual greetings, without the wordmark.";

const WORDMARK_ONLY_ALT =
  "LenguaRiver wordmark: the brand name LenguaRiver in the product typeface.";

const MONOCHROME_ALT =
  "LenguaRiver logo in a single-color treatment for print or high-contrast contexts.";

function subscribeTheme(onChange: () => void) {
  if (typeof document === "undefined") {
    return () => {};
  }
  const el = document.documentElement;
  const mo = new MutationObserver(onChange);
  mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

function getThemeSnapshot(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "dark";
  }
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "dark";
}

export type LenguaRiverMarkVariant =
  | "sidebar"
  | "wordmark"
  | "wordmarkOnly"
  | "monochrome";

export function LenguaRiverMark({
  className,
  decorative = false,
  variant = "sidebar",
}: {
  className?: string;
  /** When the mark sits inside a control that already has an accessible name (e.g. home link). */
  decorative?: boolean;
  /**
   * `sidebar` — square icon only (narrow rail, favicon source).
   * `wordmark` — full light/dark logo for header areas.
   * `wordmarkOnly` — text wordmark asset for minimalist sections.
   * `monochrome` — single-color logo for fallbacks / print contexts.
   */
  variant?: LenguaRiverMarkVariant;
}) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  if (variant === "sidebar") {
    return (
      <div className={`db-brand db-brand--sidebar ${className ?? ""}`}>
        <span className="db-brand-slot db-brand-slot--sidebar">
          <Image
            src={BRAND.iconMark}
            alt={decorative ? "" : ICON_ALT}
            fill
            sizes="(max-width: 480px) 15vw, 52px"
            className="db-brand-icon-img"
            priority
          />
        </span>
      </div>
    );
  }

  if (variant === "wordmarkOnly") {
    return (
      <div className={`db-brand db-brand--wordmark-only ${className ?? ""}`}>
        <span className="db-brand-slot db-brand-slot--wordmark-only">
          <Image
            src={BRAND.wordmarkOnly}
            alt={decorative ? "" : WORDMARK_ONLY_ALT}
            fill
            sizes="(max-width: 480px) min(72vw, 280px), 280px"
            className="db-brand-wordmark-only-img"
            priority
          />
        </span>
      </div>
    );
  }

  if (variant === "monochrome") {
    return (
      <div className={`db-brand db-brand--monochrome ${className ?? ""}`}>
        <span className="db-brand-slot db-brand-slot--monochrome">
          <Image
            src={BRAND.logoMonochrome}
            alt={decorative ? "" : MONOCHROME_ALT}
            fill
            sizes="(max-width: 480px) min(72vw, 280px), 280px"
            className="db-brand-monochrome-img"
            priority
          />
        </span>
      </div>
    );
  }

  const useLight = theme === "light";
  const src = useLight ? BRAND.logoFullLight : BRAND.logoFullDark;

  return (
    <div className={`db-brand db-brand--wordmark ${className ?? ""}`}>
      <span className="db-brand-slot db-brand-slot--wordmark">
        <Image
          key={src}
          src={src}
          alt={decorative ? "" : WORDMARK_ALT}
          fill
          sizes="(max-width: 480px) min(72vw, 280px), 280px"
          className="db-brand-wordmark-img"
          priority
        />
      </span>
    </div>
  );
}
