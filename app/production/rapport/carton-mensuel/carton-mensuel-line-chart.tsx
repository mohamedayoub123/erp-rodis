"use client";

import { useRef, useState } from "react";

type Series = {
  key: string;
  label: string;
  color: string;
  values: number[];
  // Valeur reellement affichee (infobulle + dernier point) si differente de
  // celle utilisee pour la position sur le graphe - ex: nb carton fabrique
  // trace divise par 100 pour rester sur le meme axe que les couts, mais
  // affiche en vrai (x100) au survol.
  displayValues?: number[];
};

const WIDTH = 720;
const HEIGHT = 320;
const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 26;
const PAD_BOTTOM = 40;
const TOOLTIP_WIDTH = 190;
const HIT_RADIUS = 16;

function displayValueOf(serie: Series, index: number) {
  return serie.displayValues ? serie.displayValues[index] : serie.values[index];
}

// Evolution mensuelle commande vs fabrique, meme axe Y (les 2 en nombre de
// cartons) - SVG fait maison (pas de bibliotheque de graphiques dans ce
// projet), meme motif que TestLaboLineChart (app/qualite/rapport). Palette
// validee (dataviz skill) : #d97706 (commande, meme ambre que le tableau)
// vs #0284c7 (fabrique, meme bleu que le tableau) - ΔE normal-vision 30.6,
// tous les checks passent.
//
// Survol point par point (pas un chiffre fixe sur chaque point, ni toutes
// les series a la fois) : teste avec 7 series (Graphe Cout par Carton), un
// chiffre fixe sur chaque point se chevauchait, et une infobulle listant
// toutes les series a la fois etait trop chargee - le point le plus proche
// de la souris affiche seulement sa propre valeur.
export function CartonMensuelLineChart({ months, series }: { months: string[]; series: Series[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ seriesIndex: number; pointIndex: number } | null>(null);

  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function xFor(index: number) {
    if (months.length <= 1) return PAD_LEFT + plotWidth / 2;
    return PAD_LEFT + (index / (months.length - 1)) * plotWidth;
  }

  function yFor(value: number) {
    return PAD_TOP + plotHeight - (value / maxValue) * plotHeight;
  }

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || months.length === 0) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());

    let bestSeriesIndex = -1;
    let bestPointIndex = -1;
    let bestDistance = Infinity;
    series.forEach((serie, seriesIndex) => {
      serie.values.forEach((value, pointIndex) => {
        const dx = local.x - xFor(pointIndex);
        const dy = local.y - yFor(value);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSeriesIndex = seriesIndex;
          bestPointIndex = pointIndex;
        }
      });
    });

    if (bestSeriesIndex >= 0 && bestDistance <= HIT_RADIUS) {
      setHovered({ seriesIndex: bestSeriesIndex, pointIndex: bestPointIndex });
    } else {
      setHovered(null);
    }
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction));

  const hoveredSerie = hovered ? series[hovered.seriesIndex] : null;
  const tooltipHeight = 46;
  const tooltipOverflowsRight =
    hovered && xFor(hovered.pointIndex) + 10 + TOOLTIP_WIDTH > WIDTH - PAD_RIGHT;
  const tooltipX = hovered
    ? tooltipOverflowsRight
      ? xFor(hovered.pointIndex) - 10 - TOOLTIP_WIDTH
      : xFor(hovered.pointIndex) + 10
    : 0;
  const tooltipYRaw = hoveredSerie && hovered ? yFor(hoveredSerie.values[hovered.pointIndex]) - tooltipHeight / 2 : 0;
  const tooltipY = Math.min(Math.max(tooltipYRaw, PAD_TOP - 4), HEIGHT - PAD_BOTTOM - tooltipHeight + 4);

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Evolution mensuelle</h2>

      {months.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun programme pour le moment.</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full"
            role="img"
            aria-label="Evolution mensuelle"
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={yFor(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {tick}
                </text>
              </g>
            ))}

            {months.map((month, index) => (
              <text
                key={month}
                x={xFor(index)}
                y={HEIGHT - PAD_BOTTOM + 20}
                textAnchor="middle"
                className="fill-slate-500 text-[9px] font-semibold"
              >
                {month}
              </text>
            ))}

            {series.map((serie, seriesIndex) => {
              const points = serie.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
              const lastIndex = serie.values.length - 1;
              return (
                <g key={serie.key}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke={serie.color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {serie.values.map((value, index) => {
                    const isHovered =
                      hovered && hovered.seriesIndex === seriesIndex && hovered.pointIndex === index;
                    return (
                      <circle
                        key={index}
                        cx={xFor(index)}
                        cy={yFor(value)}
                        r={isHovered ? 5.5 : 3.5}
                        fill={serie.color}
                        stroke="#fff"
                        strokeWidth={isHovered ? 2 : 1.5}
                      />
                    );
                  })}
                  {lastIndex >= 0 ? (
                    <text
                      x={xFor(lastIndex) + 6}
                      y={yFor(serie.values[lastIndex])}
                      dominantBaseline="middle"
                      className="text-[11px] font-bold"
                      fill={serie.color}
                    >
                      {Math.round(displayValueOf(serie, lastIndex)).toLocaleString("fr-FR")}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {hovered && hoveredSerie ? (
              <foreignObject x={tooltipX} y={tooltipY} width={TOOLTIP_WIDTH} height={tooltipHeight} pointerEvents="none">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
                  <p className="mb-0.5 truncate font-bold" style={{ color: hoveredSerie.color }}>
                    {hoveredSerie.label}
                  </p>
                  <p className="text-slate-600">
                    {months[hovered.pointIndex]} :{" "}
                    <span className="font-semibold text-slate-900">
                      {Math.round(displayValueOf(hoveredSerie, hovered.pointIndex)).toLocaleString("fr-FR")}
                    </span>
                  </p>
                </div>
              </foreignObject>
            ) : null}

            <rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              pointerEvents="all"
              onMouseMove={handleMove}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "crosshair" }}
            />
          </svg>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {series.map((serie) => (
              <li key={serie.key} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: serie.color }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-700">{serie.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
