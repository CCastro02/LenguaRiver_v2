export function LenguaRiverMark({ className }: { className?: string }) {
  return (
    <div className={`db-brand ${className ?? ""}`} aria-hidden>
      <span className="db-brand-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2 12c2-3 4-4 6-2s2 5 0 6-3 0-2-1 2-2 4-1M18 5c-2 4-1 6 1 5s2-2 0-2-1 0 0-1M14 20c0-2 1-3 2-1"
            stroke="var(--db-wave)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4 18c3-1 5-1 6 0" stroke="var(--db-wave-2)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="db-brand-text">LenguaRiver</span>
    </div>
  );
}
