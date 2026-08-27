"use client";

import { useId, useMemo, useState } from "react";

export type YearMonthRow = { year: number; month: number; entree: number; sortie: number };

const MOIS_COURTS = [
  "Jan",
  "Fev",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aou",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Meme 8 teintes categorielles que le reste de l'app (validees CVD - voir
// skill dataviz), assignees par ANNEE dans l'ordre chronologique de TOUTES
// les annees connues (pas seulement celles cochees) : une annee garde
// toujours la meme couleur qu'on en selectionne 2 ou 6, jamais de
// repeinture des survivants quand le filtre change.
const CATEGORICAL_SLOTS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function niceMax(max: number) {
  if (max <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

export function StatistiqueChart({ rows }: { rows: YearMonthRow[] }) {
  const gradientId = useId();
  const allYears = useMemo(
    () => [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b),
    [rows]
  );
  const colorByYear = useMemo(() => {
    const map = new Map<number, string>();
    allYears.forEach((year, index) => {
      map.set(year, CATEGORICAL_SLOTS[index % CATEGORICAL_SLOTS.length]);
    });
    return map;
  }, [allYears]);

  const [selectedYears, setSelectedYears] = useState<number[]>(() => allYears.slice(-2));
  const [showEntree, setShowEntree] = useState(true);
  const [showSortie, setShowSortie] = useState(true);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  function toggleYear(year: number) {
    setSelectedYears((current) =>
      current.includes(year) ? current.filter((y) => y !== year) : [...current, year].sort((a, b) => a - b)
    );
  }

  const byYearMonth = useMemo(() => {
    const map = new Map<string, YearMonthRow>();
    for (const row of rows) map.set(`${row.year}-${row.month}`, row);
    return map;
  }, [rows]);

  function valueFor(year: number, month: number, kind: "entree" | "sortie") {
    return byYearMonth.get(`${year}-${month}`)?.[kind] ?? 0;
  }

  const series = useMemo(() => {
    const list: { year: number; kind: "entree" | "sortie"; color: string; values: number[] }[] = [];
    for (const year of selectedYears) {
      if (showEntree) {
        list.push({
          year,
          kind: "entree",
          color: colorByYear.get(year) ?? CATEGORICAL_SLOTS[0],
          values: Array.from({ length: 12 }, (_, i) => valueFor(year, i + 1, "entree")),
        });
      }
      if (showSortie) {
        list.push({
          year,
          kind: "sortie",
          color: colorByYear.get(year) ?? CATEGORICAL_SLOTS[0],
          values: Array.from({ length: 12 }, (_, i) => valueFor(year, i + 1, "sortie")),
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYears, showEntree, showSortie, colorByYear, byYearMonth]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const s of series) for (const v of s.values) max = Math.max(max, v);
    return niceMax(max);
  }, [series]);

  // Geometrie du graphique - marge fixe pour l'axe Y a gauche et les
  // etiquettes de mois en bas.
  const width = 900;
  const height = 340;
  const marginLeft = 56;
  // Assez large pour l'etiquette de fin de ligne ("2025 Ent.") sans qu'elle
  // deborde du viewBox.
  const marginRight = 74;
  const marginTop = 16;
  const marginBottom = 32;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  function xFor(monthIndex: number) {
    return marginLeft + (monthIndex / 11) * plotWidth;
  }
  function yFor(value: number) {
    return marginTop + plotHeight - (value / maxValue) * plotHeight;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction));

  // Ordre chronologique croissant - les annees sont maintenant des colonnes
  // (gauche = plus ancienne), plus naturel a lire que l'inverse.
  const pivotYears = [...allYears].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Annees</p>
          <div className="flex flex-wrap gap-2">
            {allYears.map((year) => {
              const active = selectedYears.includes(year);
              const color = colorByYear.get(year) ?? CATEGORICAL_SLOTS[0];
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => toggleYear(year)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "border-transparent text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                  style={active ? { backgroundColor: color } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: active ? "#ffffff" : color }}
                  />
                  {year}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mouvement</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowEntree((v) => !v)}
              aria-pressed={showEntree}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                showEntree
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Entree (trait plein)
            </button>
            <button
              type="button"
              onClick={() => setShowSortie((v) => !v)}
              aria-pressed={showSortie}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                showSortie
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Sortie (pointille)
            </button>
          </div>
        </div>
      </div>

      {series.length === 0 ? (
        <p className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          Choisis au moins une annee et un mouvement (Entree / Sortie) pour afficher le graphique.
        </p>
      ) : (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            role="img"
            aria-label="Entree et sortie mensuelles par annee"
            onMouseLeave={() => setHoverMonth(null)}
          >
            <defs>
              <clipPath id={gradientId}>
                <rect x={marginLeft} y={marginTop} width={plotWidth} height={plotHeight} />
              </clipPath>
            </defs>

            {/* Gridlines horizontales (axe Y) - hairline, recessives */}
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={marginLeft}
                  x2={width - marginRight}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="#e1e0d9"
                  strokeWidth={1}
                />
                <text
                  x={marginLeft - 10}
                  y={yFor(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-500"
                  fontSize={11}
                >
                  {formatNumber(tick)}
                </text>
              </g>
            ))}

            {/* Axe X - etiquettes des mois en bas */}
            {MOIS_COURTS.map((label, index) => (
              <text
                key={label}
                x={xFor(index)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500"
                fontSize={11}
              >
                {label}
              </text>
            ))}

            {/* Curseur vertical suivant le mois survole */}
            {hoverMonth !== null ? (
              <line
                x1={xFor(hoverMonth)}
                x2={xFor(hoverMonth)}
                y1={marginTop}
                y2={marginTop + plotHeight}
                stroke="#c3c2b7"
                strokeWidth={1}
              />
            ) : null}

            <g clipPath={`url(#${gradientId})`}>
              {series.map((s) => (
                <polyline
                  key={`${s.year}-${s.kind}`}
                  points={s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.kind === "sortie" ? "6 4" : undefined}
                />
              ))}
            </g>

            {/* Points de donnees, toujours visibles (pas seulement au
                survol) - juste le point colore, aucun chiffre sur le
                graphique lui-meme (demande explicite : les chiffres
                permanents se superposaient/flottaient sur des points vides
                selon les series affichees). La valeur, le mouvement
                (Entree/Sortie) et l'annee se lisent uniquement au survol
                d'un mois, via l'infobulle plus bas. */}
            {series.map((s) =>
              s.values.map((v, i) => {
                if (v <= 0) return null;
                const isHovered = hoverMonth === i;
                return (
                  <circle
                    key={`${s.year}-${s.kind}-${i}`}
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={isHovered ? 4 : 3}
                    fill={s.color}
                    stroke="#fcfcfb"
                    strokeWidth={2}
                  />
                );
              })
            )}

            {/* Cible de survol (zone > au marqueur visible) */}
            {MOIS_COURTS.map((_, monthIndex) => (
              <rect
                key={monthIndex}
                x={xFor(monthIndex) - plotWidth / 24}
                y={marginTop}
                width={plotWidth / 12}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHoverMonth(monthIndex)}
              />
            ))}
          </svg>

          {/* Legende - toujours presente (>= 2 series) : couleur = annee, trait = mouvement */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
            {series.map((s) => (
              <div key={`${s.year}-${s.kind}`} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <svg width="16" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="16"
                    y2="4"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.kind === "sortie" ? "4 3" : undefined}
                  />
                </svg>
                {s.year} - {s.kind === "entree" ? "Entree" : "Sortie"}
              </div>
            ))}
          </div>

          {/* Infobulle - le mois survole, toutes les series a cette date */}
          {hoverMonth !== null ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="mb-1 font-semibold text-slate-800">{MOIS_COURTS[hoverMonth]}</p>
              <div className="grid gap-1">
                {series.map((s) => (
                  <div key={`${s.year}-${s.kind}-tip`} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-slate-500">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.year} - {s.kind === "entree" ? "Entree" : "Sortie"}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatNumber(s.values[hoverMonth])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tableaux pivot (annee x mois) - la version "table" du graphique,
          toujours visible - filtres par le meme Entree/Sortie que le
          graphique. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {showEntree ? (
          <PivotTable
            title="Entree par mois"
            years={pivotYears}
            valueFor={(year, month) => valueFor(year, month, "entree")}
            accentClassName="text-emerald-700"
          />
        ) : null}
        {showSortie ? (
          <PivotTable
            title="Sortie par mois"
            years={pivotYears}
            valueFor={(year, month) => valueFor(year, month, "sortie")}
            accentClassName="text-red-700"
          />
        ) : null}
      </div>
    </div>
  );
}

function PivotTable({
  title,
  years,
  valueFor,
  accentClassName,
}: {
  title: string;
  years: number[];
  valueFor: (year: number, month: number) => number;
  accentClassName: string;
}) {
  // Mois en ligne (12 lignes fixes), annees en colonne - une seule table
  // couvrant toutes les annees connues (pas seulement celles cochees dans
  // le graphique au-dessus).
  const yearTotals = years.map((year) =>
    Array.from({ length: 12 }, (_, i) => valueFor(year, i + 1)).reduce((sum, v) => sum + v, 0)
  );
  const grandTotal = yearTotals.reduce((sum, v) => sum + v, 0);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Mois</th>
              {years.map((year) => (
                <th key={year} className="px-3 py-2 font-semibold">
                  {year}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {MOIS_COURTS.map((label, monthIndex) => {
              const yearValues = years.map((year) => valueFor(year, monthIndex + 1));
              const total = yearValues.reduce((sum, v) => sum + v, 0);
              return (
                <tr key={label} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-left font-semibold text-slate-900">{label}</td>
                  {yearValues.map((v, i) => (
                    <td key={years[i]} className={`px-3 py-2 tabular-nums ${v > 0 ? accentClassName : "text-slate-300"}`}>
                      {v > 0 ? formatNumber(v) : "-"}
                    </td>
                  ))}
                  <td className="px-3 py-2 font-bold tabular-nums text-slate-900">{formatNumber(total)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-3 py-2 text-left font-bold text-slate-900">Total</td>
              {yearTotals.map((total, i) => (
                <td key={years[i]} className="px-3 py-2 font-bold tabular-nums text-slate-900">
                  {formatNumber(total)}
                </td>
              ))}
              <td className="px-3 py-2 font-bold tabular-nums text-slate-900">{formatNumber(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
