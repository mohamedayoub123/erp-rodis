"use client";

import { useId } from "react";

type Slice = { label: string; value: number; color: string };

const RADIUS = 90;
const CENTER = 100;
const GAP_DEG = 2;

function polarToCartesian(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
}

function arcPath(startDeg: number, endDeg: number) {
  const start = polarToCartesian(endDeg);
  const end = polarToCartesian(startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

// Camembert simple (pas de bibliotheque de graphiques dans ce projet) - un
// petit ecart entre chaque part (secteur legerement retracte, voir GAP_DEG)
// separe visiblement les couleurs, avec etiquette directe (%) sur les parts
// assez grandes et une legende avec le compte exact - la couleur seule ne
// porte jamais l'identite (contrainte accessibilite : WARN de contraste sur
// le vert, compense par ces etiquettes visibles). Toujours affiche (pas de
// repli/toggle) - sur demande explicite, doit rester grand et visible.
export function TestLaboPieChart({
  conforme,
  aDetruire,
  sousDerogation,
  aDecider,
}: {
  conforme: number;
  aDetruire: number;
  sousDerogation: number;
  aDecider: number;
}) {
  const gradientId = useId();
  const total = conforme + aDetruire + sousDerogation + aDecider;

  const slices: Slice[] = [
    { label: "Conforme", value: conforme, color: "#059669" },
    { label: "A detruire", value: aDetruire, color: "#dc2626" },
    { label: "Sous derogation", value: sousDerogation, color: "#c026d3" },
    { label: "A decider", value: aDecider, color: "#ea580c" },
  ].filter((slice) => slice.value > 0);

  let cursor = 0;
  const arcs = slices.map((slice) => {
    const fraction = total > 0 ? slice.value / total : 0;
    const sweep = fraction * 360;
    const start = cursor + GAP_DEG / 2;
    const end = cursor + sweep - GAP_DEG / 2;
    cursor += sweep;
    const midAngle = (start + end) / 2;
    const labelPos = polarToCartesian(midAngle);
    const labelInner = {
      x: CENTER + (labelPos.x - CENTER) * 0.62,
      y: CENTER + (labelPos.y - CENTER) * 0.62,
    };
    return {
      ...slice,
      fraction,
      path: end > start ? arcPath(start, end) : null,
      labelInner,
    };
  });

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Repartition qualite (camembert)</h2>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 sm:flex-row">
        {total === 0 ? (
          <p className="text-sm text-slate-500">Aucune preparation pour ce filtre.</p>
        ) : (
          <>
            <svg
              viewBox="0 0 200 200"
              className="h-72 w-72 shrink-0 sm:h-80 sm:w-80"
              role="img"
              aria-label={`Repartition qualite : ${arcs.map((a) => `${a.label} ${Math.round(a.fraction * 100)}%`).join(", ")}`}
            >
              <defs>
                <filter id={gradientId}>
                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.15" />
                </filter>
              </defs>
              {arcs.map((arc) =>
                arc.path ? (
                  <path key={arc.label} d={arc.path} fill={arc.color} filter={`url(#${gradientId})`} />
                ) : null
              )}
              {arcs
                .filter((arc) => arc.fraction >= 0.08)
                .map((arc) => (
                  <text
                    key={`${arc.label}-label`}
                    x={arc.labelInner.x}
                    y={arc.labelInner.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-white text-[13px] font-bold"
                  >
                    {Math.round(arc.fraction * 100)}%
                  </text>
                ))}
            </svg>

            <ul className="flex flex-col gap-3">
              {slices.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-slate-800">{slice.label}</span>
                  <span className="text-slate-500">
                    {slice.value} ({total > 0 ? Math.round((slice.value / total) * 100) : 0}%)
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
