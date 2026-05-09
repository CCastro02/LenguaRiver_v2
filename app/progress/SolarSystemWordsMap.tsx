"use client";

import { useMemo } from "react";

export type SolarOrbitBand = "inner" | "outer";

export type SolarPlanetInput = {
  /** Stable id for React key */
  id: string;
  /** Orbit band */
  band: SolarOrbitBand;
  /** Short label under planet */
  label: string;
  /**
   * Importance 1–3: drives fixed planet diameter (higher = larger).
   */
  importance: 1 | 2 | 3;
  /** Visual mastery score in 0…1 (brightness). */
  mastery01: number;
  /** Subtle attention treatment for weak / needs-practice topics. */
  weak: boolean;
};

export type SolarSystemWordsMapProps = {
  /** Sun label, usually the active language display name. */
  languageLabel: string;
  /** Bodies to render; safe defaults can be passed when no progress exists. */
  planets: readonly SolarPlanetInput[];
};

const VIEW = 100;
const CX = VIEW / 2;
const CY = VIEW / 2;

/** Inner band fixed orbit radius. */
const INNER_R_NEAR = 16;
const INNER_R_FAR = 30;

/** Outer band fixed orbit radius. */
const OUTER_R_NEAR = 34;
const OUTER_R_FAR = 46;

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

function planetRadiusPx(importance: 1 | 2 | 3): number {
  if (importance >= 3) {
    return 11;
  }
  if (importance === 2) {
    return 8;
  }
  return 6;
}

function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

export function SolarSystemWordsMap({ languageLabel, planets }: SolarSystemWordsMapProps) {
  const { inner, outer } = useMemo(() => {
    const inn = planets.filter((p) => p.band === "inner");
    const out = planets.filter((p) => p.band === "outer");
    return { inner: inn, outer: out };
  }, [planets]);

  const positioned = useMemo(() => {
    const place = (list: readonly SolarPlanetInput[], rNear: number, rFar: number, phaseOffset: number) => {
      const n = list.length;
      const orbitRadius = (rNear + rFar) / 2;
      return list.map((p, i) => {
        const angle = phaseOffset + (360 / Math.max(n, 1)) * i - 90;
        const pos = polarToXY(angle, orbitRadius);
        return { planet: p, pos };
      });
    };
    return {
      inner: place(inner, INNER_R_NEAR, INNER_R_FAR, 0),
      outer: place(outer, OUTER_R_NEAR, OUTER_R_FAR, 18),
    };
  }, [inner, outer]);

  return (
    <section className="lr-solar card" aria-label="Topic mastery map">
      <div className="lr-solar-wrap">
        <svg
          className="lr-solar-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          aria-hidden
        >
          <defs>
            <radialGradient id="lr-solar-sun-fill" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="55%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>
          </defs>

          <circle className="lr-solar-orbit lr-solar-orbit--outer" cx={CX} cy={CY} r={(OUTER_R_NEAR + OUTER_R_FAR) / 2} />
          <circle className="lr-solar-orbit lr-solar-orbit--inner" cx={CX} cy={CY} r={(INNER_R_NEAR + INNER_R_FAR) / 2} />

          <circle className="lr-solar-sun" cx={CX} cy={CY} r={5.2} fill="url(#lr-solar-sun-fill)" />
          <text
            className="lr-solar-sun-label"
            x={CX}
            y={CY + 1.1}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {languageLabel.length > 14 ? `${languageLabel.slice(0, 13)}…` : languageLabel}
          </text>

          {positioned.outer.map(({ planet, pos }) => {
            const rPx = planetRadiusPx(planet.importance);
            const m = clamp01(planet.mastery01);
            const opacity = 0.28 + 0.72 * m;
            const fill = `rgba(226, 232, 240, ${opacity})`;
            return (
              <g key={planet.id} className={planet.weak ? "lr-solar-planet-g lr-solar-planet-g--weak" : "lr-solar-planet-g"}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={rPx / 8}
                  fill={fill}
                  stroke="rgba(148, 163, 184, 0.45)"
                  strokeWidth={0.15}
                />
              </g>
            );
          })}

          {positioned.inner.map(({ planet, pos }) => {
            const rPx = planetRadiusPx(planet.importance);
            const m = clamp01(planet.mastery01);
            const opacity = 0.28 + 0.72 * m;
            const fill = `rgba(253, 224, 171, ${opacity})`;
            return (
              <g key={planet.id} className={planet.weak ? "lr-solar-planet-g lr-solar-planet-g--weak" : "lr-solar-planet-g"}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={rPx / 8}
                  fill={fill}
                  stroke="rgba(251, 191, 36, 0.5)"
                  strokeWidth={0.18}
                />
              </g>
            );
          })}
        </svg>

        <ul className="lr-solar-labels" aria-hidden>
          {[...positioned.inner, ...positioned.outer].map(({ planet, pos }) => {
            const leftPct = (pos.x / VIEW) * 100;
            const topPct = (pos.y / VIEW) * 100;
            const short =
              planet.label.length > 22 ? `${planet.label.slice(0, 20)}…` : planet.label;
            return (
              <li
                key={`lbl-${planet.id}`}
                className="lr-solar-label-li"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              >
                <span className="lr-solar-label-text">{short}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="lr-solar-legend" aria-label="Map legend">
        <li>Size = importance (fixed)</li>
        <li>Brightness = mastery</li>
        <li>Inner orbit = core topics</li>
        <li>Outer orbit = peripheral topics</li>
      </ul>
    </section>
  );
}
